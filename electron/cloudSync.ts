/**
 * Cloud Sync — Push/Pull NGUYÊN file session (.db) qua Cloudflare Worker + R2 do chủ dự án tự deploy
 * (code Worker ở cloud/worker/). Đây là lời gọi network DUY NHẤT trong app — app vốn hoàn toàn
 * offline, tính năng này là ngoại lệ CHỦ Ý: chỉ chạy khi người dùng tự bấm, không thêm dependency
 * (`fetch` global), KHÔNG đồng bộ từng dòng/tự gộp dữ liệu. Xem docs/architecture/cloud-sync.md.
 *
 * Nguyên tắc an toàn (giống luồng "Open" file .db có sẵn): Pull KHÔNG BAO GIỜ ghi đè file có sẵn trong data/ — file
 * tải về lưu dưới tên tránh trùng (uniquePath()), việc "đây có phải cùng 1 session không / giữ bản nào"
 * nhường cho rescan()/SessionConflictDialog.tsx. Push chỉ ĐỌC session (VACUUM INTO ra file tạm), không
 * bị Session Lock chặn — đẩy 1 session đã khoá lên cloud làm bản lưu là use-case bình thường.
 *
 * So sánh local ↔ cloud (status()) dựa trên contentHash của bản chụp VACUUM INTO — xem contentHash().
 */
import fs from "fs";
import os from "os";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { app } from "electron";
import { DATA_DIR, fileNameFor, getDb, listSessionFiles, snapshotSession, uniquePath } from "./db";

const SETTINGS_FILE = path.join(DATA_DIR, ".cloud-sync.json");

export interface CloudSettings {
  workerUrl: string;
  readCode: string;
  writeToken: string;
  // "<sessionId>/<file>" -> tên đã lưu trong data/ — chống Pull lặp 1 bản tạo thêm -2, -3...
  pulledVersions: Record<string, string>;
  // sessionId -> contentHash của bản mà local và cloud GIỐNG NHAU lần gần nhất (sau Push/Pull hoặc lúc
  // status() thấy khớp). Là "gốc chung" để biết bên nào đã đổi kể từ đó — xem status().
  syncBase: Record<string, string>;
}

export interface CloudSpace {
  name: string;
  createdAt: string;
  role: "read" | "write";
}

export interface CloudVersion {
  sessionId: string;
  file: string; // "<pushedAtMs>.db"
  size: number;
  pushedAt: string;
  sessionName: string;
  modifiedAt: string;
  sha256: string; // contentHash của file — xem contentHash()
  appVersion: string;
  participantCount: number;
  pulledAs?: string; // đã Pull bản này về data/ (file còn đúng chỗ) — app tự thêm, không phải từ Worker
}

export interface CloudPushResult {
  sessionId: string;
  name: string;
  status: "pushed" | "unchanged" | "error";
  message?: string;
}

// Trạng thái 1 session khi so local với cloud — renderer dựa vào đây để gợi ý Push hay Sync.
export type CloudSyncState =
  | "in-sync" // local giống hệt bản mới nhất trên cloud
  | "local-only" // chưa từng Push → gợi ý Push
  | "cloud-only" // chưa có trên máy này → gợi ý Sync
  | "local-newer" // local đã sửa, cloud vẫn là bản gốc chung → gợi ý Push
  | "cloud-newer" // cloud có bản mới hơn, local chưa sửa gì → gợi ý Sync
  | "diverged"; // cả 2 bên cùng đổi (hoặc không rõ gốc chung) → người dùng tự chọn

export interface CloudSessionStatus {
  sessionId: string;
  name: string;
  state: CloudSyncState;
  newer?: "local" | "cloud"; // chỉ với "diverged": bên nào sửa sau (theo thời điểm sửa file), để gợi ý
  local?: { modifiedAt: string; closed: boolean };
  versions: CloudVersion[]; // mọi bản trên cloud của session này, mới nhất trước (rỗng nếu local-only)
}

export type CloudResult<T> = { error: string } | T;

const EMPTY_SETTINGS: CloudSettings = { workerUrl: "", readCode: "", writeToken: "", pulledVersions: {}, syncBase: {} };

function isRecord(x: unknown): x is Record<string, string> {
  return typeof x === "object" && x !== null;
}

// Lưu trong data/ giống .tab-order.json — đi theo bản portable sang máy khác. Gồm cả writeToken
// (plaintext): ai cầm được data/ là Push được vào Space đó. Máy chỉ cần Pull thì để trống writeToken.
export function readCloudSettings(): CloudSettings {
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    return {
      workerUrl: typeof parsed?.workerUrl === "string" ? parsed.workerUrl : "",
      readCode: typeof parsed?.readCode === "string" ? parsed.readCode : "",
      writeToken: typeof parsed?.writeToken === "string" ? parsed.writeToken : "",
      pulledVersions: isRecord(parsed?.pulledVersions) ? parsed.pulledVersions : {},
      syncBase: isRecord(parsed?.syncBase) ? parsed.syncBase : {},
    };
  } catch {
    return { ...EMPTY_SETTINGS };
  }
}

function writeCloudSettings(settings: CloudSettings) {
  const tmp = `${SETTINGS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), "utf8");
  fs.renameSync(tmp, SETTINGS_FILE);
}

// Đọc-sửa-ghi lại settings (luôn đọc bản mới nhất trên đĩa, tránh ghi đè thay đổi của lời gọi khác).
function updateCloudSettings(fn: (s: CloudSettings) => void) {
  const s = readCloudSettings();
  fn(s);
  writeCloudSettings(s);
}

function normalizeWorkerUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    // http chỉ cho `wrangler dev` chạy local — mọi chỗ khác bắt buộc https (token đi trong header).
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    return trimmed;
  } catch {
    return null;
  }
}

class CloudError extends Error {}

// Timeout mặc định cho lời gọi JSON nhỏ (status/connect/list/start-upload/complete-upload...) — phản
// hồi bình thường phải ra ngay, 30s đủ để bắt treo thật. RIÊNG lời gọi PUT 1 phần file (uploadFile)
// mang theo cả payload vài MB, nên fetch() CHỈ resolve sau khi gửi xong hết phần đó — mạng upload chậm
// (phổ biến ở Việt Nam, download nhanh nhưng upload rất chậm) khiến 1 phần 5MB tự nó có thể mất hơn
// 30s dù vẫn đang truyền bình thường, không phải treo (bug thật đã gặp: báo "Server not responding"
// giữa lúc đang push file nặng qua mạng chậm) — dùng timeout rộng hơn hẳn cho riêng lời gọi đó.
const REQUEST_TIMEOUT_MS = 30_000;
// 0 = không timeout tự động (xem giải thích ở call()).
const UPLOAD_PART_TIMEOUT_MS = 0;

// Gọi Worker, trả lỗi đọc được cho người dùng thay vì throw thô. `token` = readCode hoặc writeToken.
// `cancelSignal` (tuỳ chọn): Push/Pull cả lượt bị người dùng bấm Cancel (đóng modal lúc đang chạy, xem
// main.ts "cloud:cancel") — ngoài ra MỌI lời gọi mang payload NHỎ (JSON, status/connect/list...) tự có
// timeout riêng (mặc định REQUEST_TIMEOUT_MS), tránh treo vô thời hạn nếu mạng rớt kiểu "connection mở
// nhưng không bao giờ có response" (lỗi mất mạng/DNS bình thường thì fetch đã tự throw ngay, catch bên
// dưới xử lý rồi — timeout chỉ cứu đúng trường hợp treo im lặng này).
// `timeoutMs = 0`: KHÔNG đặt timeout tự động — dùng cho PUT từng phần upload (payload vài MB, xem
// uploadFile). Đã xác nhận bằng test thật: Cloudflare buffer nguyên request body trước khi đưa vào
// Worker (github.com/signalapp/tus-server/issues/1, hành vi đã biết của *.workers.dev, Cloudflare
// khuyến nghị custom domain cho production — chưa làm ở đây), khiến 1 phần có thể "treo" rất lâu (từng
// thấy > 15 phút) dù CUỐI CÙNG vẫn qua được nếu đợi đủ — y hệt lúc CHƯA có timeout nào, Push vẫn chạy
// xong dù chậm. Timeout cố định (kể cả vài phút) sẽ cắt ngang oan 1 việc vẫn đang tiến triển bình
// thường. An toàn dựa vào Cancel thủ công (người dùng tự bấm) thay vì đoán 1 con số timeout cố định.
async function call(
  settings: CloudSettings,
  token: string,
  pathname: string,
  init: RequestInit = {},
  cancelSignal?: AbortSignal,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<Response> {
  if (cancelSignal?.aborted) throw new CloudError("Cancelled.");
  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  const onCancel = () => controller.abort();
  cancelSignal?.addEventListener("abort", onCancel);
  let res: Response;
  try {
    res = await fetch(`${settings.workerUrl}${pathname}`, {
      ...init,
      signal: controller.signal,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    if (cancelSignal?.aborted) throw new CloudError("Cancelled.");
    if (controller.signal.aborted) {
      const secs = timeoutMs / 1000;
      const label = secs >= 60 ? `${Math.round(secs / 60)} min` : `${secs}s`;
      throw new CloudError(`Server not responding (timed out after ${label}). Check your internet connection.`);
    }
    throw new CloudError(`Network error reaching the cloud server: ${(err as Error).message}. Check your internet connection and the server URL.`);
  } finally {
    clearTimeout(timer);
    cancelSignal?.removeEventListener("abort", onCancel);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new CloudError(body?.error ? `${body.error} (HTTP ${res.status})` : `Cloud server error (HTTP ${res.status})`);
  }
  return res;
}

async function guard<T>(fn: () => Promise<T>): Promise<CloudResult<T>> {
  try {
    return await fn();
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// Mã dùng để ĐỌC (list/pull): ưu tiên readCode, không có thì writeToken (Worker cho writeToken đọc luôn).
function readToken(settings: CloudSettings): string {
  return settings.readCode.trim() || settings.writeToken.trim();
}

function requireConnected(settings: CloudSettings) {
  if (!settings.workerUrl || !readToken(settings)) throw new CloudError("Cloud Sync isn't set up — connect in Settings first.");
}

/** Kiểm tra URL + mã với Worker (GET /v1/space), đúng thì lưu lại vào data/.cloud-sync.json. */
export function connect(data: { workerUrl: string; readCode: string; writeToken: string }): Promise<CloudResult<CloudSpace>> {
  return guard(async () => {
    const workerUrl = normalizeWorkerUrl(data.workerUrl);
    if (!workerUrl) throw new CloudError("Invalid server URL — it should look like https://lucky-draw-sync.<name>.workers.dev");
    const prev = readCloudSettings();
    const sameServer = prev.workerUrl === workerUrl;
    const next: CloudSettings = {
      workerUrl,
      readCode: data.readCode.trim(),
      writeToken: data.writeToken.trim(),
      pulledVersions: sameServer ? prev.pulledVersions : {},
      syncBase: sameServer ? prev.syncBase : {},
    };
    if (!readToken(next)) throw new CloudError("Enter an access code (read code or write token).");

    const space = (await (await call(next, readToken(next), "/v1/space")).json()) as CloudSpace;
    // Có nhập writeToken thì kiểm tra luôn nó — để lỗi hiện ngay lúc Connect, không phải lúc Push. Bắt
    // riêng lỗi của bước này (KHÁC lỗi đọc readCode ở trên) — nếu không, 1 write token sai sẽ báo lỗi
    // chung chung "Invalid access code" dù readCode phía trên hoàn toàn đúng, gây hiểu nhầm đã gõ sai
    // readCode (bug thật đã gặp: readCode đúng, chỉ writeToken sai, nhưng thông báo không phân biệt được).
    if (next.writeToken) {
      let w: CloudSpace;
      try {
        w = (await (await call(next, next.writeToken, "/v1/space")).json()) as CloudSpace;
      } catch (err) {
        throw new CloudError(
          `The read code above works, but the write token doesn't: ${(err as Error).message}. Clear the write token field if this computer only needs to Pull.`
        );
      }
      if (w.role !== "write") throw new CloudError("The write token field contains a read-only code.");
      space.role = "write";
    }
    writeCloudSettings(next);
    return space;
  });
}

export function disconnect() {
  writeCloudSettings({ ...EMPTY_SETTINGS });
}

async function fetchVersions(settings: CloudSettings, cancelSignal?: AbortSignal): Promise<CloudVersion[]> {
  const res = await call(settings, readToken(settings), "/v1/sessions", {}, cancelSignal);
  return ((await res.json()) as { versions: CloudVersion[] }).versions;
}

/* ---------------- Hash nội dung ---------------- */

/**
 * sha256 của file .db nhưng BỎ QUA 4 byte schema cookie (offset 40–43 của header SQLite): mỗi lần
 * VACUUM INTO tăng giá trị này lên 1, nên chụp lại 1 file vừa Pull về (cùng nội dung) vẫn ra byte khác
 * đúng ở đây — đã thử trên dữ liệu thật, mọi byte còn lại giống hệt. Dùng cho MỌI so sánh + metadata
 * sha256 gửi lên cloud.
 */
function contentHash(buffer: Buffer): string {
  const h = createHash("sha256");
  if (buffer.length < 44) return h.update(buffer).digest("hex");
  h.update(buffer.subarray(0, 40));
  h.update(Buffer.alloc(4));
  h.update(buffer.subarray(44));
  return h.digest("hex");
}

// contentHash bản chụp hiện tại của từng session — cache theo file + mtime, chỉ chụp lại (VACUUM INTO,
// đồng bộ, vài trăm ms với session nặng) khi file thật sự vừa được ghi hoặc session đổi sang file khác
// (sau SessionConflictDialog).
const localHashCache = new Map<string, { file: string; mtimeMs: number; hash: string }>();

function snapshotToBuffer(sessionId: string): { buffer: Buffer; modifiedAt: string } {
  const tmp = path.join(os.tmpdir(), `lucky-draw-snap-${randomUUID()}.db`);
  try {
    const { modifiedAt } = snapshotSession(sessionId, tmp);
    return { buffer: fs.readFileSync(tmp), modifiedAt };
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function localHash(sessionId: string, file: string, mtimeMs: number): string {
  const cached = localHashCache.get(sessionId);
  if (cached && cached.file === file && cached.mtimeMs === mtimeMs) return cached.hash;
  const hash = contentHash(snapshotToBuffer(sessionId).buffer);
  localHashCache.set(sessionId, { file, mtimeMs, hash });
  return hash;
}

/* ---------------- So sánh local ↔ cloud ---------------- */

/**
 * Gộp session local (kể cả tab đang Close) với session trên cloud theo sessionId, xếp loại từng cái:
 * 1. Chỉ 1 bên có → local-only / cloud-only.
 * 2. Local khớp bản mới nhất → in-sync; khớp 1 bản CŨ hơn trên cloud → cloud-newer (local chưa sửa gì
 *    kể từ bản đó, Sync về an toàn).
 * 3. Còn lại so với syncBase (bản 2 bên giống nhau lần cuối): chỉ local đổi → local-newer, chỉ cloud
 *    đổi → cloud-newer, cả 2 đổi / không có gốc → diverged (kèm `newer` theo thời điểm sửa file).
 * Chỉ ĐỌC + ghi syncBase; không tự Push/Pull gì.
 */
export function status(): Promise<CloudResult<{ sessions: CloudSessionStatus[]; canWrite: boolean }>> {
  return guard(async () => {
    const settings = readCloudSettings();
    requireConnected(settings);
    const versions = await fetchVersions(settings);

    const byId = new Map<string, CloudVersion[]>();
    for (const v of versions) {
      const saved = settings.pulledVersions[`${v.sessionId}/${v.file}`];
      if (saved && fs.existsSync(path.join(DATA_DIR, saved))) v.pulledAs = saved;
      if (!byId.has(v.sessionId)) byId.set(v.sessionId, []);
      byId.get(v.sessionId)!.push(v);
    }

    const out: CloudSessionStatus[] = [];
    const newBase: Record<string, string> = {};
    const locals = listSessionFiles();

    for (const l of locals) {
      const cloud = byId.get(l.id) ?? [];
      byId.delete(l.id);
      const local = { modifiedAt: new Date(l.mtimeMs).toISOString(), closed: l.closed };
      const row: CloudSessionStatus = { sessionId: l.id, name: l.name, state: "local-only", local, versions: cloud };
      out.push(row);
      if (cloud.length === 0) continue;

      const hash = localHash(l.id, l.file, l.mtimeMs);
      const latest = cloud[0];
      const base = settings.syncBase[l.id];
      if (hash === latest.sha256) {
        row.state = "in-sync";
        newBase[l.id] = hash;
      } else if (cloud.some((v) => v.sha256 === hash) || (base && hash === base)) {
        row.state = "cloud-newer";
      } else if (base && latest.sha256 === base) {
        row.state = "local-newer";
      } else {
        row.state = "diverged";
        row.newer = local.modifiedAt > latest.modifiedAt ? "local" : "cloud";
      }
    }

    for (const [sessionId, cloud] of byId) {
      out.push({ sessionId, name: cloud[0].sessionName || sessionId, state: "cloud-only", versions: cloud });
    }

    if (Object.keys(newBase).length) updateCloudSettings((s) => Object.assign(s.syncBase, newBase));
    return { sessions: out, canWrite: !!settings.writeToken };
  });
}

/* ---------------- Push ---------------- */

export type ProgressFn = (sentOrReceived: number, total: number) => void;

// R2 multipart yêu cầu mỗi phần (trừ phần cuối) tối thiểu 5MB — tự chia theo mốc này thay vì dùng
// nguyên partSize 32MB Worker gợi ý, để có nhiều mốc báo tiến độ hơn cho 1 file vài chục MB (phổ biến
// với session có nhiều ảnh nhúng trong Landing Builder) thay vì 1 khối duy nhất không báo được gì cho
// tới khi xong hẳn.
const CLIENT_PART_SIZE = 5 * 1024 * 1024;

// R2 multipart bắt buộc mỗi phần (trừ phần cuối) tối thiểu 5MB nên KHÔNG thể giảm CLIENT_PART_SIZE
// xuống nhỏ hơn để né — đã xác nhận qua test thật: Cloudflare buffer NGUYÊN request body trước khi đưa
// vào Worker (xem github.com/signalapp/tus-server/issues/1), khiến PUT 1 phần 5MB có thể "stall" rất
// lâu (từng thấy > 15 phút) dù CUỐI CÙNG vẫn qua được nếu đợi đủ — hành vi đã biết của *.workers.dev
// (Cloudflare khuyến nghị custom domain cho production, chưa làm ở đây). Vì call() không còn tự timeout
// cho riêng lời gọi này nữa (xem UPLOAD_PART_TIMEOUT_MS), retry ở đây chỉ còn ý nghĩa cho lỗi mạng THẬT
// (đứt kết nối giữa chừng) — không retry lỗi Cancel hay lỗi server trả về rõ ràng như validation.
const MAX_PART_RETRIES = 3;
const PART_RETRY_BACKOFF_MS = 5_000;

async function uploadFile(
  settings: CloudSettings,
  buffer: Buffer,
  meta: Record<string, string>,
  onProgress?: ProgressFn,
  cancelSignal?: AbortSignal
) {
  const token = settings.writeToken;
  const json = { "Content-Type": "application/json" };
  const start = (await (
    await call(settings, token, "/v1/uploads", { method: "POST", headers: json, body: JSON.stringify(meta) }, cancelSignal)
  ).json()) as { key: string; uploadId: string; partSize: number };
  const keyHeader = { "X-Upload-Key": start.key };
  const base = `/v1/uploads/${encodeURIComponent(start.uploadId)}`;
  const partSize = Math.min(CLIENT_PART_SIZE, start.partSize);

  try {
    const parts: { partNumber: number; etag: string }[] = [];
    onProgress?.(0, buffer.length);
    for (let offset = 0, n = 1; offset < buffer.length; offset += partSize, n++) {
      // Copy sang Uint8Array thường — type BodyInit của fetch không nhận Buffer trực tiếp.
      const chunk = new Uint8Array(buffer.subarray(offset, offset + partSize));
      let res: Response | undefined;
      for (let attempt = 1; ; attempt++) {
        try {
          res = await call(
            settings,
            token,
            `${base}/parts/${n}`,
            { method: "PUT", headers: keyHeader, body: chunk },
            cancelSignal,
            UPLOAD_PART_TIMEOUT_MS
          );
          break;
        } catch (err) {
          const msg = (err as Error).message;
          const retriable = /timed out|Network error/.test(msg);
          if (!retriable || attempt >= MAX_PART_RETRIES || cancelSignal?.aborted) throw err;
          await new Promise((r) => setTimeout(r, attempt * PART_RETRY_BACKOFF_MS));
        }
      }
      parts.push((await res.json()) as { partNumber: number; etag: string });
      onProgress?.(Math.min(offset + chunk.length, buffer.length), buffer.length);
    }
    await call(
      settings,
      token,
      `${base}/complete`,
      { method: "POST", headers: { ...keyHeader, ...json }, body: JSON.stringify({ parts }) },
      cancelSignal
    );
  } catch (err) {
    // Huỷ upload dở để R2 không giữ phần rác — lỗi khi huỷ thì bỏ qua, báo lỗi gốc. KHÔNG truyền
    // cancelSignal ở đây: nếu lỗi gốc chính là do Cancel thì signal đã abort, dọn dẹp vẫn phải chạy.
    await call(settings, token, base, { method: "DELETE", headers: keyHeader }).catch(() => undefined);
    throw err;
  }
}

/**
 * Push từng session lên cloud thành 1 BẢN MỚI (Worker giữ 10 bản gần nhất mỗi session). Bản giống hệt
 * bản mới nhất trên cloud thì bỏ qua, không tạo thêm bản trùng. 1 session lỗi không chặn các session
 * còn lại. Push thành công → syncBase = bản vừa đẩy.
 */
export function push(
  sessionIds: string[],
  onProgress?: (sessionId: string, sent: number, total: number) => void,
  cancelSignal?: AbortSignal
): Promise<CloudResult<{ results: CloudPushResult[] }>> {
  return guard(async () => {
    const settings = readCloudSettings();
    requireConnected(settings);
    if (!settings.writeToken) throw new CloudError("Pushing needs the write token — add it in Settings.");

    const latestSha = new Map<string, string>();
    for (const v of await fetchVersions(settings, cancelSignal)) if (!latestSha.has(v.sessionId)) latestSha.set(v.sessionId, v.sha256);

    const results: CloudPushResult[] = [];
    for (const sessionId of sessionIds) {
      // Cancel giữa lượt (đóng modal lúc đang Push) — dừng NGAY, không mở thêm session nào nữa. Session
      // đang upload dở lúc bấm Cancel thì tự rơi vào catch bên dưới (call() throw "Cancelled.").
      if (cancelSignal?.aborted) break;
      let name = sessionId;
      try {
        const db = getDb(sessionId);
        name = (db.prepare(`SELECT name FROM sessions WHERE id = ?`).get(sessionId) as { name: string }).name;
        const participantCount = (
          db.prepare(`SELECT COUNT(*) AS n FROM participants WHERE session_id = ? AND status != 'removed'`).get(sessionId) as { n: number }
        ).n;
        const { buffer, modifiedAt } = snapshotToBuffer(sessionId);
        const hash = contentHash(buffer);
        if (latestSha.get(sessionId) !== hash) {
          await uploadFile(
            settings,
            buffer,
            {
              sessionId,
              sessionName: name,
              modifiedAt,
              sha256: hash,
              appVersion: app.getVersion(),
              participantCount: String(participantCount),
            },
            onProgress && ((sent, total) => onProgress(sessionId, sent, total)),
            cancelSignal
          );
        }
        updateCloudSettings((s) => (s.syncBase[sessionId] = hash));
        results.push(
          latestSha.get(sessionId) === hash
            ? { sessionId, name, status: "unchanged", message: "Same as the latest version in the cloud" }
            : { sessionId, name, status: "pushed" }
        );
      } catch (err) {
        results.push({ sessionId, name, status: "error", message: (err as Error).message });
      }
    }
    return { results };
  });
}

/* ---------------- Pull ---------------- */

// Đọc body streaming thay vì res.arrayBuffer() 1 phát — để báo tiến độ tải (Content-Length so với số
// byte đã nhận) cho file vài chục MB, thay vì không có gì để báo tới tận lúc tải xong hẳn.
async function readBodyWithProgress(res: Response, onProgress?: ProgressFn, cancelSignal?: AbortSignal): Promise<Buffer> {
  const total = Number(res.headers.get("Content-Length") ?? 0);
  if (!res.body || !onProgress) return Buffer.from(await res.arrayBuffer());

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  onProgress(0, total);
  for (;;) {
    // Response đã nhận header xong nên signal gắn ở call() không còn theo dõi được nữa — tự kiểm tra
    // Cancel ở đây để dừng kịp lúc đang tải dở 1 file lớn, không phải đợi tải hết mới dừng được.
    if (cancelSignal?.aborted) {
      await reader.cancel().catch(() => undefined);
      throw new CloudError("Cancelled.");
    }
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(received, total || received);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

export interface CloudPullResult {
  sessionId: string;
  name: string;
  status: "pulled" | "already-pulled" | "error";
  savedAs?: string;
  message?: string;
}

/**
 * Tải về data/ TỪNG bản trong danh sách — KHÔNG ghi đè gì: tên file theo quy ước
 * `<tên>__<8 ký tự id>.db`, trùng thì uniquePath() thêm -2, -3... Trùng sessions.id với session đang
 * mở → SessionConflictDialog tự hiện. Đặt mtime = modifiedAt gốc để hộp thoại đó gợi ý đúng bản sửa
 * gần nhất (không phải bản vừa tải). 1 bản lỗi không chặn các bản còn lại trong cùng lượt — giống hệt
 * cách push() cô lập lỗi từng session, xem đó.
 */
export function pull(
  items: { sessionId: string; file: string }[],
  onProgress?: (sessionId: string, sent: number, total: number) => void,
  cancelSignal?: AbortSignal
): Promise<CloudResult<{ results: CloudPullResult[] }>> {
  return guard(async () => {
    const settings = readCloudSettings();
    requireConnected(settings);
    const versions = await fetchVersions(settings, cancelSignal);

    const results: CloudPullResult[] = [];
    for (const item of items) {
      // Cancel giữa lượt (đóng modal lúc đang Pull) — dừng NGAY, không tải thêm bản nào nữa.
      if (cancelSignal?.aborted) break;
      const version = versions.find((v) => v.sessionId === item.sessionId && v.file === item.file);
      const name = version?.sessionName || item.sessionId;
      try {
        const manifestKey = `${item.sessionId}/${item.file}`;
        const current = readCloudSettings(); // đọc lại mới nhất — có thể đã đổi do bản trước trong cùng lượt
        const previous = current.pulledVersions[manifestKey];
        if (previous && fs.existsSync(path.join(DATA_DIR, previous))) {
          results.push({ sessionId: item.sessionId, name, status: "already-pulled", savedAs: previous });
          continue;
        }
        if (!version) throw new CloudError("This version no longer exists in the cloud — refresh the list.");

        const res = await call(
          settings,
          readToken(settings),
          `/v1/objects/${encodeURIComponent(item.sessionId)}/${encodeURIComponent(item.file)}`,
          {},
          cancelSignal
        );
        const buffer = await readBodyWithProgress(
          res,
          onProgress && ((sent, total) => onProgress(item.sessionId, sent, total)),
          cancelSignal
        );
        const expected = res.headers.get("X-Sha256") || version.sha256;
        const hash = contentHash(buffer);
        if (expected && hash !== expected) {
          throw new CloudError("Downloaded file is corrupted (checksum mismatch) — try again.");
        }

        const dest = uniquePath(DATA_DIR, fileNameFor(version.sessionName || "Session", item.sessionId));
        // Ghi qua tên tạm rồi rename — rescan() lọc đúng đuôi .db nên không bao giờ thấy file đang tải dở.
        const tmp = `${dest}.downloading`;
        fs.writeFileSync(tmp, buffer);
        fs.renameSync(tmp, dest);
        const modified = new Date(version.modifiedAt);
        if (!Number.isNaN(modified.getTime())) fs.utimesSync(dest, modified, modified);

        const savedAs = path.basename(dest);
        // KHÔNG đặt syncBase ở đây: nếu máy đang có sẵn session này, file vừa tải chỉ là 1 BẢN KHÁC chờ
        // người dùng chọn ở SessionConflictDialog — bản đang dùng vẫn là bản cũ. status() tự ghi
        // syncBase khi thấy local khớp cloud (tức là người dùng đã chọn giữ bản vừa tải).
        updateCloudSettings((s) => (s.pulledVersions[manifestKey] = savedAs));
        results.push({ sessionId: item.sessionId, name, status: "pulled", savedAs });
      } catch (err) {
        results.push({ sessionId: item.sessionId, name, status: "error", message: (err as Error).message });
      }
    }
    return { results };
  });
}

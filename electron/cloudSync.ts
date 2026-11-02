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

// Gọi Worker, trả lỗi đọc được cho người dùng thay vì throw thô. `token` = readCode hoặc writeToken.
async function call(settings: CloudSettings, token: string, pathname: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${settings.workerUrl}${pathname}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new CloudError(`Network error reaching the cloud server: ${(err as Error).message}. Check your internet connection and the server URL.`);
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
    // Có nhập writeToken thì kiểm tra luôn nó — để lỗi hiện ngay lúc Connect, không phải lúc Push.
    if (next.writeToken) {
      const w = (await (await call(next, next.writeToken, "/v1/space")).json()) as CloudSpace;
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

async function fetchVersions(settings: CloudSettings): Promise<CloudVersion[]> {
  const res = await call(settings, readToken(settings), "/v1/sessions");
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

function rawHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
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

async function uploadFile(settings: CloudSettings, buffer: Buffer, meta: Record<string, string>) {
  const token = settings.writeToken;
  const json = { "Content-Type": "application/json" };
  const start = (await (
    await call(settings, token, "/v1/uploads", { method: "POST", headers: json, body: JSON.stringify(meta) })
  ).json()) as { key: string; uploadId: string; partSize: number };
  const keyHeader = { "X-Upload-Key": start.key };
  const base = `/v1/uploads/${encodeURIComponent(start.uploadId)}`;

  try {
    const parts: { partNumber: number; etag: string }[] = [];
    for (let offset = 0, n = 1; offset < buffer.length; offset += start.partSize, n++) {
      // Copy sang Uint8Array thường — type BodyInit của fetch không nhận Buffer trực tiếp.
      const chunk = new Uint8Array(buffer.subarray(offset, offset + start.partSize));
      const res = await call(settings, token, `${base}/parts/${n}`, { method: "PUT", headers: keyHeader, body: chunk });
      parts.push((await res.json()) as { partNumber: number; etag: string });
    }
    await call(settings, token, `${base}/complete`, {
      method: "POST",
      headers: { ...keyHeader, ...json },
      body: JSON.stringify({ parts }),
    });
  } catch (err) {
    // Huỷ upload dở để R2 không giữ phần rác — lỗi khi huỷ thì bỏ qua, báo lỗi gốc.
    await call(settings, token, base, { method: "DELETE", headers: keyHeader }).catch(() => undefined);
    throw err;
  }
}

/**
 * Push từng session lên cloud thành 1 BẢN MỚI (Worker giữ 10 bản gần nhất mỗi session). Bản giống hệt
 * bản mới nhất trên cloud thì bỏ qua, không tạo thêm bản trùng. 1 session lỗi không chặn các session
 * còn lại. Push thành công → syncBase = bản vừa đẩy.
 */
export function push(sessionIds: string[]): Promise<CloudResult<{ results: CloudPushResult[] }>> {
  return guard(async () => {
    const settings = readCloudSettings();
    requireConnected(settings);
    if (!settings.writeToken) throw new CloudError("Pushing needs the write token — add it in Settings.");

    const latestSha = new Map<string, string>();
    for (const v of await fetchVersions(settings)) if (!latestSha.has(v.sessionId)) latestSha.set(v.sessionId, v.sha256);

    const results: CloudPushResult[] = [];
    for (const sessionId of sessionIds) {
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
          await uploadFile(settings, buffer, {
            sessionId,
            sessionName: name,
            modifiedAt,
            sha256: hash,
            appVersion: app.getVersion(),
            participantCount: String(participantCount),
          });
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

/**
 * Tải 1 bản về data/ — KHÔNG ghi đè gì: tên file theo quy ước `<tên>__<8 ký tự id>.db`, trùng thì
 * uniquePath() thêm -2, -3... Trùng sessions.id với session đang mở → SessionConflictDialog tự hiện.
 * Đặt mtime = modifiedAt gốc để hộp thoại đó gợi ý đúng bản sửa gần nhất (không phải bản vừa tải).
 */
export function pull(data: { sessionId: string; file: string }): Promise<CloudResult<{ savedAs: string; alreadyPulled: boolean }>> {
  return guard(async () => {
    const settings = readCloudSettings();
    requireConnected(settings);
    const manifestKey = `${data.sessionId}/${data.file}`;
    const previous = settings.pulledVersions[manifestKey];
    if (previous && fs.existsSync(path.join(DATA_DIR, previous))) return { savedAs: previous, alreadyPulled: true };

    const version = (await fetchVersions(settings)).find((v) => v.sessionId === data.sessionId && v.file === data.file);
    if (!version) throw new CloudError("This version no longer exists in the cloud — refresh the list.");

    const res = await call(
      settings,
      readToken(settings),
      `/v1/objects/${encodeURIComponent(data.sessionId)}/${encodeURIComponent(data.file)}`
    );
    const buffer = Buffer.from(await res.arrayBuffer());
    const expected = res.headers.get("X-Sha256") || version.sha256;
    const hash = contentHash(buffer);
    // rawHash: bản Push trước khi đổi sang contentHash (cùng ngày 2026-11-02, lúc thử nghiệm) vẫn tải được.
    if (expected && hash !== expected && rawHash(buffer) !== expected) {
      throw new CloudError("Downloaded file is corrupted (checksum mismatch) — try again.");
    }

    const dest = uniquePath(DATA_DIR, fileNameFor(version.sessionName || "Session", data.sessionId));
    // Ghi qua tên tạm rồi rename — rescan() lọc đúng đuôi .db nên không bao giờ thấy file đang tải dở.
    const tmp = `${dest}.downloading`;
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, dest);
    const modified = new Date(version.modifiedAt);
    if (!Number.isNaN(modified.getTime())) fs.utimesSync(dest, modified, modified);

    const savedAs = path.basename(dest);
    // KHÔNG đặt syncBase ở đây: nếu máy đang có sẵn session này, file vừa tải chỉ là 1 BẢN KHÁC chờ
    // người dùng chọn ở SessionConflictDialog — bản đang dùng vẫn là bản cũ. status() tự ghi syncBase
    // khi thấy local khớp cloud (tức là người dùng đã chọn giữ bản vừa tải).
    updateCloudSettings((s) => (s.pulledVersions[manifestKey] = savedAs));
    return { savedAs, alreadyPulled: false };
  });
}

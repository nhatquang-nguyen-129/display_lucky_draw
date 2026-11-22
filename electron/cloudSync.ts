/**
 * Cloud Sync — đồng bộ NGUYÊN file session (.db) qua Cloudflare Worker + R2 (cloud/worker/), dưới account
 * đang login (xem `electron/auth.ts` — module đó gọi `setAuthContext()` sau khi login/logout, module NÀY
 * không tự biết đăng nhập, chỉ nhận context, tránh 2 module phụ thuộc vòng tròn lẫn nhau).
 *
 * Đồng bộ theo ĐIỂM CHỐT, không liên tục:
 * - Mọi IPC ghi dữ liệu gọi `markDirty(sid)` — chỉ đặt cờ "chưa đồng bộ" (lưu xuống
 *   `<data account>/.sync-state.json`, còn nguyên khi tắt app/crash/mất mạng), KHÔNG gọi mạng.
 * - Điểm chốt gọi `syncSoon(sid)`/`syncSession(sid)`: thao tác edit/delete ở cửa sổ chính, Confirm người
 *   trúng, đóng cửa sổ Landing Builder/Data Editor/Present, đóng/chuyển tab (xem main.ts). Login + có mạng
 *   lại → `syncAll()`. Thoát app → `flushDirty()`.
 * - Mục tiêu: cloud gần realtime nhất có thể với app — mọi thay đổi lên cloud sớm nhất, nhưng KHÔNG tốn
 *   request thừa. Trong lúc đang đăng nhập (khoá phiên độc quyền): không sửa → 0 request; có sửa → Push
 *   thẳng (Worker tự kiểm tra baseVersion). Bảng dưới chỉ chạy đầy đủ ở syncAll (login/có mạng lại),
 *   session chưa có trạng thái, hoặc khi Push nhận 409.
 * - Kiểm tra đầy đủ: hỏi Worker bản mới nhất (`GET /v1/sessions/:id/head`, rất
 *   nhẹ), so với `baseVersion` (bản cloud mà file local được dựng từ đó):
 *     local không sửa + cloud không đổi → không làm gì
 *     local có sửa    + cloud không đổi → Push (Worker kiểm tra lại baseVersion, lệch thì 409)
 *     local không sửa + cloud mới hơn   → Pull (thay file local, bản cũ sao lưu vào .backup/)
 *     cả 2 cùng đổi                     → giữ cả 2: bản local tách thành session "(this computer)"
 *     cloud đánh dấu đã xoá             → chuyển bản local vào Trash (trừ khi local còn sửa chưa đẩy)
 *   Lỗi mạng → giữ nguyên cờ, thử lại ở điểm chốt kế tiếp hoặc khi có mạng lại.
 *
 * Vẫn là lời gọi network DUY NHẤT trong app cùng auth.ts (`fetch` global, không thêm dependency). Xem
 * docs/architecture/cloud-sync.md.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { app } from "electron";
import {
  DATA_DIR,
  deleteSession,
  fileNameFor,
  forkSessionAsLocalCopy,
  getDb,
  hasSession,
  listSessionFiles,
  replaceSessionFile,
  snapshotSession,
  uniquePath,
} from "./db";

export interface AuthContext {
  workerUrl: string;
  sessionToken: string;
  accountId: string;
}

let authCtx: AuthContext | null = null;

/** Gọi bởi auth.ts lúc login (context mới)/logout/bị revoke (null). null thì huỷ mọi lượt đồng bộ đang
 *  chờ — cờ "chưa đồng bộ" vẫn còn trong file trạng thái, lần login sau tự đẩy tiếp. */
export function setAuthContext(ctx: AuthContext | null) {
  authCtx = ctx;
  if (!ctx) {
    for (const timer of soonTimers.values()) clearTimeout(timer);
    soonTimers.clear();
  }
}

class CloudError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

// Timeout rộng cho riêng lời gọi PUT 1 phần upload vì mạng upload chậm (phổ biến ở Việt Nam) có thể khiến
// 1 phần 5MB "treo" lâu nhưng vẫn đang tiến triển bình thường, không phải lỗi thật.
const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_PART_TIMEOUT_MS = 0;

async function call(
  pathname: string,
  init: RequestInit = {},
  cancelSignal?: AbortSignal,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<Response> {
  if (!authCtx) throw new CloudError("Not logged in.");
  if (cancelSignal?.aborted) throw new CloudError("Cancelled.");
  const { workerUrl, sessionToken } = authCtx;
  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  const onCancel = () => controller.abort();
  cancelSignal?.addEventListener("abort", onCancel);
  let res: Response;
  try {
    res = await fetch(`${workerUrl}${pathname}`, {
      ...init,
      signal: controller.signal,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${sessionToken}` },
    });
  } catch (err) {
    if (cancelSignal?.aborted) throw new CloudError("Cancelled.");
    if (controller.signal.aborted) {
      const secs = timeoutMs / 1000;
      const label = secs >= 60 ? `${Math.round(secs / 60)} min` : `${secs}s`;
      throw new CloudError(`Server not responding (timed out after ${label}). Check your internet connection.`);
    }
    throw new CloudError(`Network error reaching the cloud server: ${(err as Error).message}. Check your internet connection.`);
  } finally {
    clearTimeout(timer);
    cancelSignal?.removeEventListener("abort", onCancel);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new CloudError(body?.error ? `${body.error} (HTTP ${res.status})` : `Cloud server error (HTTP ${res.status})`, res.status);
  }
  return res;
}

export interface CloudVersion {
  sessionId: string;
  file: string; // "<pushedAtMs>.db" — cũng chính là "phiên bản" dùng cho baseVersion
  size: number;
  pushedAt: string;
  sessionName: string;
  modifiedAt: string;
  sha256: string;
  appVersion: string;
  participantCount: number;
}

interface CloudHead {
  version: string | null;
  sha256: string;
  sessionName: string;
  deleted: boolean;
}

async function fetchListing(): Promise<{ versions: CloudVersion[]; deleted: string[] }> {
  const res = await call("/v1/sessions");
  const data = (await res.json()) as { versions: CloudVersion[]; deleted?: string[] };
  return { versions: data.versions, deleted: data.deleted ?? [] };
}

async function fetchHead(sessionId: string): Promise<CloudHead> {
  const res = await call(`/v1/sessions/${encodeURIComponent(sessionId)}/head`);
  return (await res.json()) as CloudHead;
}

/* ---------------- Hash nội dung ---------------- */

/**
 * sha256 của file .db nhưng BỎ QUA 4 byte schema cookie (offset 40–43 của header SQLite): mỗi lần
 * VACUUM INTO tăng giá trị này lên 1, nên chụp lại 1 file vừa Pull về (cùng nội dung) vẫn ra byte khác
 * đúng ở đây — mọi byte còn lại giống hệt. Dùng cho MỌI so sánh + metadata sha256 gửi lên cloud.
 */
function contentHash(buffer: Buffer): string {
  const h = createHash("sha256");
  if (buffer.length < 44) return h.update(buffer).digest("hex");
  h.update(buffer.subarray(0, 40));
  h.update(Buffer.alloc(4));
  h.update(buffer.subarray(44));
  return h.digest("hex");
}

function snapshotToBuffer(sessionId: string): { buffer: Buffer; modifiedAt: string } {
  const tmp = path.join(os.tmpdir(), `lucky-draw-snap-${randomUUID()}.db`);
  try {
    const { modifiedAt } = snapshotSession(sessionId, tmp);
    return { buffer: fs.readFileSync(tmp), modifiedAt };
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/* ---------------- Upload (multipart) ---------------- */

// R2 multipart yêu cầu mỗi phần (trừ phần cuối) tối thiểu 5MB.
const CLIENT_PART_SIZE = 5 * 1024 * 1024;
const MAX_PART_RETRIES = 3;
const PART_RETRY_BACKOFF_MS = 5_000;

/** Upload 1 bản mới — `baseVersion` gửi ở bước complete để Worker từ chối (409) nếu cloud đã có bản mới
 *  hơn bản local đang dựa trên. Trả về phiên bản mới (tên file trên cloud). */
async function uploadFile(buffer: Buffer, meta: Record<string, string>, baseVersion: string | null): Promise<string> {
  const json = { "Content-Type": "application/json" };
  const start = (await (await call("/v1/uploads", { method: "POST", headers: json, body: JSON.stringify(meta) })).json()) as {
    key: string;
    uploadId: string;
    partSize: number;
  };
  const keyHeader = { "X-Upload-Key": start.key };
  const base = `/v1/uploads/${encodeURIComponent(start.uploadId)}`;
  const partSize = Math.min(CLIENT_PART_SIZE, start.partSize);

  try {
    const parts: { partNumber: number; etag: string }[] = [];
    for (let offset = 0, n = 1; offset < buffer.length; offset += partSize, n++) {
      const chunk = new Uint8Array(buffer.subarray(offset, offset + partSize));
      let res: Response | undefined;
      for (let attempt = 1; ; attempt++) {
        try {
          res = await call(`${base}/parts/${n}`, { method: "PUT", headers: keyHeader, body: chunk }, undefined, UPLOAD_PART_TIMEOUT_MS);
          break;
        } catch (err) {
          const msg = (err as Error).message;
          const retriable = /timed out|Network error/.test(msg);
          if (!retriable || attempt >= MAX_PART_RETRIES) throw err;
          await new Promise((r) => setTimeout(r, attempt * PART_RETRY_BACKOFF_MS));
        }
      }
      parts.push((await res.json()) as { partNumber: number; etag: string });
    }
    const done = (await (
      await call(`${base}/complete`, { method: "POST", headers: { ...keyHeader, ...json }, body: JSON.stringify({ parts, baseVersion }) })
    ).json()) as { key: string; version?: string };
    return done.version ?? done.key.slice(done.key.lastIndexOf("/") + 1);
  } catch (err) {
    // 409 = Worker đã tự abort upload rồi; các lỗi khác tự dọn upload dở.
    if (!(err instanceof CloudError && err.status === 409)) await call(base, { method: "DELETE", headers: keyHeader }).catch(() => undefined);
    throw err;
  }
}

async function downloadVersion(sessionId: string, version: string, expectedSha?: string): Promise<{ buffer: Buffer; hash: string }> {
  const res = await call(`/v1/objects/${encodeURIComponent(sessionId)}/${encodeURIComponent(version)}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const expected = res.headers.get("X-Sha256") || expectedSha;
  const hash = contentHash(buffer);
  if (expected && hash !== expected) throw new CloudError("Downloaded file is corrupted (checksum mismatch).");
  return { buffer, hash };
}

/* ---------------- Trạng thái đồng bộ local (.sync-state.json) ---------------- */

interface SessionSyncState {
  baseVersion: string | null; // bản cloud mà file local được dựng từ đó (null = chưa từng lên cloud)
  baseHash: string | null; // contentHash của bản đó — bỏ qua upload nếu sửa xong nội dung vẫn y hệt
  dirty: boolean; // local có sửa chưa đồng bộ
}

interface SyncStateFile {
  sessions: Record<string, SessionSyncState>;
  pendingDeletes: string[]; // dấu "đã xoá" chưa gửi được lên Worker (mất mạng lúc xoá)
}

// Cache theo DATA_DIR (đổi khi switchAccount) — mỗi account 1 file trạng thái riêng.
let stateDir: string | null = null;
let state: SyncStateFile = { sessions: {}, pendingDeletes: [] };

function stateFile(): string {
  return path.join(DATA_DIR, ".sync-state.json");
}

function loadState(): SyncStateFile {
  if (stateDir === DATA_DIR) return state;
  stateDir = DATA_DIR;
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(), "utf8")) as Partial<SyncStateFile>;
    state = { sessions: raw.sessions ?? {}, pendingDeletes: raw.pendingDeletes ?? [] };
  } catch {
    state = { sessions: {}, pendingDeletes: [] };
  }
  return state;
}

function saveState() {
  const s = loadState();
  const tmp = `${stateFile()}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2), "utf8");
    fs.renameSync(tmp, stateFile());
  } catch (err) {
    console.warn("[cloudSync] could not save sync state:", err);
  }
}

// Session CHƯA có trong file trạng thái (vừa tạo, Duplicate, Restore từ Trash, Import file rời, hoặc có
// từ trước khi có tính năng này) → coi như "chưa đồng bộ" — điểm chốt kế tiếp tự đẩy lên.
function getState(sessionId: string): SessionSyncState {
  const s = loadState();
  return s.sessions[sessionId] ?? { baseVersion: null, baseHash: null, dirty: true };
}

function setState(sessionId: string, next: SessionSyncState) {
  loadState().sessions[sessionId] = next;
  saveState();
}

/* ---------------- Trạng thái hiển thị (chấm trên tab) ---------------- */

export type SyncStatus = "synced" | "dirty" | "syncing" | "error";

const running = new Set<string>();
const failed = new Set<string>();
type StatusListener = (sessionId: string, status: SyncStatus) => void;
let statusListener: StatusListener | null = null;
let sessionsChangedListener: (() => void) | null = null;

export function onStatusChange(cb: StatusListener) {
  statusListener = cb;
}
/** Đồng bộ vừa thêm/thay/chuyển vào Trash 1 session (Pull, tách bản, tombstone) — cửa sổ chính refresh tab. */
export function onSessionsChanged(cb: () => void) {
  sessionsChangedListener = cb;
}

function statusOf(sessionId: string): SyncStatus {
  if (running.has(sessionId)) return "syncing";
  if (failed.has(sessionId)) return "error";
  return getState(sessionId).dirty ? "dirty" : "synced";
}

function emitStatus(sessionId: string) {
  statusListener?.(sessionId, statusOf(sessionId));
}

/** Trạng thái mọi session local — renderer gọi 1 lần lúc mở, sau đó nghe onStatusChange. */
export function getStatuses(): Record<string, SyncStatus> {
  const out: Record<string, SyncStatus> = {};
  for (const f of listSessionFiles()) out[f.id] = statusOf(f.id);
  return out;
}

/* ---------------- API cho main.ts ---------------- */

// Tăng mỗi lần markDirty — push xong chỉ xoá cờ nếu KHÔNG có lần sửa nào chen vào trong lúc upload.
const dirtySeq = new Map<string, number>();

/** Gọi ở MỌI IPC ghi dữ liệu — chỉ đặt cờ, không gọi mạng. */
export function markDirty(sessionId: string): void {
  dirtySeq.set(sessionId, (dirtySeq.get(sessionId) ?? 0) + 1);
  const st = getState(sessionId);
  if (!st.dirty || !loadState().sessions[sessionId]) setState(sessionId, { ...st, dirty: true });
  emitStatus(sessionId);
}

const SYNC_SOON_MS = 1_500;
const soonTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Điểm chốt ở cửa sổ chính / Confirm — gom các thao tác liên tiếp (vd xoá nhiều prize) thành 1 lần. */
export function syncSoon(sessionId: string): void {
  if (!authCtx) return;
  const existing = soonTimers.get(sessionId);
  if (existing) clearTimeout(existing);
  soonTimers.set(
    sessionId,
    setTimeout(() => {
      soonTimers.delete(sessionId);
      void syncSession(sessionId);
    }, SYNC_SOON_MS)
  );
}

// main.ts báo session nào đang mở cửa sổ phụ (Present/Builder/Data Editor) — KHÔNG Pull đè file của
// session đó (renderer đang giữ dữ liệu trong bộ nhớ, Save sau đó sẽ đè lại bản vừa Pull).
let isSessionBusy: (sessionId: string) => boolean = () => false;
export function setBusyCheck(fn: (sessionId: string) => boolean) {
  isSessionBusy = fn;
}

// Mỗi session chạy lần lượt (không bao giờ 2 lượt đồng bộ cùng 1 session chồng nhau). Tối đa 1 lượt
// CHỜ phía sau lượt đang chạy — nhiều Confirm liên tiếp lúc mạng chậm chỉ gộp thành 1 lượt kế tiếp (lượt
// đó chụp bản mới nhất), không xếp hàng N lần upload nguyên file.
const chains = new Map<string, Promise<void>>();
const queued = new Map<string, Promise<void>>();

/** Kiểm tra rồi đồng bộ 1 session (xem bảng ở đầu file). Không throw — lỗi chỉ log + đánh dấu "error". */
export function syncSession(sessionId: string, prefetchedHead?: CloudHead): Promise<void> {
  const pendingTimer = soonTimers.get(sessionId);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    soonTimers.delete(sessionId);
  }
  const waiting = queued.get(sessionId);
  if (waiting) return waiting;
  const inFlight = chains.get(sessionId);
  // Đang có lượt chạy dở → head lấy sẵn (syncAll) có thể đã cũ so với bản lượt đó vừa đẩy — bỏ, hỏi lại.
  const head = inFlight ? undefined : prefetchedHead;
  const prev = inFlight ?? Promise.resolve();
  const next = prev.then(() => {
    queued.delete(sessionId);
    return runSync(sessionId, head);
  });
  queued.set(sessionId, next);
  chains.set(sessionId, next);
  void next.finally(() => {
    if (chains.get(sessionId) === next) chains.delete(sessionId);
  });
  return next;
}

async function runSync(sessionId: string, prefetchedHead?: CloudHead): Promise<void> {
  if (!authCtx || !hasSession(sessionId)) return;
  running.add(sessionId);
  emitStatus(sessionId);
  try {
    await doSync(sessionId, prefetchedHead);
    failed.delete(sessionId);
  } catch (err) {
    failed.add(sessionId);
    console.warn(`[cloudSync] sync failed for ${sessionId}:`, err);
  } finally {
    running.delete(sessionId);
    if (hasSession(sessionId)) emitStatus(sessionId);
  }
}

async function doSync(sessionId: string, prefetchedHead?: CloudHead): Promise<void> {
  const st = getState(sessionId);

  // Đường nhanh (điểm chốt trong lúc đang đăng nhập, không có head lấy sẵn từ syncAll): khoá phiên độc
  // quyền đảm bảo trong phiên này KHÔNG máy nào khác ghi được lên account → cloud chỉ đổi do chính máy
  // này. Nên:
  // - không sửa gì → không gọi mạng (thay đổi từ máy khác đã được bắt ở syncAll lúc login);
  // - có sửa → Push thẳng, không hỏi head trước — bước complete của Worker tự kiểm tra lại baseVersion,
  //   lệch (409, rất hiếm: vd bucket bị xoá/sửa tay) thì rơi xuống luồng đầy đủ bên dưới với head mới.
  // Session chưa có trạng thái (vừa tạo/Duplicate/Restore) vẫn đi luồng đầy đủ.
  if (!prefetchedHead && loadState().sessions[sessionId]) {
    if (!st.dirty) return;
    try {
      await pushOne(sessionId, st);
      return;
    } catch (err) {
      if (!(err instanceof CloudError && err.status === 409)) throw err;
    }
  }

  const head = prefetchedHead ?? (await fetchHead(sessionId));

  // Đã bị xoá trên cloud (từ máy khác) và máy này không có gì chưa đẩy → theo luôn: chuyển vào Trash.
  // Local còn sửa chưa đẩy → Push bên dưới (Worker tự gỡ dấu xoá) — ưu tiên KHÔNG mất dữ liệu.
  if (head.deleted && !st.dirty) {
    if (isSessionBusy(sessionId)) return;
    deleteSession(sessionId);
    delete loadState().sessions[sessionId];
    saveState();
    sessionsChangedListener?.();
    return;
  }

  // Chưa có trạng thái (mất file .sync-state.json, hoặc session có từ trước khi có cơ chế này) mà cloud
  // đã có bản: nội dung local y hệt bản cloud mới nhất thì nhận luôn làm baseVersion, không tách bản thừa.
  if (!loadState().sessions[sessionId] && head.version && head.sha256) {
    const localHash = contentHash(snapshotToBuffer(sessionId).buffer);
    if (localHash === head.sha256) {
      setState(sessionId, { baseVersion: head.version, baseHash: localHash, dirty: false });
      return;
    }
  }

  const cloudChanged = (head.version ?? null) !== st.baseVersion;

  if (!st.dirty) {
    if (cloudChanged && head.version && !isSessionBusy(sessionId)) {
      const { buffer, hash } = await downloadVersion(sessionId, head.version, head.sha256);
      replaceSessionFile(sessionId, buffer);
      setState(sessionId, { baseVersion: head.version, baseHash: hash, dirty: false });
      sessionsChangedListener?.();
    }
    return;
  }

  if (cloudChanged && head.version) {
    await forkAndPull(sessionId, head);
    return;
  }

  try {
    // Cloud không còn bản nào (chưa từng Push) → đẩy như bản đầu tiên.
    await pushOne(sessionId, head.version ? st : { ...st, baseVersion: null, baseHash: null });
  } catch (err) {
    // Cloud đổi đúng lúc đang đẩy (Worker kiểm tra lại baseVersion) → xử lý như "cả 2 cùng đổi".
    if (err instanceof CloudError && err.status === 409) {
      await forkAndPull(sessionId, await fetchHead(sessionId));
      return;
    }
    throw err;
  }
}

async function pushOne(sessionId: string, st: SessionSyncState): Promise<void> {
  const seqAtStart = dirtySeq.get(sessionId) ?? 0;
  const db = getDb(sessionId);
  const row = db.prepare(`SELECT name FROM sessions WHERE id = ?`).get(sessionId) as { name: string } | undefined;
  if (!row) return;
  const participantCount = (
    db.prepare(`SELECT COUNT(*) AS n FROM participants WHERE session_id = ? AND status != 'removed'`).get(sessionId) as { n: number }
  ).n;
  const { buffer, modifiedAt } = snapshotToBuffer(sessionId);
  const hash = contentHash(buffer);

  let version = st.baseVersion;
  if (hash !== st.baseHash || !st.baseVersion) {
    version = await uploadFile(
      buffer,
      {
        sessionId,
        sessionName: row.name,
        modifiedAt,
        sha256: hash,
        appVersion: app.getVersion(),
        participantCount: String(participantCount),
      },
      st.baseVersion
    );
  }
  const stillDirty = (dirtySeq.get(sessionId) ?? 0) !== seqAtStart;
  setState(sessionId, { baseVersion: version, baseHash: hash, dirty: stillDirty });
}

async function forkAndPull(sessionId: string, head: CloudHead): Promise<void> {
  if (!head.version) return;
  if (isSessionBusy(sessionId)) return; // giữ nguyên cờ, thử lại khi đóng cửa sổ phụ
  const { buffer, hash } = await downloadVersion(sessionId, head.version, head.sha256);
  const copyId = forkSessionAsLocalCopy(sessionId);
  replaceSessionFile(sessionId, buffer);
  setState(sessionId, { baseVersion: head.version, baseHash: hash, dirty: false });
  // Bản tách ra chưa có trên cloud (state chưa có → dirty) — đẩy lên luôn.
  markDirty(copyId);
  syncSoon(copyId);
  sessionsChangedListener?.();
  console.warn(`[cloudSync] ${sessionId} changed both locally and on cloud — kept local copy as ${copyId}`);
}

/** Xoá session (sessions:delete) — gửi dấu "đã xoá" lên Worker để máy khác không tải lại. Mất mạng thì
 *  giữ lại trong pendingDeletes, gửi ở lần syncAll kế tiếp. */
export async function markSessionDeleted(sessionId: string): Promise<void> {
  const s = loadState();
  delete s.sessions[sessionId];
  if (!s.pendingDeletes.includes(sessionId)) s.pendingDeletes.push(sessionId);
  saveState();
  await flushPendingDeletes();
}

async function flushPendingDeletes() {
  if (!authCtx) return;
  const s = loadState();
  for (const id of [...s.pendingDeletes]) {
    try {
      await call(`/v1/sessions/${encodeURIComponent(id)}/delete`, { method: "POST" });
      s.pendingDeletes = s.pendingDeletes.filter((x) => x !== id);
      saveState();
    } catch (err) {
      console.warn(`[cloudSync] could not mark ${id} deleted on cloud:`, err);
      return;
    }
  }
}

let syncAllRunning: Promise<void> | null = null;

/**
 * Đồng bộ toàn bộ account — chạy lúc login và mỗi khi có mạng lại. Tải về session có trên cloud mà máy
 * chưa có (trừ session đã bị xoá), rồi kiểm tra từng session local theo đúng quy tắc của syncSession
 * (dùng luôn dữ liệu listing, không gọi head riêng từng session).
 */
export function syncAll(): Promise<void> {
  if (!syncAllRunning) {
    syncAllRunning = doSyncAll()
      .catch((err) => console.warn("[cloudSync] syncAll failed:", err))
      .finally(() => {
        syncAllRunning = null;
      });
  }
  return syncAllRunning;
}

async function doSyncAll(): Promise<void> {
  if (!authCtx) return;
  await flushPendingDeletes();
  const { versions, deleted } = await fetchListing();
  const deletedSet = new Set(deleted);
  const latest = new Map<string, CloudVersion>();
  for (const v of versions) if (!latest.has(v.sessionId)) latest.set(v.sessionId, v);

  const localIds = new Set(listSessionFiles().map((f) => f.id));
  let added = false;
  for (const [sessionId, v] of latest) {
    if (localIds.has(sessionId) || deletedSet.has(sessionId)) continue;
    try {
      const { buffer, hash } = await downloadVersion(sessionId, v.file, v.sha256);
      const dest = uniquePath(DATA_DIR, fileNameFor(v.sessionName || "Session", sessionId));
      const tmp = `${dest}.downloading`;
      fs.writeFileSync(tmp, buffer);
      fs.renameSync(tmp, dest);
      setState(sessionId, { baseVersion: v.file, baseHash: hash, dirty: false });
      added = true;
    } catch (err) {
      console.warn(`[cloudSync] could not download ${sessionId}:`, err);
    }
  }
  if (added) {
    listSessionFiles(); // rescan để đăng ký file vừa tải
    sessionsChangedListener?.();
  }

  for (const id of localIds) {
    const v = latest.get(id);
    await syncSession(id, { version: v?.file ?? null, sha256: v?.sha256 ?? "", sessionName: v?.sessionName ?? "", deleted: deletedSet.has(id) });
  }
}

/** Session còn cờ "chưa đồng bộ". */
export function dirtySessionIds(): string[] {
  return listSessionFiles()
    .map((f) => f.id)
    .filter((id) => getState(id).dirty);
}

/**
 * Thoát app / logout — đồng bộ mọi session còn cờ, chờ tối đa `timeoutMs`. Trả về các session VẪN chưa
 * đồng bộ được (main.ts hỏi người dùng "Wait / Quit anyway"). Cờ vẫn lưu trên đĩa dù chọn gì — lần login
 * sau tự đẩy tiếp.
 */
export async function flushDirty(timeoutMs: number): Promise<string[]> {
  if (!authCtx) return [];
  const ids = dirtySessionIds();
  if (ids.length > 0) {
    const all = Promise.allSettled(ids.map((id) => syncSession(id)));
    await Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
  }
  return dirtySessionIds();
}

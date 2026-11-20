/**
 * Cloud Sync — Push/Pull NGUYÊN file session (.db) qua Cloudflare Worker + R2 (cloud/worker/), dưới
 * account đang login (xem `electron/auth.ts` — module đó gọi `setAuthContext()` sau khi login/logout,
 * module NÀY không tự biết đăng nhập, chỉ nhận context, tránh 2 module phụ thuộc vòng tròn lẫn nhau).
 *
 * Tự động hoàn toàn — không còn nút Push/Pull tay: `scheduleAutoPush(sessionId)` debounce sau mỗi lần
 * sửa dữ liệu (gọi ở cuối các IPC handler ghi dữ liệu trong main.ts), `catchUpPull()` chạy đúng 1 lần
 * ngay sau khi login để tải về mọi session account đang sở hữu mà máy chưa có. Vì server chỉ cho ĐÚNG 1
 * thiết bị giữ khoá ghi tại 1 thời điểm (xem cloud/worker/src/index.ts), không còn khái niệm
 * "diverged"/so 2 chiều rồi người dùng tự chọn Push hay Pull như mô hình Space cũ — Push luôn đi 1 chiều
 * local → cloud, so với bản ĐÃ push/pull gần nhất của CHÍNH máy này (`lastPushedHash`) là đủ.
 *
 * Vẫn là lời gọi network DUY NHẤT trong app (`fetch` global, không thêm dependency) — chỉ khác trước:
 * chạy NGẦM tự động thay vì chờ người bấm. Xem docs/architecture/cloud-sync.md.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { app } from "electron";
import { DATA_DIR, fileNameFor, getDb, listSessionFiles, snapshotSession, uniquePath } from "./db";

export interface AuthContext {
  workerUrl: string;
  sessionToken: string;
  accountId: string;
}

let authCtx: AuthContext | null = null;

/** Gọi bởi auth.ts lúc login (context mới)/logout/bị revoke (null) — null thì huỷ mọi auto-push đang
 *  chờ (không có gì để push tới nữa). */
export function setAuthContext(ctx: AuthContext | null) {
  authCtx = ctx;
  if (!ctx) {
    for (const timer of pendingPush.values()) clearTimeout(timer);
    pendingPush.clear();
  }
}

class CloudError extends Error {}

// Xem giải thích đầy đủ ở bản gốc (trước khi có Account) — timeout rộng cho riêng lời gọi PUT 1 phần
// upload vì mạng upload chậm (phổ biến ở Việt Nam) có thể khiến 1 phần 5MB "treo" > 15 phút nhưng vẫn
// đang tiến triển bình thường, không phải lỗi thật.
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

export interface CloudVersion {
  sessionId: string;
  file: string; // "<pushedAtMs>.db"
  size: number;
  pushedAt: string;
  sessionName: string;
  modifiedAt: string;
  sha256: string;
  appVersion: string;
  participantCount: number;
}

async function fetchVersions(cancelSignal?: AbortSignal): Promise<CloudVersion[]> {
  const res = await call("/v1/sessions", {}, cancelSignal);
  return ((await res.json()) as { versions: CloudVersion[] }).versions;
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

export type ProgressFn = (sentOrReceived: number, total: number) => void;

// R2 multipart yêu cầu mỗi phần (trừ phần cuối) tối thiểu 5MB — tự chia theo mốc này để có nhiều mốc
// báo tiến độ hơn cho 1 file vài chục MB, thay vì 1 khối duy nhất không báo được gì tới khi xong hẳn.
const CLIENT_PART_SIZE = 5 * 1024 * 1024;
const MAX_PART_RETRIES = 3;
const PART_RETRY_BACKOFF_MS = 5_000;

async function uploadFile(buffer: Buffer, meta: Record<string, string>, onProgress?: ProgressFn, cancelSignal?: AbortSignal) {
  const json = { "Content-Type": "application/json" };
  const start = (await (await call("/v1/uploads", { method: "POST", headers: json, body: JSON.stringify(meta) }, cancelSignal)).json()) as {
    key: string;
    uploadId: string;
    partSize: number;
  };
  const keyHeader = { "X-Upload-Key": start.key };
  const base = `/v1/uploads/${encodeURIComponent(start.uploadId)}`;
  const partSize = Math.min(CLIENT_PART_SIZE, start.partSize);

  try {
    const parts: { partNumber: number; etag: string }[] = [];
    onProgress?.(0, buffer.length);
    for (let offset = 0, n = 1; offset < buffer.length; offset += partSize, n++) {
      const chunk = new Uint8Array(buffer.subarray(offset, offset + partSize));
      let res: Response | undefined;
      for (let attempt = 1; ; attempt++) {
        try {
          res = await call(`${base}/parts/${n}`, { method: "PUT", headers: keyHeader, body: chunk }, cancelSignal, UPLOAD_PART_TIMEOUT_MS);
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
    await call(`${base}/complete`, { method: "POST", headers: { ...keyHeader, ...json }, body: JSON.stringify({ parts }) }, cancelSignal);
  } catch (err) {
    await call(base, { method: "DELETE", headers: keyHeader }).catch(() => undefined);
    throw err;
  }
}

/* ---------------- Auto-push ---------------- */

const AUTO_PUSH_DEBOUNCE_MS = 5_000;
const pendingPush = new Map<string, ReturnType<typeof setTimeout>>();
// sha256 của bản ĐÃ push/pull gần nhất của CHÍNH máy này cho từng session — vì server chỉ cho đúng 1
// thiết bị ghi tại 1 thời điểm, cache cục bộ này đủ để biết "có gì mới để push không", không cần hỏi lại
// server trước mỗi lần push (khác hẳn mô hình diverged cũ phải so 2 chiều với cloud).
const lastPushedHash = new Map<string, string>();

async function pushOne(sessionId: string): Promise<void> {
  if (!authCtx) return;
  const db = getDb(sessionId);
  const row = db.prepare(`SELECT name FROM sessions WHERE id = ?`).get(sessionId) as { name: string } | undefined;
  if (!row) return;
  const participantCount = (
    db.prepare(`SELECT COUNT(*) AS n FROM participants WHERE session_id = ? AND status != 'removed'`).get(sessionId) as { n: number }
  ).n;
  const { buffer, modifiedAt } = snapshotToBuffer(sessionId);
  const hash = contentHash(buffer);
  if (lastPushedHash.get(sessionId) === hash) return;
  await uploadFile(buffer, {
    sessionId,
    sessionName: row.name,
    modifiedAt,
    sha256: hash,
    appVersion: app.getVersion(),
    participantCount: String(participantCount),
  });
  lastPushedHash.set(sessionId, hash);
}

/** Gọi ở cuối mỗi IPC handler ghi dữ liệu (participants/prizes/sessions/draw/media) — debounce theo
 *  từng session, không chặn IPC gọi nó (fire-and-forget, lỗi chỉ log, không throw lên renderer). */
export function scheduleAutoPush(sessionId: string): void {
  if (!authCtx) return;
  const existing = pendingPush.get(sessionId);
  if (existing) clearTimeout(existing);
  pendingPush.set(
    sessionId,
    setTimeout(() => {
      pendingPush.delete(sessionId);
      pushOne(sessionId).catch((err) => console.warn(`[cloudSync] auto-push failed for ${sessionId}:`, err));
    }, AUTO_PUSH_DEBOUNCE_MS)
  );
}

export function pendingPushSessionIds(): string[] {
  return [...pendingPush.keys()];
}

/** Đẩy ngay mọi session đang chờ debounce — dùng lúc quit (giới hạn thời gian, KHÔNG chặn quit) và lúc
 *  window mất focus (không giới hạn thời gian, chạy nền bình thường). */
export async function flushPendingPushes(timeoutMs?: number): Promise<void> {
  const sessionIds = [...pendingPush.keys()];
  for (const id of sessionIds) clearTimeout(pendingPush.get(id)!);
  pendingPush.clear();
  if (!authCtx || sessionIds.length === 0) return;
  const flush = Promise.allSettled(sessionIds.map((id) => pushOne(id).catch((err) => console.warn(`[cloudSync] flush push failed for ${id}:`, err))));
  if (!timeoutMs) {
    await flush;
    return;
  }
  await Promise.race([flush, new Promise((r) => setTimeout(r, timeoutMs))]);
}

/* ---------------- Pull (chỉ lúc login — xem catchUpPull) ---------------- */

async function readBodyWithProgress(res: Response, onProgress?: ProgressFn, cancelSignal?: AbortSignal): Promise<Buffer> {
  const total = Number(res.headers.get("Content-Length") ?? 0);
  if (!res.body || !onProgress) return Buffer.from(await res.arrayBuffer());

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  onProgress(0, total);
  for (;;) {
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

async function pullOne(version: CloudVersion): Promise<string> {
  const res = await call(`/v1/objects/${encodeURIComponent(version.sessionId)}/${encodeURIComponent(version.file)}`);
  const buffer = await readBodyWithProgress(res);
  const expected = res.headers.get("X-Sha256") || version.sha256;
  const hash = contentHash(buffer);
  if (expected && hash !== expected) throw new CloudError("Downloaded file is corrupted (checksum mismatch) — try again.");

  const dest = uniquePath(DATA_DIR, fileNameFor(version.sessionName || "Session", version.sessionId));
  const tmp = `${dest}.downloading`;
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, dest);
  const modified = new Date(version.modifiedAt);
  if (!Number.isNaN(modified.getTime())) fs.utimesSync(dest, modified, modified);

  lastPushedHash.set(version.sessionId, hash);
  return path.basename(dest);
}

/**
 * Chạy ĐÚNG 1 LẦN ngay sau khi login xong (auth.ts gọi) — tải về mọi session account đang sở hữu trên
 * cloud mà máy này CHƯA có (máy mới, hoặc máy khác vừa login account này lần đầu). KHÔNG chạy nền định
 * kỳ, KHÔNG so sánh/reconcile 2 chiều — máy đã có session đó rồi thì bỏ qua (local luôn là bản đang dùng,
 * vì chỉ máy này được ghi tại thời điểm login).
 */
export async function catchUpPull(): Promise<void> {
  if (!authCtx) return;
  const versions = await fetchVersions();
  const latestBySession = new Map<string, CloudVersion>();
  for (const v of versions) if (!latestBySession.has(v.sessionId)) latestBySession.set(v.sessionId, v);

  const localIds = new Set(listSessionFiles().map((f) => f.id));
  for (const [sessionId, version] of latestBySession) {
    if (localIds.has(sessionId)) continue;
    try {
      await pullOne(version);
    } catch (err) {
      console.warn(`[cloudSync] catch-up pull failed for ${sessionId}:`, err);
    }
  }
}

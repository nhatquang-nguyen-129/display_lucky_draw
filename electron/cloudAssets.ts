/**
 * Tách ảnh/video khỏi bản snapshot gửi lên cloud — giai đoạn 2 của "Tách ảnh/video thành asset riêng
 * trên R2" (xem CLAUDE.md mục TODO + docs/architecture/cloud-sync.md "Lộ trình tối ưu"). File `.db`
 * LOCAL KHÔNG đổi gì: video vẫn BLOB trong `media`, ảnh vẫn data URL trong `landing_config`/
 * `prizes.display_image`/`image_path`. Chỉ BẢN CHỤP gửi lên cloud (cloudSync.ts's snapshotToBuffer) là
 * bản "nhẹ": mọi ảnh/video lớn thay bằng placeholder `"cloudasset:<sha256>"`, nội dung thật nằm riêng ở
 * `accounts/<id>/assets/<sha256>` trên Worker (content-addressed, bất biến — xem cloud/worker/src/index.ts).
 *
 * dehydrateForPush() chạy lúc Push (trước khi hash/upload .db), rehydrateAfterPull() chạy lúc Pull (ngay
 * sau khi tải .db về, TRƯỚC KHI file đó được dùng làm file session thật — xem 4 điểm gọi trong
 * cloudSync.ts: pushOne, doSync x2, forkAndPull, doSyncAll).
 *
 * Asset-trước-db: ensureAssetsUploaded() luôn upload hết asset còn thiếu rồi mới trả lại bản nhẹ để Push —
 * không bao giờ có bản cloud trỏ tới asset chưa tồn tại. Cache theo file (`.assets/<sha256>` trong
 * DATA_DIR) đóng 2 vai: nhớ asset đã chắc chắn có trên cloud (khỏi hỏi lại `/v1/assets/check` mỗi lần
 * push) + nhớ asset đã tải về (khỏi tải lại khi Pull nhiều lần/nhiều session dùng chung asset). CHƯA có
 * GC (giai đoạn 6) — cache này chỉ lớn dần, dọn sau nếu cần.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { createHash, randomUUID } from "crypto";
import Database from "better-sqlite3";
import { DATA_DIR } from "./db";
import { CLIENT_PART_SIZE, call } from "./cloudSync";

// Retry 1 phần (giống hệt cloudSync.ts's uploadParts, nhưng vòng lặp ở ĐÂY phải lưu tiến trình ra đĩa
// sau MỖI phần — xem uploadAsset()) — nên không tái dùng được uploadParts() nguyên khối, nó chỉ trả kết
// quả ở cuối, mất hết nếu tiến trình bị ngắt giữa đường (crash app, đóng máy, mất mạng lâu).
const MAX_PART_RETRIES = 3;
const PART_RETRY_BACKOFF_MS = 5_000;

// Chuỗi `data:` ngắn hơn mốc này GIỮ NGUYÊN trong JSON — tách ra vẫn phải tải riêng lúc Pull (1 round-trip
// R2/asset), không đáng cho icon/logo nhỏ. Mốc đo thử lại ở giai đoạn 2 theo dữ liệu session thật.
const DEHYDRATE_THRESHOLD = 16 * 1024;
const PLACEHOLDER_PREFIX = "cloudasset:";
const SHA256_HEX = /^[0-9a-f]{64}$/;
// Placeholder core trong BLOB `media.data` — kiểm tra ĐÚNG hình dạng (không chỉ prefix) để không bao giờ
// nhầm 1 blob video thật (dù cực hiếm) thành placeholder.
const MEDIA_PLACEHOLDER = new RegExp(`^${PLACEHOLDER_PREFIX}[0-9a-f]{64}$`);

interface PendingAsset {
  mime: string;
  bytes: Buffer;
}

function assetsCacheDir(): string {
  return path.join(DATA_DIR, ".assets");
}
function cachedAssetPath(sha256: string): string {
  return path.join(assetsCacheDir(), sha256);
}
// Tiến trình 1 upload asset ĐANG CHẠY (chưa complete) — xem uploadAsset(). Nằm cạnh file cache cuối
// cùng nhưng tên khác hẳn (".upload.json" suffix) nên không bao giờ nhầm với nội dung asset đã xong.
function uploadProgressPath(sha256: string): string {
  return path.join(assetsCacheDir(), `${sha256}.upload.json`);
}

function withTempDb<T>(buffer: Buffer, fn: (db: Database.Database, tmpFile: string) => T): T {
  const tmp = path.join(os.tmpdir(), `lucky-draw-asset-${randomUUID()}.db`);
  fs.writeFileSync(tmp, buffer);
  let db: Database.Database | undefined;
  try {
    db = new Database(tmp);
    return fn(db, tmp);
  } finally {
    db?.close();
    fs.rmSync(tmp, { force: true });
  }
}

function vacuumToBuffer(db: Database.Database): Buffer {
  const out = path.join(os.tmpdir(), `lucky-draw-asset-out-${randomUUID()}.db`);
  try {
    db.prepare(`VACUUM INTO ?`).run(out);
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(out, { force: true });
  }
}

/* ---------------- Dehydrate (Push) ---------------- */

// 1 chuỗi data: URL dài → bytes thật + mime, bất kể gốc base64 hay percent-encoded (reconstruct lúc
// rehydrate LUÔN ra base64 — cùng bytes, app chỉ cần decode đúng, không cần giữ đúng kiểu encode gốc).
function decodeDataUrl(url: string): { bytes: Buffer; mime: string } | null {
  if (!url.startsWith("data:")) return null;
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  const header = url.slice(5, comma);
  const mime = header.split(";")[0] || "application/octet-stream";
  try {
    const bytes = /;base64$/.test(header) ? Buffer.from(url.slice(comma + 1), "base64") : Buffer.from(decodeURIComponent(url.slice(comma + 1)), "utf8");
    return { bytes, mime };
  } catch {
    return null; // data: URL hỏng/không decode được — giữ nguyên, không tách
  }
}

function registerAsset(bytes: Buffer, mime: string, pending: Map<string, PendingAsset>): string {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (!pending.has(sha256)) pending.set(sha256, { mime, bytes });
  return sha256;
}

/**
 * `landing_config` (đã parse JSON, CHƯA dehydrate) có chứa ≥1 chuỗi `data:` sẽ bị tách thành asset
 * không — dùng CÙNG mốc `DEHYDRATE_THRESHOLD` với dehydrateForPush() để kết quả nhất quán. main.ts gọi
 * lúc `sessions:updateLandingConfig` để chọn debounce dài hơn cho lần Save đó (giai đoạn 4 — tránh
 * dehydrate/upload asset nhiều lần nếu người dùng Save liên tục trong lúc chỉnh ảnh/video).
 */
export function hasLargeInlineAsset(value: unknown): boolean {
  if (typeof value === "string") return value.startsWith("data:") && value.length > DEHYDRATE_THRESHOLD;
  if (Array.isArray(value)) return value.some((v) => hasLargeInlineAsset(v));
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).some((v) => hasLargeInlineAsset(v));
  return false;
}

// data: URL đứng ĐỘC LẬP (cột `prizes.display_image`/`image_path`) — không phải JSON lồng nhau.
function dehydrateStandaloneValue(value: string | null, pending: Map<string, PendingAsset>): string | null {
  if (!value || value.length <= DEHYDRATE_THRESHOLD) return value;
  const decoded = decodeDataUrl(value);
  if (!decoded) return value;
  return PLACEHOLDER_PREFIX + registerAsset(decoded.bytes, decoded.mime, pending);
}

// `landing_config` — JSON lồng nhau, data: URL có thể nằm ở bất kỳ field nào (ảnh nền, icon component...).
function dehydrateJsonValue(value: unknown, pending: Map<string, PendingAsset>): unknown {
  if (typeof value === "string") {
    if (value.length <= DEHYDRATE_THRESHOLD || !value.startsWith("data:")) return value;
    const decoded = decodeDataUrl(value);
    return decoded ? PLACEHOLDER_PREFIX + registerAsset(decoded.bytes, decoded.mime, pending) : value;
  }
  if (Array.isArray(value)) return value.map((v) => dehydrateJsonValue(v, pending));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = dehydrateJsonValue(v, pending);
    return out;
  }
  return value;
}

/**
 * Bản chụp (buffer từ snapshotToBuffer) → bản NHẸ để Push. Upload hết asset còn thiếu lên Worker TRƯỚC
 * khi trả về (asset-trước-db — xem docstring đầu file), rồi mới VACUUM lại bản nhẹ.
 */
export async function dehydrateForPush(buffer: Buffer): Promise<Buffer> {
  const pending = new Map<string, PendingAsset>();

  const light = withTempDb(buffer, (db) => {
    let touched = false;

    const mediaRows = db.prepare(`SELECT id, mime, data FROM media`).all() as { id: string; mime: string; data: Buffer }[];
    for (const row of mediaRows) {
      if (MEDIA_PLACEHOLDER.test(row.data.toString("utf8"))) continue; // đã là placeholder (không nên xảy ra ở file local thật)
      const sha256 = registerAsset(row.data, row.mime, pending);
      db.prepare(`UPDATE media SET data = ? WHERE id = ?`).run(Buffer.from(PLACEHOLDER_PREFIX + sha256, "utf8"), row.id);
      touched = true;
    }

    const sessionRows = db.prepare(`SELECT id, landing_config FROM sessions`).all() as { id: string; landing_config: string | null }[];
    for (const s of sessionRows) {
      if (!s.landing_config) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(s.landing_config);
      } catch {
        continue; // JSON hỏng — không đụng, giữ nguyên nguyên trạng
      }
      const next = JSON.stringify(dehydrateJsonValue(parsed, pending));
      if (next !== s.landing_config) {
        db.prepare(`UPDATE sessions SET landing_config = ? WHERE id = ?`).run(next, s.id);
        touched = true;
      }
    }

    const prizeRows = db.prepare(`SELECT id, display_image, image_path FROM prizes`).all() as {
      id: string;
      display_image: string | null;
      image_path: string | null;
    }[];
    for (const p of prizeRows) {
      const displayImage = dehydrateStandaloneValue(p.display_image, pending);
      const imagePath = dehydrateStandaloneValue(p.image_path, pending);
      if (displayImage !== p.display_image || imagePath !== p.image_path) {
        db.prepare(`UPDATE prizes SET display_image = ?, image_path = ? WHERE id = ?`).run(displayImage, imagePath, p.id);
        touched = true;
      }
    }

    if (!touched) return buffer; // không có gì để tách — khỏi VACUUM lại tốn công

    // Bảng CHỈ tồn tại trong bản chụp nhẹ — rehydrateAfterPull đọc bảng này để biết cần tải asset nào,
    // rồi DROP đi (file local thật không bao giờ có bảng này, kể cả sau khi Pull).
    db.exec(`CREATE TABLE _cloud_assets (sha256 TEXT PRIMARY KEY, mime TEXT NOT NULL, size INTEGER NOT NULL)`);
    const insertAsset = db.prepare(`INSERT INTO _cloud_assets (sha256, mime, size) VALUES (?, ?, ?)`);
    for (const [sha256, asset] of pending) insertAsset.run(sha256, asset.mime, asset.bytes.length);

    return vacuumToBuffer(db);
  });

  if (pending.size) await ensureAssetsUploaded(pending);
  return light;
}

async function ensureAssetsUploaded(pending: Map<string, PendingAsset>): Promise<void> {
  const toCheck = [...pending.keys()].filter((sha) => !fs.existsSync(cachedAssetPath(sha)));
  if (!toCheck.length) return;
  const res = await call("/v1/assets/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hashes: toCheck }),
  });
  const { missing } = (await res.json()) as { missing: string[] };
  const missingSet = new Set(missing);
  fs.mkdirSync(assetsCacheDir(), { recursive: true });
  for (const sha256 of toCheck) {
    const asset = pending.get(sha256)!;
    if (missingSet.has(sha256)) await uploadAsset(asset.bytes, sha256, asset.mime);
    // Dù vừa upload hay cloud đã có sẵn — cache lại để lần push sau (asset không đổi nội dung) khỏi hỏi lại.
    const tmp = `${cachedAssetPath(sha256)}.tmp`;
    fs.writeFileSync(tmp, asset.bytes);
    fs.renameSync(tmp, cachedAssetPath(sha256));
  }
}

interface UploadProgress {
  uploadId: string;
  key: string;
  partSize: number;
  size: number; // bytes.length lúc bắt đầu — đối chiếu khi resume, lệch (không nên xảy ra, content-
  // addressed nên cùng sha256 luôn cùng bytes) thì coi như chưa có gì, bắt đầu lại sạch.
  parts: { partNumber: number; etag: string }[];
}

function loadUploadProgress(sha256: string): UploadProgress | null {
  try {
    return JSON.parse(fs.readFileSync(uploadProgressPath(sha256), "utf8")) as UploadProgress;
  } catch {
    return null;
  }
}

function saveUploadProgress(sha256: string, progress: UploadProgress) {
  fs.mkdirSync(assetsCacheDir(), { recursive: true });
  const tmp = `${uploadProgressPath(sha256)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(progress));
  fs.renameSync(tmp, uploadProgressPath(sha256));
}

function clearUploadProgress(sha256: string) {
  fs.rmSync(uploadProgressPath(sha256), { force: true });
}

async function startNewAssetUpload(sha256: string, mime: string, size: number): Promise<UploadProgress> {
  const start = (await (
    await call("/v1/assets/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha256, mime, size }),
    })
  ).json()) as { key: string; uploadId: string; partSize: number };
  const progress: UploadProgress = { uploadId: start.uploadId, key: start.key, partSize: Math.min(CLIENT_PART_SIZE, start.partSize), size, parts: [] };
  saveUploadProgress(sha256, progress);
  return progress;
}

async function uploadPartWithRetry(
  uploadId: string,
  uploadKey: string,
  n: number,
  bytes: Buffer,
  offset: number,
  partSize: number
): Promise<{ partNumber: number; etag: string }> {
  const headers = { "X-Upload-Key": uploadKey };
  for (let attempt = 1; ; attempt++) {
    try {
      // new Uint8Array(...) ngay tại chỗ gọi (không truyền qua tham số riêng) — khớp đúng kiểu
      // `BodyInit` mà call()/fetch() cần, giống cách uploadParts() ở cloudSync.ts làm.
      const chunk = new Uint8Array(bytes.subarray(offset, offset + partSize));
      // Timeout = 0 (không giới hạn) — video lớn qua mạng chậm vẫn đang tiến triển bình thường, không
      // phải lỗi thật (cùng lý do UPLOAD_PART_TIMEOUT_MS ở cloudSync.ts).
      const res = await call(`/v1/uploads/${encodeURIComponent(uploadId)}/parts/${n}`, { method: "PUT", headers, body: chunk }, undefined, 0);
      return (await res.json()) as { partNumber: number; etag: string };
    } catch (err) {
      const retriable = /timed out|Network error/.test((err as Error).message);
      if (!retriable || attempt >= MAX_PART_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, attempt * PART_RETRY_BACKOFF_MS));
    }
  }
}

// Worker/R2 báo uploadId không còn hợp lệ (vd multipart upload dở bị R2 tự dọn quá hạn) bằng 1 lỗi HTTP
// 4xx rõ ràng — KHÁC với timeout/network error (message không có "HTTP ...", xem call() ở cloudSync.ts).
// Dùng để phân biệt "nghỉ giữa đường, resume được" (timeout) với "tiến trình cũ đã chết, phải làm lại".
function isStaleUploadError(err: unknown): boolean {
  return err instanceof Error && /HTTP 4\d\d/.test(err.message);
}

/**
 * Upload 1 asset theo chunk, LƯU TIẾN TRÌNH từng phần ra đĩa (`.assets/<sha256>.upload.json`) sau MỖI
 * phần thành công — mạng rớt giữa chừng (crash app, đóng máy, mất mạng lâu hơn mấy lần retry trong 1
 * lần gọi) → lần push KẾ TIẾP (cùng sha256 — content-addressed, bytes chắc chắn giống) resume đúng từ
 * phần còn thiếu, không upload lại từ đầu. Khác `uploadFile()` ở cloudSync.ts cho session .db: file đó
 * dehydrate/hash lại rất rẻ (vài chục ms) nên không cần persist giữa 2 lần gọi riêng biệt; 1 video tới
 * 500MB thì KHÔNG đáng upload lại toàn bộ chỉ vì rớt mạng ở phần cuối.
 */
async function uploadAsset(bytes: Buffer, sha256: string, mime: string): Promise<void> {
  let progress = loadUploadProgress(sha256);
  if (progress && progress.size !== bytes.length) progress = null;
  if (!progress) progress = await startNewAssetUpload(sha256, mime, bytes.length);

  const totalParts = Math.max(1, Math.ceil(bytes.length / progress.partSize));
  const firstPartThisCall = progress.parts.length + 1;

  for (let n = firstPartThisCall; n <= totalParts; n++) {
    const offset = (n - 1) * progress.partSize;
    let part: { partNumber: number; etag: string };
    try {
      part = await uploadPartWithRetry(progress.uploadId, progress.key, n, bytes, offset, progress.partSize);
    } catch (err) {
      if (n === firstPartThisCall && isStaleUploadError(err)) {
        // Tiến trình cũ đã chết — bỏ, bắt đầu lại HOÀN TOÀN sạch (uploadId mới) rồi thử lại 1 lần.
        clearUploadProgress(sha256);
        return uploadAsset(bytes, sha256, mime);
      }
      throw err; // giữ nguyên progress.json đã lưu tới phần gần nhất — lần gọi sau resume từ đây
    }
    progress.parts.push(part);
    saveUploadProgress(sha256, progress);
  }

  await call(`/v1/assets/uploads/${encodeURIComponent(progress.uploadId)}/complete`, {
    method: "POST",
    headers: { "X-Upload-Key": progress.key, "Content-Type": "application/json" },
    body: JSON.stringify({ parts: progress.parts }),
  });
  clearUploadProgress(sha256);
}

/* ---------------- Rehydrate (Pull) ---------------- */

async function ensureAssetLocal(sha256: string): Promise<Buffer> {
  const dest = cachedAssetPath(sha256);
  if (fs.existsSync(dest)) return fs.readFileSync(dest);
  // KHÔNG timeout ngắn — asset có thể tới hàng trăm MB, mạng chậm vẫn đang tiến triển bình thường
  // (giống lý do UPLOAD_PART_TIMEOUT_MS = 0 ở cloudSync.ts). Resumable theo chunk làm ở giai đoạn 3.
  const res = await call(`/v1/assets/${sha256}`, {}, undefined, 0);
  const bytes = Buffer.from(await res.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== sha256) throw new Error(`Downloaded asset ${sha256} is corrupted (checksum mismatch).`);
  fs.mkdirSync(assetsCacheDir(), { recursive: true });
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, dest);
  return bytes;
}

function rehydrateStandaloneValue(value: string | null, mimeOf: Map<string, string>, bytesOf: Map<string, Buffer>): string | null {
  if (!value) return value;
  const sha256 = placeholderSha(value);
  if (!sha256) return value;
  return toDataUrl(sha256, mimeOf, bytesOf);
}

function rehydrateJsonValue(value: unknown, mimeOf: Map<string, string>, bytesOf: Map<string, Buffer>): unknown {
  if (typeof value === "string") {
    const sha256 = placeholderSha(value);
    return sha256 ? toDataUrl(sha256, mimeOf, bytesOf) : value;
  }
  if (Array.isArray(value)) return value.map((v) => rehydrateJsonValue(v, mimeOf, bytesOf));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = rehydrateJsonValue(v, mimeOf, bytesOf);
    return out;
  }
  return value;
}

function placeholderSha(value: string): string | null {
  if (!value.startsWith(PLACEHOLDER_PREFIX)) return null;
  const sha256 = value.slice(PLACEHOLDER_PREFIX.length);
  return SHA256_HEX.test(sha256) ? sha256 : null;
}

function toDataUrl(sha256: string, mimeOf: Map<string, string>, bytesOf: Map<string, Buffer>): string {
  const mime = mimeOf.get(sha256) ?? "application/octet-stream";
  return `data:${mime};base64,${bytesOf.get(sha256)!.toString("base64")}`;
}

/**
 * Bản nhẹ vừa tải từ cloud → bản ĐẦY ĐỦ để ghi làm file session thật. File cloud CŨ (từ trước giai đoạn
 * này, không có bảng `_cloud_assets`) → trả về nguyên buffer, không làm gì (tương thích ngược).
 *
 * KHÔNG dùng `withTempDb` (helper đó đóng/xoá file tạm ngay khi callback return — chỉ đúng cho callback
 * SYNC). Ở đây cần `await` tải asset giữa lúc đang cầm `db` mở, nên tự quản lý try/finally, đóng db
 * SAU KHI mọi await đã xong.
 */
export async function rehydrateAfterPull(buffer: Buffer): Promise<Buffer> {
  const tmp = path.join(os.tmpdir(), `lucky-draw-asset-${randomUUID()}.db`);
  fs.writeFileSync(tmp, buffer);
  let db: Database.Database | undefined;
  try {
    db = new Database(tmp);
    const hasTable = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_cloud_assets'`).get();
    if (!hasTable) return buffer;

    const assetRows = db.prepare(`SELECT sha256, mime FROM _cloud_assets`).all() as { sha256: string; mime: string }[];
    const mimeOf = new Map(assetRows.map((a) => [a.sha256, a.mime]));
    const bytesOf = new Map<string, Buffer>();

    // Tải hết TRƯỚC KHI ghi — 1 asset lỗi mạng thì throw ngay (propagate lên cloudSync.ts, catch ở
    // runSync — đánh dấu "error", thử lại ở điểm chốt kế tiếp), KHÔNG rehydrate nửa vời.
    for (const a of assetRows) bytesOf.set(a.sha256, await ensureAssetLocal(a.sha256));

    const mediaRows = db.prepare(`SELECT id, data FROM media`).all() as { id: string; data: Buffer }[];
    for (const row of mediaRows) {
      const text = row.data.toString("utf8");
      if (!MEDIA_PLACEHOLDER.test(text)) continue;
      const sha256 = text.slice(PLACEHOLDER_PREFIX.length);
      db.prepare(`UPDATE media SET data = ? WHERE id = ?`).run(bytesOf.get(sha256)!, row.id);
    }

    const sessionRows = db.prepare(`SELECT id, landing_config FROM sessions`).all() as { id: string; landing_config: string | null }[];
    for (const s of sessionRows) {
      if (!s.landing_config) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(s.landing_config);
      } catch {
        continue;
      }
      const next = JSON.stringify(rehydrateJsonValue(parsed, mimeOf, bytesOf));
      if (next !== s.landing_config) db.prepare(`UPDATE sessions SET landing_config = ? WHERE id = ?`).run(next, s.id);
    }

    const prizeRows = db.prepare(`SELECT id, display_image, image_path FROM prizes`).all() as {
      id: string;
      display_image: string | null;
      image_path: string | null;
    }[];
    for (const p of prizeRows) {
      const displayImage = rehydrateStandaloneValue(p.display_image, mimeOf, bytesOf);
      const imagePath = rehydrateStandaloneValue(p.image_path, mimeOf, bytesOf);
      if (displayImage !== p.display_image || imagePath !== p.image_path) {
        db.prepare(`UPDATE prizes SET display_image = ?, image_path = ? WHERE id = ?`).run(displayImage, imagePath, p.id);
      }
    }

    db.exec(`DROP TABLE _cloud_assets`);
    return vacuumToBuffer(db);
  } finally {
    db?.close();
    fs.rmSync(tmp, { force: true });
  }
}

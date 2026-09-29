import { BrowserWindow, dialog, protocol } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import { getDb } from "./db";

/**
 * Media (video) của component Video trên Landing — BLOB trong bảng `media` của chính file session (xem
 * db.ts), KHÔNG base64 trong landing_config như ảnh (video vài trăm MB, mỗi lần Save gửi lại cả JSON).
 *
 * Renderer phát qua scheme riêng `ldmedia://<sessionId>/<mediaId>` (không đọc file:// được — xem
 * CLAUDE.md). Thẻ <video> tua/đọc từng đoạn bằng HTTP Range, nên lần đầu phát, BLOB được xả ra 1 file
 * cache trong thư mục tạm của hệ điều hành rồi phục vụ từng đoạn từ file đó — không đọc lại cả BLOB mỗi
 * request. Media id không bao giờ đổi nội dung (import lại = id mới) nên cache không cần làm mới.
 */
export const MEDIA_SCHEME = "ldmedia";

// Trên giới hạn này đọc nguyên file vào RAM để ghi BLOB bắt đầu nặng — và SQLite mặc định chặn BLOB > ~1 GB.
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

const VIDEO_MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/mp4", // .mov H.264 phát được khi khai báo là mp4; codec lạ (ProRes...) thì Chromium không phát
  webm: "video/webm",
  ogv: "video/ogg",
};

const CACHE_DIR = path.join(os.tmpdir(), "lucky-draw-media");
const ID_PATTERN = /^[0-9a-f-]{36}$/i;

// PHẢI gọi trước app ready (yêu cầu của Electron). `stream` để <video> nhận dữ liệu dạng luồng.
export function registerMediaScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

function cachedFile(sessionId: string, mediaId: string): { file: string; mime: string } | null {
  if (!ID_PATTERN.test(sessionId) || !ID_PATTERN.test(mediaId)) return null;
  const db = getDb(sessionId);
  const meta = db.prepare(`SELECT mime FROM media WHERE id = ? AND session_id = ?`).get(mediaId, sessionId) as
    | { mime: string }
    | undefined;
  if (!meta) return null;
  const file = path.join(CACHE_DIR, `${sessionId}_${mediaId}`);
  if (!fs.existsSync(file)) {
    const row = db.prepare(`SELECT data FROM media WHERE id = ? AND session_id = ?`).get(mediaId, sessionId) as {
      data: Buffer;
    };
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    // Ghi ra file tạm rồi mới đổi tên — 2 request song song không đọc phải file đang ghi dở.
    const tmp = `${file}.${process.pid}.${Date.now()}.part`;
    fs.writeFileSync(tmp, row.data);
    fs.renameSync(tmp, file);
  }
  return { file, mime: meta.mime };
}

// Gọi sau app ready.
export function registerMediaProtocol() {
  protocol.handle(MEDIA_SCHEME, (request) => {
    let found: { file: string; mime: string } | null = null;
    try {
      const url = new URL(request.url);
      found = cachedFile(url.hostname, url.pathname.replace(/^\/+/, ""));
    } catch (e) {
      console.warn("[media] lookup failed:", e);
    }
    if (!found) return new Response("Not found", { status: 404 });

    const size = fs.statSync(found.file).size;
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("Range") ?? "");
    let start = 0;
    let end = size - 1;
    if (range && (range[1] || range[2])) {
      if (range[1]) {
        start = Number(range[1]);
        if (range[2]) end = Math.min(Number(range[2]), size - 1);
      } else {
        start = Math.max(0, size - Number(range[2])); // "bytes=-N" = N byte cuối
      }
      if (start >= size || start > end) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      }
    }
    const body = Readable.toWeb(fs.createReadStream(found.file, { start, end })) as ReadableStream;
    const headers: Record<string, string> = {
      "Content-Type": found.mime,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    };
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    return new Response(body, { status: range ? 206 : 200, headers });
  });
}

export type ImportVideoResult = { mediaId: string; fileName: string; size: number } | { error: string } | null;

export async function importVideo(sessionId: string, parent: BrowserWindow | null): Promise<ImportVideoResult> {
  const options: Electron.OpenDialogOptions = {
    properties: ["openFile"],
    filters: [{ name: "Video", extensions: Object.keys(VIDEO_MIME) }],
  };
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = VIDEO_MIME[ext];
  // Filter của dialog có thể bị lách (gõ thẳng tên file) — chặn lại tường minh.
  if (!mime) return { error: `Unsupported file type ".${ext}". Use ${Object.keys(VIDEO_MIME).join(", ")}.` };
  const size = fs.statSync(filePath).size;
  if (size > MAX_VIDEO_BYTES) {
    return { error: `Video is too large (${Math.round(size / 1024 / 1024)} MB). Maximum is ${MAX_VIDEO_BYTES / 1024 / 1024} MB.` };
  }

  const mediaId = randomUUID();
  const fileName = path.basename(filePath);
  getDb(sessionId)
    .prepare(`INSERT INTO media (id, session_id, file_name, mime, size, data) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(mediaId, sessionId, fileName, mime, size, fs.readFileSync(filePath));
  return { mediaId, fileName, size };
}

/**
 * Xoá media không còn component nào trong landing_config ĐÃ LƯU dùng tới (đổi/xoá video trong Builder để
 * lại dòng mồ côi). Chỉ gọi lúc MỞ cửa sổ Builder: lúc đó chưa có lịch sử Undo nào có thể trỏ lại 1
 * video cũ — dọn ở lúc Save thì Undo sau khi Save sẽ ra video đã mất.
 */
export function purgeUnusedMedia(sessionId: string) {
  const db = getDb(sessionId);
  const row = db.prepare(`SELECT landing_config FROM sessions WHERE id = ?`).get(sessionId) as
    | { landing_config: string | null }
    | undefined;
  const config = row?.landing_config ?? "";
  const ids = db.prepare(`SELECT id FROM media WHERE session_id = ?`).all(sessionId) as { id: string }[];
  const unused = ids.filter((m) => !config.includes(m.id));
  if (unused.length === 0) return;
  const del = db.prepare(`DELETE FROM media WHERE id = ?`);
  db.transaction(() => unused.forEach((m) => del.run(m.id)))();
  // SQLite không tự thu nhỏ file sau DELETE — thiếu VACUUM thì file session giữ nguyên dung lượng video đã bỏ.
  db.exec("VACUUM");
  for (const m of unused) fs.rmSync(path.join(CACHE_DIR, `${sessionId}_${m.id}`), { force: true });
}

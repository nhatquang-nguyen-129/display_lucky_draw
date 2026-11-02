/**
 * Đồng bộ file .db từ 1 thư mục Google Drive công khai ("Anyone with the link" có quyền View/Download)
 * vào data/ — dùng Google Drive API v3 với API key do người dùng tự tạo (KHÔNG OAuth, KHÔNG backend).
 * Đây là lời gọi network DUY NHẤT trong toàn bộ app — app vốn hoàn toàn offline, tính năng này là
 * ngoại lệ CHỦ Ý, chỉ chạy khi người dùng tự bấm Sync. Xem docs/architecture/drive-sync.md.
 *
 * Nguyên tắc an toàn: KHÔNG tự viết logic "đây có phải cùng 1 session không". File trùng tên với 1
 * file có sẵn trong data/ được lưu dưới tên tránh trùng (uniquePath(), giống hệt việc người dùng tự
 * tay copy 1 file trùng tên qua Finder/Explorer) — rescan()/listConflicts() đã có sẵn trong db.ts tự
 * phát hiện 2 file cùng sessions.id thật bên trong và SessionConflictDialog.tsx tự hiện ra cho người
 * dùng chọn, không cần code gì thêm ở đây.
 *
 * Chống tải lặp vô hạn: mỗi file tải thành công được ghi nhớ vào syncedFiles (Drive file id -> tên đã
 * lưu) trong data/.drive-sync.json — Sync lần sau thấy file đó vẫn còn đúng chỗ thì bỏ qua, không tải
 * lại/không tạo thêm bản sao -2, -3... mỗi lần bấm Sync trên 1 folder không đổi gì.
 */
import fs from "fs";
import path from "path";
import { DATA_DIR, uniquePath } from "./db";

const SYNC_SETTINGS_FILE = path.join(DATA_DIR, ".drive-sync.json");

export interface SyncSettings {
  apiKey: string;
  lastFolderUrl: string;
  syncedFiles: Record<string, string>;
}

export interface SyncFileResult {
  name: string; // tên gốc trên Drive
  savedAs?: string; // tên THẬT đã lưu trong data/, chỉ khác `name` khi bị đổi tên tránh trùng
  status: "downloaded" | "already-synced" | "skipped-not-db" | "error";
  message?: string;
}

export type SyncResult = { error: string } | { files: SyncFileResult[]; updatedSyncedFiles: Record<string, string> };

// Lưu trong data/ (giống .tab-order.json) để đi theo cùng bản portable khi copy sang USB/máy khác —
// bao gồm cả apiKey. Rủi ro thấp (key Drive chỉ-đọc, không phải mật khẩu tài khoản) nhưng vẫn là
// ngoại lệ ghi secret ra đĩa, đã xác nhận với chủ dự án trước khi làm.
export function readSyncSettings(): SyncSettings | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(SYNC_SETTINGS_FILE, "utf8"));
    if (typeof parsed?.apiKey !== "string" || typeof parsed?.lastFolderUrl !== "string") return null;
    return {
      apiKey: parsed.apiKey,
      lastFolderUrl: parsed.lastFolderUrl,
      // Tương thích file settings lưu từ trước khi field này tồn tại.
      syncedFiles: typeof parsed.syncedFiles === "object" && parsed.syncedFiles !== null ? parsed.syncedFiles : {},
    };
  } catch {
    return null;
  }
}

export function writeSyncSettings(settings: SyncSettings) {
  const tmp = `${SYNC_SETTINGS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), "utf8");
  fs.renameSync(tmp, SYNC_SETTINGS_FILE);
}

export function parseFolderId(url: string): string | null {
  const trimmed = url.trim();
  // https://drive.google.com/drive/folders/<id>  hoặc .../drive/u/0/folders/<id> (kèm query ?usp=sharing...)
  const pathMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (pathMatch) return pathMatch[1];
  // https://drive.google.com/open?id=<id>  hoặc dạng ?id=<id> khác
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return idParamMatch[1];
  // Chấp nhận luôn trường hợp người dùng dán sẵn ID trần (không phải URL).
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}

interface DriveListEntry {
  id: string;
  name: string;
  mimeType: string;
}

async function listDriveFiles(folderId: string, apiKey: string): Promise<DriveListEntry[] | { error: string }> {
  const files: DriveListEntry[] = [];
  let pageToken: string | undefined;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const fields = encodeURIComponent("files(id,name,mimeType),nextPageToken");
    const url =
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=1000&key=${encodeURIComponent(apiKey)}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");

    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      return { error: `Network error reaching Google Drive: ${(err as Error).message}. Check your internet connection.` };
    }

    if (!res.ok) {
      if (res.status === 403) {
        return {
          error:
            "Google Drive rejected the API key (403). Check that the key is correct and the Drive API is enabled for it in Google Cloud Console.",
        };
      }
      if (res.status === 404) {
        return { error: "Folder not found (404). Check the folder URL and that it's shared as \"Anyone with the link\"." };
      }
      const body = await res.text().catch(() => "");
      return { error: `Google Drive API error (HTTP ${res.status}): ${body.slice(0, 300)}` };
    }

    const data = (await res.json()) as { files?: DriveListEntry[]; nextPageToken?: string };
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}

async function downloadDriveFile(fileId: string, apiKey: string, destPath: string): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  // Ghi qua tên tạm rồi rename — rescan() lọc đúng đuôi .db nên không bao giờ thấy file đang tải dở.
  const tmp = `${destPath}.downloading`;
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, destPath);
}

export async function syncDriveFolder(
  folderUrl: string,
  apiKey: string,
  syncedFiles: Record<string, string>
): Promise<SyncResult> {
  const folderId = parseFolderId(folderUrl);
  if (!folderId) {
    return { error: "Could not find a folder ID in that URL. Paste the link from Google Drive's Share dialog." };
  }
  if (!apiKey.trim()) {
    return { error: "Enter a Google Drive API key." };
  }

  const listed = await listDriveFiles(folderId, apiKey);
  if ("error" in listed) return listed;

  const results: SyncFileResult[] = [];
  const updatedSyncedFiles: Record<string, string> = { ...syncedFiles };

  for (const file of listed) {
    if (file.mimeType.startsWith("application/vnd.google-apps.")) {
      results.push({ name: file.name, status: "skipped-not-db", message: "Google-native file (Doc/Sheet/...), not downloadable as-is" });
      continue;
    }
    if (!file.name.toLowerCase().endsWith(".db")) {
      results.push({ name: file.name, status: "skipped-not-db", message: "Not a .db file" });
      continue;
    }

    const previouslySavedAs = syncedFiles[file.id];
    if (previouslySavedAs && fs.existsSync(path.join(DATA_DIR, previouslySavedAs))) {
      results.push({ name: file.name, savedAs: previouslySavedAs, status: "already-synced" });
      continue;
    }

    const plainPath = path.join(DATA_DIR, file.name);
    const destPath = fs.existsSync(plainPath) ? uniquePath(DATA_DIR, file.name) : plainPath;
    const savedAs = path.basename(destPath);

    try {
      await downloadDriveFile(file.id, apiKey, destPath);
      updatedSyncedFiles[file.id] = savedAs;
      results.push({
        name: file.name,
        savedAs,
        status: "downloaded",
        message: savedAs !== file.name ? `Saved as ${savedAs} — a different local file already used this name.` : undefined,
      });
    } catch (err) {
      // 1 file lỗi không chặn các file còn lại — tiếp tục loop, báo lỗi riêng cho file này.
      results.push({ name: file.name, status: "error", message: (err as Error).message });
    }
  }

  return { files: results, updatedSyncedFiles };
}

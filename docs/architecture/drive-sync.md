# Drive Sync — tải file session mới từ 1 thư mục Google Drive công khai

Lời gọi network DUY NHẤT trong toàn bộ app (`electron/driveSync.ts`). App vẫn hoàn toàn offline cho
mọi tính năng khác — Sync là ngoại lệ CHỦ Ý, chỉ chạy khi người dùng tự bấm nút "Sync" (cạnh "Open"/
"Restore" ở `TabBar.tsx`, mở `DriveSyncModal.tsx`).

## Vì sao có tính năng này

App chuẩn bị dữ liệu bằng cách copy thư mục `data/` qua USB mang tới venue. Sync là 1 đường đi khác
cho đúng workflow đó: thay vì cầm USB, người tổ chức bỏ sẵn file session (`.db`) vào 1 thư mục Google
Drive share công khai ("Anyone with the link"), rồi ở máy venue chỉ cần dán link + bấm Sync thay vì
cắm USB.

## Chuẩn bị trước khi dùng — tạo API key + share folder

**1. Tạo API key** (1 lần, miễn phí, không cần thẻ tín dụng cho mức dùng đọc-only này):

1. Vào [console.cloud.google.com](https://console.cloud.google.com), đăng nhập Google account thường.
2. Góc trên: **Select a project → New Project** → đặt tên bất kỳ (vd "lucky-draw-sync") → **Create**.
   Đợi vài giây cho project tạo xong, đảm bảo đang CHỌN đúng project đó (menu project ở góc trên).
3. Thanh tìm kiếm trên cùng → gõ **"Google Drive API"** → chọn kết quả đầu → bấm **Enable**.
4. Menu trái → **APIs & Services → Credentials** → **+ Create Credentials** (trên cùng) →
   **API key**. Google tự sinh 1 chuỗi dạng `AIza...` — copy chuỗi này, dán vào ô "Google Drive API
   key" trong app.
5. (Khuyến nghị, không bắt buộc) Bấm **Edit API key** ngay trên popup vừa hiện → mục **API
   restrictions** → chọn **Restrict key** → tick đúng **Google Drive API** → **Save**. Giới hạn key
   chỉ dùng được cho Drive API, giảm rủi ro nếu key lỡ lộ ra ngoài (vd theo USB, xem mục "Vị trí lưu
   API key" bên dưới).

**2. Share folder công khai**: trong Google Drive, chuột phải folder chứa file `.db` → **Share** →
đổi **General access** từ "Restricted" sang **"Anyone with the link"**, quyền **Viewer** là đủ (không
cần Editor). Copy link từ nút **Copy link**, dán vào ô "Folder URL" trong app.

Không cần OAuth, không cần đăng nhập Google trong app — chỉ cần đúng 2 thứ này (API key + link công
khai) là Sync dùng được.

## URL hỗ trợ (`parseFolderId`)

- `https://drive.google.com/drive/folders/<id>` (kể cả `/drive/u/0/folders/<id>`, kèm query
  `?usp=sharing` tuỳ ý).
- `https://drive.google.com/open?id=<id>` hoặc bất kỳ URL nào có `?id=<id>`/`&id=<id>`.
- Dán thẳng 1 chuỗi ID trần (không phải URL) cũng được chấp nhận nếu đủ dài/đúng ký tự hợp lệ.

Không khớp dạng nào ở trên → trả lỗi rõ ràng ngay, không throw/crash.

## Nguyên tắc an toàn — KHÔNG tự viết logic conflict

`data/` chứa file `.db` có thể đang được 1 session MỞ ghi trực tiếp giữa lúc sự kiện diễn ra — Sync
tuyệt đối không ghi đè bất kỳ file nào đã có. Khi tên file tải về trùng 1 file có sẵn, xử lý giống hệt
việc người dùng tự tay copy 1 file trùng tên vào `data/` qua Finder/Explorer: lưu dưới tên tránh trùng
(`uniquePath()`, export từ `electron/db.ts`, hậu tố `-2`, `-3`...). Việc phát hiện "2 file này có THẬT
SỰ là cùng 1 session không" hoàn toàn nhường cho cơ chế đã có sẵn:

- `rescan()` (`db.ts`) mở mọi file `.db` trong `data/`, đọc `sessions.id` THẬT bên trong (không dựa
  vào tên file).
- `listConflicts()` nhóm các file cùng `sessions.id`, tính sẵn `recommended` = bản có `modifiedAt` mới
  nhất.
- `SessionConflictDialog.tsx` (render sẵn ở `Layout.tsx`, tự bật theo state app) hiện cho người dùng
  chọn giữ bản nào, hoặc "Keep both".

`DriveSyncModal.tsx` chỉ cần gọi `refresh()` (từ `SessionContext`) sau khi Sync tải được ≥ 1 file —
`refresh()` tự `sessions.list()` → tự `rescan()` → mọi conflict thật tự hiện ra, không có dòng code
conflict-resolution nào viết riêng cho Sync.

## Chống tải lặp vô hạn — manifest `syncedFiles`

Nếu mọi lần trùng tên đều tải + đổi tên tránh trùng vô điều kiện, bấm Sync lại trên 1 folder Drive
không đổi gì sẽ tạo thêm bản sao `-2`, `-3`... mỗi lần chạy. `data/.drive-sync.json` lưu thêm
`syncedFiles: Record<driveFileId, tênĐãLưu>` — mỗi file Drive được nhận diện lại qua chính `id` của nó
trên Drive (không phải tên), nên:

- File đã có trong `syncedFiles` VÀ bản đã lưu vẫn còn đúng chỗ → bỏ qua, không tải lại
  (`status: "already-synced"`).
- File chưa từng thấy, hoặc bản cũ đã bị xoá/di chuyển khỏi `data/` → tải lại bình thường (đưa trở
  lại nếu đã lỡ xoá, đúng tinh thần "sync").

## Vị trí lưu API key — đánh đổi USB-portability

`data/.drive-sync.json` (mirror đúng pattern `.tab-order.json` đã có: đọc try/catch fallback, ghi
tmp-file-rồi-rename atomic) lưu cả `apiKey` lẫn `lastFolderUrl` lẫn `syncedFiles`. Cố tình đặt TRONG
`data/` (không phải `userData` riêng từng máy) để đi theo đúng bản portable khi copy USB/máy khác —
dán key 1 lần, dùng được trên mọi máy mang theo bản đó đi venue. Đánh đổi: key nằm plaintext trong 1
file JSON, nếu cho mượn/mất USB thì key lộ theo — chấp nhận được vì đây là key Drive **chỉ-đọc**
(không phải mật khẩu tài khoản), nên restrict phạm vi key trong Google Cloud Console (chỉ bật Drive
API) để giảm rủi ro nếu lộ.

## Filter file — chỉ `.db`

File không kết thúc `.db`, hoặc có `mimeType` bắt đầu `application/vnd.google-apps.` (Google Docs/
Sheets/Slides — không tải được qua `alt=media`), bị bỏ qua với `status: "skipped-not-db"` kèm lý do,
không chặn các file `.db` khác trong cùng lượt Sync.

## File liên quan

| File | Vai trò |
|---|---|
| `electron/driveSync.ts` | Toàn bộ logic: parse URL, gọi Drive API v3, tải file, đọc/ghi settings |
| `electron/main.ts` | IPC `sync:driveFolder`/`sync:getSettings` |
| `electron/db.ts` | `uniquePath()` (export để tái dùng), `rescan()`/`listConflicts()` xử lý conflict thật |
| `src/components/DriveSyncModal.tsx` | UI nhập URL/API key, bảng kết quả per-file |
| `src/components/TabBar.tsx` | Nút "Sync" cạnh "Open"/"Restore" |
| `src/components/SessionConflictDialog.tsx` | Tự hiện khi có conflict thật, không đổi gì cho Sync |

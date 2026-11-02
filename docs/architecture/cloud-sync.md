# Cloud Sync — Push/Pull file session qua Cloudflare Worker + R2

Lời gọi network DUY NHẤT trong toàn bộ app (`electron/cloudSync.ts`) — ngoại lệ CHỦ Ý: chỉ chạy khi
người dùng tự bấm (nút "Cloud" ở `TabBar.tsx` / trang Settings), không thêm dependency (`fetch`
global), mọi tính năng khác vẫn 100% offline.

Thay cho Drive Sync (tải 1 chiều từ thư mục Google Drive công khai + API key, đã gỡ bỏ): Cloud Sync
**có chiều đẩy lên** (Push ngay trong app, không phải tự upload file lên Drive) và **có phiên bản**
(mỗi Push là 1 bản mới, giữ 10 bản gần nhất mỗi session). Server là Cloudflare Worker do chủ dự án tự deploy vào tài
khoản Cloudflare của mình — code ở `cloud/worker/`, KHÔNG phải dịch vụ dùng chung.

## Nguyên tắc — chỉ chuyển NGUYÊN file, không đồng bộ dữ liệu

Worker không mở file `.db`, không biết participant/prize là gì. Nó chỉ lưu và trả lại nguyên file — y
như copy file qua USB, chỉ khác đường đi. Mọi quyết định "2 file có phải cùng 1 session không / giữ bản
nào" vẫn nằm ở máy local, dùng đúng cơ chế đã có:

- **Push** chụp bản sao nhất quán của session đang mở bằng `VACUUM INTO` ra file tạm
  (`snapshotSession()` trong `db.ts`, cùng cách `duplicateSession()` làm) — an toàn kể cả lúc session
  đang được ghi, không đụng file gốc. Không bị Session Lock chặn (chỉ đọc).
- **Pull** KHÔNG BAO GIỜ ghi đè file có sẵn: lưu vào `data/` theo tên `<tên>__<8 ký tự id>.db`
  (`fileNameFor()`), trùng tên thì `uniquePath()` thêm `-2`, `-3`... Sau đó `refresh()` →
  `rescan()` → trùng `sessions.id` với session đang mở thì `SessionConflictDialog.tsx` tự hiện cho
  người dùng chọn — không có dòng code conflict nào viết riêng cho Cloud Sync.
- File Pull về được đặt **mtime = `modifiedAt` gốc** (thời điểm sửa cuối ở máy đã Push), không phải
  thời điểm tải — để `listConflicts()` gợi ý ("recommended") đúng bản được sửa gần nhất thật sự.

## Space và 2 loại mã

1 **Space** = 1 không gian lưu riêng (thường là 1 sự kiện/1 khách hàng). Tạo bằng `ADMIN_TOKEN` (chỉ
chủ dự án có, đặt bằng `wrangler secret put`), trả về đúng 1 lần 2 mã:

| Mã | Dạng | Quyền | Dùng ở đâu |
|---|---|---|---|
| Read code | `XXXXX-XXXXX` (Crockford base32, không phân biệt hoa thường, bỏ qua dấu gạch) | List + Pull | Máy venue, đọc qua điện thoại được |
| Write token | Chuỗi base64url dài | List + Pull + Push | Máy chuẩn bị dữ liệu |

Worker chỉ lưu **hash SHA-256** của mã trong R2 (`tokens/<hash>.json`) — lộ bucket cũng không lộ mã.
Mất mã thì tạo Space mới (không có cách lấy lại).

## Deploy Worker (1 lần)

Trong `cloud/worker/` (PowerShell):

```powershell
npm install
npx wrangler login                              # mở trình duyệt
npx wrangler r2 bucket create lucky-draw-sync   # đã tồn tại (code 10004) thì bỏ qua
npx wrangler deploy                             # in ra https://lucky-draw-sync.<subdomain>.workers.dev
npx wrangler secret put ADMIN_TOKEN             # dán 1 chuỗi ngẫu nhiên dài, lưu lại ở trình quản lý mật khẩu
```

- R2 cần bật trong Cloudflare Dashboard (bắt buộc khai thẻ thanh toán, kể cả khi chỉ dùng free tier 10GB).
- Phải `deploy` TRƯỚC `secret put` — secret gắn vào 1 Worker đã tồn tại.
- Chưa đặt `ADMIN_TOKEN` thì tạo Space luôn trả 401 — Worker không bao giờ "mở cửa" vì thiếu secret.

Tạo Space:

```powershell
$url = "https://lucky-draw-sync.<subdomain>.workers.dev"
Invoke-RestMethod -Method Post "$url/v1/spaces" `
  -Headers @{ Authorization = "Bearer <ADMIN_TOKEN>" } `
  -ContentType "application/json" -Body '{"name":"Year End Party 2026"}'
```

Tên Space chỉ là nhãn hiện trong app sau khi Connect — nên để không dấu (PowerShell 5.1 dễ làm hỏng
UTF-8 trong `-Body`).

Chạy thử local không cần deploy: `npm run dev` với `cloud/worker/.dev.vars` chứa `ADMIN_TOKEN=...`
(đã gitignore) — R2 giả lập nằm trong `.wrangler/state/`, URL `http://localhost:8787` (app chấp nhận
`http://` CHỈ cho localhost, còn lại bắt buộc `https://`).

## Dùng trong app

1 app chỉ dùng 1 cloud — khai báo kết nối 1 lần ở trang **Settings** (sidebar), không nằm trong cửa sổ
Cloud.

1. **Settings → Cloud Sync**: Server URL (điền sẵn `DEFAULT_WORKER_URL` trong `src/pages/Settings.tsx`)
   + Read code (+ Write token nếu máy này cần Push) → **Connect**. App gọi `GET /v1/space` kiểm tra
   từng mã, đúng thì lưu lại; lần sau mở Settings tự Connect lại để hiện tên Space.
2. Nút **Cloud** trên thanh tab (`CloudSyncModal.tsx`): mở ra là app tự so local với cloud (IPC
   `cloud:status`, mục bên dưới), mỗi session 1 dòng kèm trạng thái + đúng nút nên bấm — Push (IPC
   `cloud:push`, chỉ máy có write token) và/hoặc Sync (IPC `cloud:pull`, dropdown chọn bản, mặc định
   "Latest"). Session cần xử lý xếp lên đầu. Chưa khai báo kết nối → nút "Open Settings".
   KHÔNG có gì tự chạy nền — chỉ kiểm tra lúc mở cửa sổ/bấm Refresh (từng cân nhắc Auto sync định kỳ,
   chủ dự án quyết định bỏ).

## So sánh local ↔ cloud (`status()` trong `cloudSync.ts`)

Gộp session local (`listSessionFiles()` — kể cả tab đang Close) với session trên cloud theo
`sessions.id`:

| Trạng thái | Khi nào | Gợi ý |
|---|---|---|
| `in-sync` "Up to date" | Local khớp bản mới nhất trên cloud | — |
| `local-only` "Not in cloud" | Cloud chưa có session này | Push |
| `cloud-only` "Only in cloud" | Máy này chưa có | Sync |
| `local-newer` "Changed here" | Local khác `syncBase`, cloud vẫn = `syncBase` | Push |
| `cloud-newer` "Newer in cloud" | Local khớp 1 bản CŨ hơn trên cloud, hoặc local = `syncBase` mà cloud đã đổi | Sync |
| `diverged` "Changed on both" | Cả 2 cùng khác `syncBase`, hoặc chưa có `syncBase` mà không khớp bản nào | Cả 2 nút; nút chính theo bên sửa sau (so `modifiedAt`) |

**`syncBase`** (lưu trong `.cloud-sync.json`, theo sessionId) = hash của bản mà 2 bên giống nhau lần
cuối — ghi khi Push thành công hoặc khi `status()` thấy `in-sync`. KHÔNG ghi lúc Pull: nếu máy đang có
sẵn session đó, file vừa tải chỉ là 1 bản khác chờ chọn ở `SessionConflictDialog`; người dùng giữ bản
tải về thì lần kiểm tra sau tự thành `in-sync`.

**Hash nội dung** (`contentHash()`): sha256 của bản chụp `VACUUM INTO` nhưng **bỏ qua 4 byte schema
cookie** (offset 40–43 header SQLite). Đã thử trên dữ liệu thật (2026-11-02): chụp 2 lần cùng 1 file ra
byte giống hệt, nhưng chụp lại 1 file vừa tải từ cloud (tức chụp của 1 bản chụp) lệch đúng 4 byte này
vì mỗi lần `VACUUM INTO` tăng schema cookie lên 1 — không bỏ qua thì file vừa Sync về luôn bị coi là
"đã sửa". Metadata `sha256` gửi lên cloud cũng là hash này. Hash local được cache theo file + mtime nên
chỉ chụp lại session vừa có thay đổi (mỗi lần chụp đồng bộ, vài trăm ms với session nặng).

## Lưu cấu hình — `data/.cloud-sync.json`

Cùng pattern `.tab-order.json` (đọc try/catch fallback, ghi tmp-rồi-rename): `workerUrl`, `readCode`,
`writeToken`, `pulledVersions` (`"<sessionId>/<file>"` → tên đã lưu, chống Pull lặp), `syncBase`
(mục trên). Đặt TRONG `data/`
để đi theo bản portable sang máy khác.

Đánh đổi: **write token nằm plaintext** — ai cầm được thư mục `data/` là Push được vào Space đó (không
xoá được bản cũ ngoài cơ chế giữ 10 bản). Máy venue chỉ cần Pull thì **để trống Write token**. Bấm
**Disconnect** xoá sạch cả 3 mã khỏi file.

## API Worker (`cloud/worker/src/index.ts`)

Mọi request (trừ tạo Space) gửi `Authorization: Bearer <read code | write token>`.

| Method + path | Quyền | Việc |
|---|---|---|
| `POST /v1/spaces` | `ADMIN_TOKEN` | Tạo Space, trả `readCode` + `writeToken` (1 lần duy nhất) |
| `GET /v1/space` | read | `{ name, createdAt, role }` |
| `GET /v1/sessions` | read | Mọi bản mọi session, mới nhất trước, kèm metadata |
| `GET /v1/objects/<sessionId>/<pushedAtMs>.db` | read | Tải 1 bản, header `X-Sha256` |
| `POST /v1/uploads` | write | Bắt đầu multipart upload, body = metadata → `{ key, uploadId, partSize }` |
| `PUT /v1/uploads/<uploadId>/parts/<n>` | write | 1 phần (≤ 32MB), header `X-Upload-Key` |
| `POST /v1/uploads/<uploadId>/complete` | write | Ghép phần → xoá bản cũ quá 10 |
| `DELETE /v1/uploads/<uploadId>` | write | Huỷ upload dở (app gọi khi 1 phần lỗi) |

Metadata mỗi bản (R2 `customMetadata`): `sessionName` (URL-encoded để giữ tiếng Việt), `modifiedAt`,
`sha256` (= `contentHash()`), `appVersion`, `participantCount`. App kiểm tra lại hash sau khi tải — lệch thì báo lỗi,
không ghi file.

## File liên quan

| File | Vai trò |
|---|---|
| `cloud/worker/` | Cloudflare Worker + `wrangler.toml` (binding R2 `BUCKET`) — project riêng, `npm install` riêng |
| `electron/cloudSync.ts` | Connect/status/push/pull, `contentHash()`, đọc/ghi `.cloud-sync.json` |
| `electron/main.ts` | IPC `cloud:getSettings`/`connect`/`disconnect`/`status`/`push`/`pull` |
| `electron/db.ts` | `snapshotSession()` (VACUUM INTO), `listSessionFiles()`, `fileNameFor()`, `uniquePath()`, `rescan()`/`listConflicts()` |
| `src/pages/Settings.tsx` | Khai báo kết nối (Connect/Disconnect) — route `/settings`, mục "Settings" ở `Sidebar.tsx` |
| `src/components/CloudSyncModal.tsx` | So local ↔ cloud từng session, nút Push/Sync theo gợi ý |
| `src/components/TabBar.tsx` | Nút "Cloud" cạnh "Open"/"Restore" |
| `src/components/SessionConflictDialog.tsx` | Tự hiện khi Pull về trùng `sessions.id` — không đổi gì cho Cloud Sync |

File `data/.drive-sync.json` còn sót trên máy từng dùng Drive Sync không còn ai đọc — để nguyên vô
hại, xoá tay được.

Xem thêm: `database-schema.md` mục "Lưu trữ theo session".

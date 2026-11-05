# Cloud Sync — Push/Pull file session qua Cloudflare Worker + R2

Lời gọi network DUY NHẤT trong toàn bộ app (`electron/cloudSync.ts`) — ngoại lệ CHỦ Ý: chỉ chạy khi
người dùng tự bấm (nút "Cloud" ở `TabBar.tsx` / trang Settings), không thêm dependency (`fetch`
global), mọi tính năng khác vẫn 100% offline.

Máy hoàn toàn mới (chưa cài gì) cần chạy được app trước — xem [`docs/local/setup.md`](../local/setup.md)
(clone, Node 20, `npm install`, `electron-rebuild`). Mục này chỉ nói phần Cloud Sync riêng.

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

**Mất mã KHÔNG lấy lại được bằng bất kỳ cách nào, kể cả tự vào xem R2 bucket trực tiếp** (Dashboard
Cloudflare, `wrangler r2 object get`...) — R2 chỉ chứa `tokens/<hash-của-mã>.json`, 1 chiều, không suy
ngược lại mã gốc được. 2 mã chỉ xuất hiện đúng 1 lần, trong response của lệnh `POST /v1/spaces` lúc tạo
— lưu ngay vào trình quản lý mật khẩu lúc đó, đừng chỉ để trong terminal history.

Còn cách duy nhất khi mất mã: tạo Space MỚI (`POST /v1/spaces` với `ADMIN_TOKEN`, xem mục "Deploy
Worker" bên dưới) — ra `spaceId` khác hẳn, không đụng gì Space cũ. Nếu Space cũ CHƯA Push file nào thì
coi như không mất gì, tạo mới xong dùng luôn. Nếu đã lỡ Push rồi, file cũ vẫn còn nguyên trong R2 dưới
`spaces/<spaceId cũ>/` — không bị xoá, nhưng cũng không còn cách nào đọc lại được nữa vì không còn mã
nào trỏ tới `spaceId` đó (coi như mồ côi vĩnh viễn, muốn dọn thì tự xoá tay qua Dashboard R2).

## Deploy Worker (1 lần — chỉ cần làm trên MỘT máy, không phải mỗi máy)

Deploy gắn với tài khoản Cloudflare, không gắn với máy nào — làm 1 lần trên máy bất kỳ là Worker chạy
cho mọi máy sau này (`ADMIN_TOKEN` cũng vậy, chỉ là 1 secret phía server, không cần đặt lại ở máy
khác). Trong `cloud/worker/`:

**Windows (PowerShell)**

```powershell
npm install
npx wrangler login                              # mở trình duyệt
npx wrangler r2 bucket create lucky-draw-sync   # đã tồn tại (code 10004) thì bỏ qua
npx wrangler deploy                             # in ra https://lucky-draw-sync.<subdomain>.workers.dev
npx wrangler secret put ADMIN_TOKEN             # dán 1 chuỗi ngẫu nhiên dài, lưu lại ở trình quản lý mật khẩu
```

**macOS / Linux (bash/zsh)**

```bash
npm install
npx wrangler login                              # mở trình duyệt
npx wrangler r2 bucket create lucky-draw-sync   # đã tồn tại (code 10004) thì bỏ qua
npx wrangler deploy                             # in ra https://lucky-draw-sync.<subdomain>.workers.dev
npx wrangler secret put ADMIN_TOKEN             # dán 1 chuỗi ngẫu nhiên dài, lưu lại ở trình quản lý mật khẩu
```

- R2 cần bật trong Cloudflare Dashboard (bắt buộc khai thẻ thanh toán, kể cả khi chỉ dùng free tier 10GB).
- Phải `deploy` TRƯỚC `secret put` — secret gắn vào 1 Worker đã tồn tại.
- Chưa đặt `ADMIN_TOKEN` thì tạo Space luôn trả 401 — Worker không bao giờ "mở cửa" vì thiếu secret.

### Tạo Space

Dùng khi deploy lần đầu, hoặc khi cần tạo Space MỚI (mất `readCode`/`writeToken` của Space cũ — xem
mục trên). Có thể chạy từ BẤT KỲ máy nào, không cần đúng máy đã `deploy` — chỉ cần đúng `ADMIN_TOKEN`.

**Windows (PowerShell)**

```powershell
Invoke-RestMethod -Method Post "https://lucky-draw-sync.<subdomain>.workers.dev/v1/spaces" `
  -Headers @{ Authorization = "Bearer <ADMIN_TOKEN>" } `
  -ContentType "application/json" -Body '{"name":"Year End Party 2026"}'
```

Tên Space chỉ là nhãn hiện trong app sau khi Connect — nên để không dấu (PowerShell 5.1 dễ làm hỏng
UTF-8 trong `-Body`).

**macOS / Linux (bash/zsh)**

```bash
curl -X POST "https://lucky-draw-sync.<subdomain>.workers.dev/v1/spaces" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Year End Party 2026"}'
```

Cả 2 cách trả về đúng 1 lần `readCode`/`writeToken` — **copy trực tiếp từ cửa sổ terminal dán thẳng
vào Settings trong app**, đừng gõ lại tay hay chép qua trung gian (Notes/Word có thể tự đổi ký tự) —
1 ký tự sai là Connect báo lỗi, không có cách dò ra chỗ sai bằng mắt.

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

**Diverged — chỉ recommend, không tự quyết**: đây là trạng thái DUY NHẤT mà cả Push và Pull đều "hợp
lệ" cùng lúc, nên `row.newer` (`"local" | "cloud"`, so `modifiedAt`) được hiện thành dòng "Recommended:
Push/Pull" ngay dưới nhãn trạng thái trong `CloudSyncModal.tsx` (`SessionRow`) — chỉ là gợi ý hiển thị,
người dùng vẫn tự tick + bấm nút, không có gì tự Push/Pull hộ. Nếu người dùng chọn Pull cho 1 session
Diverged (thay vì theo gợi ý), nó tạo thêm 1 file cục bộ (xem phần Pull-never-overwrite ở trên) rồi
`SessionConflictDialog` tự hiện để chọn giữ bản nào — resolve xong dialog gọi
`notifyConflictResolved()` (`src/lib/cloudSyncEvents.ts`, pub/sub thuần renderer) để `CloudSyncModal`
(nếu đang mở) tự `loadStatus()` lại ngay, không cần bấm Refresh tay. Lưu ý: resolve xong chỉ xử lý
file trùng ở local — session có thể VẪN hiện Diverged/"Local newer" sau đó, vì nội dung local/cloud
chưa chắc đã khớp; cần Push thật để về "Up to date".

**Hash nội dung** (`contentHash()`): sha256 của bản chụp `VACUUM INTO` nhưng **bỏ qua 4 byte schema
cookie** (offset 40–43 header SQLite). Đã thử trên dữ liệu thật (2026-11-02): chụp 2 lần cùng 1 file ra
byte giống hệt, nhưng chụp lại 1 file vừa tải từ cloud (tức chụp của 1 bản chụp) lệch đúng 4 byte này
vì mỗi lần `VACUUM INTO` tăng schema cookie lên 1 — không bỏ qua thì file vừa Sync về luôn bị coi là
"đã sửa". Metadata `sha256` gửi lên cloud cũng là hash này. Hash local được cache theo file + mtime nên
chỉ chụp lại session vừa có thay đổi (mỗi lần chụp đồng bộ, vài trăm ms với session nặng).

## Thuật toán chi tiết — từng bước của `status()` / `push()` / `pull()`

Phần trên là bức tranh tổng quát; đây là đúng trình tự code chạy trong `electron/cloudSync.ts`, để sửa
hoặc debug không phải đọc lại code từ đầu.

### `status()` — so sánh từng session (chỉ đọc, 1 lượt network)

1. `requireConnected()` — chưa Connect thì báo lỗi ngay, không gọi network.
2. `fetchVersions()` — gọi `GET /v1/sessions` ĐÚNG 1 LẦN, lấy toàn bộ bản của toàn bộ session trong
   Space, nhóm theo `sessionId` (`byId`); mỗi nhóm Worker đã trả sẵn mới nhất trước nên `cloud[0]` luôn
   là bản mới nhất, không cần tự sort lại.
3. Với MỖI session local (`listSessionFiles()` — gồm cả tab đã Close, không chỉ tab đang mở):
   - Cloud chưa có bản nào (`cloud.length === 0`) → `local-only`, dừng ở đây.
   - Tính `hash = localHash(...)`: bản chụp hiện tại (mục Hash nội dung bên dưới), có cache theo
     `(file, mtimeMs)` nên session không đổi gì thì không tốn 1 lượt `VACUUM INTO` nào.
   - `hash === latest.sha256` → **in-sync**, và NHÂN TIỆN ghi luôn `syncBase = hash` — mỗi lần
     `status()` thấy khớp là 1 cơ hội "chốt lại gốc chung", không chỉ lúc Push thành công.
   - Không khớp bản mới nhất, nhưng khớp 1 bản CŨ hơn bất kỳ trong `cloud` (nghĩa là local chưa đổi gì
     kể từ lúc đó, cloud đổi tiếp sau), HOẶC khớp đúng `syncBase` đã lưu → **cloud-newer** (Pull về an
     toàn, không mất gì vì local chưa sửa).
   - Không khớp gì cả, nhưng bản MỚI NHẤT trên cloud lại khớp đúng `syncBase` (cloud y như lần đồng bộ
     cuối, chỉ local đổi) → **local-newer**.
   - Còn lại (cả 2 bên cùng đổi khác `syncBase`, hoặc chưa từng có `syncBase` để so) → **diverged**,
     kèm `newer` = bên có `modifiedAt` sau (chỉ để gợi ý, không dùng để tự quyết gì).
4. Session còn thừa trong `byId` sau bước 3 (có trên cloud, máy này chưa từng Pull) → `cloud-only`.
5. Ghi lại 1 LẦN mọi `syncBase` mới phát hiện ở bước 3 (`updateCloudSettings`). Toàn bộ hàm chỉ 1 lời
   gọi network (`GET /v1/sessions`), phần so sánh còn lại thuần cục bộ — gọi lại bao nhiều lần cũng an
   toàn (mở modal, bấm Refresh, sau khi resolve 1 conflict).

### `push()` — đẩy lên thành bản mới

1. Check có `writeToken` không (`readCode` không đủ quyền) — thiếu thì báo lỗi ngay, không mở DB nào.
2. Gọi `GET /v1/sessions` LẠI (không dùng kết quả `status()` đã có từ trước — trạng thái có thể đã đổi
   giữa lúc mở modal và lúc bấm Push) để biết `sha256` mới nhất hiện tại của mỗi session.
3. Với MỖI session được tick, xử lý TUẦN TỰ (không song song), theo đúng thứ tự trong danh sách:
   - Check `cancelSignal` trước khi bắt đầu phiên này — Cancel giữa lượt thì dừng ngay, các session
     sau trong danh sách không mở DB, không snapshot gì cả.
   - Đọc `name` + `participantCount` (loại trừ `status = 'removed'`) trực tiếp từ DB.
   - `snapshotToBuffer()`: `VACUUM INTO` ra file tạm trong `os.tmpdir()`, đọc vào buffer, LUÔN xoá file
     tạm trong `finally` (dù thành công hay lỗi).
   - Tính `hash`. Đã khớp bản mới nhất trên cloud (bước 2) → **bỏ qua upload hẳn**, chỉ cập nhật
     `syncBase`, trả `status: "unchanged"` — không tạo bản trùng, không tốn băng thông.
   - Khác hash → `uploadFile()` (chi tiết multipart ngay dưới).
   - Dù "pushed" hay "unchanged", LUÔN ghi `syncBase[sessionId] = hash` sau khi xong — Push coi như
     "chốt" lại gốc chung, bất kể có thật sự upload hay không.
   - Lỗi ở BẤT KỲ bước nào cho 1 session → ghi `status: "error"` kèm message, KHÔNG throw ra ngoài vòng
     lặp — session tiếp theo trong danh sách vẫn được xử lý như thường.

#### `uploadFile()` — multipart lên R2

1. `POST /v1/uploads` kèm metadata (`sessionId/sessionName/modifiedAt/sha256/appVersion/
   participantCount`) → Worker trả `{ key, uploadId, partSize }`.
2. Chia buffer thành từng phần `CLIENT_PART_SIZE` = 5MB (mức TỐI THIỂU R2 multipart cho mọi phần trừ
   phần cuối) — không dùng `partSize` 32MB Worker gợi ý, để có nhiều mốc báo tiến độ hơn cho 1 file vài
   chục MB (session nhiều ảnh nhúng trong Landing Builder).
3. Từng phần: `PUT /v1/uploads/<uploadId>/parts/<n>`, timeout = 0 (không tự abort) — mạng upload chậm
   ở Việt Nam có thể khiến 1 phần "treo" rất lâu (đã thấy > 15 phút) nhưng vẫn qua được nếu đợi đủ (xác
   nhận bằng test thật); retry tối đa 3 lần CHỈ khi lỗi là timeout/network thật (không retry lỗi Cancel
   hoặc lỗi server trả về rõ ràng kiểu validation), backoff tăng dần (`attempt × 5s`).
4. Mọi phần xong → `POST .../complete` với `{partNumber, etag}` của từng phần → Worker ghép thành 1
   object, tự xoá bản cũ vượt quá 10 (`pruneOldVersions()`, phía Worker, app không gọi gì thêm).
5. Lỗi ở bước nào (hết retry, hoặc throw khác) → `DELETE /v1/uploads/<uploadId>` dọn phần upload dở
   trên R2 TRƯỚC KHI throw tiếp ra `push()` — tránh rác chiếm dung lượng R2.

### `pull()` — tải về, không bao giờ ghi đè

1. Gọi `GET /v1/sessions` 1 lần, lấy danh sách bản hiện có (tra `name`/`sha256` đúng từng mục được
   chọn).
2. Với MỖI `{sessionId, file}` được chọn, xử lý TUẦN TỰ:
   - Check `cancelSignal` trước khi bắt đầu mục này.
   - Tra `pulledVersions["<sessionId>/<file>"]` — ĐÃ tải đúng bản này trước đó rồi và file vẫn còn
     trong `data/` → trả `already-pulled`, KHÔNG tải lại (chống Pull lặp tạo thêm `-2`, `-3`... vô ích
     cho đúng 1 bản).
   - Bản không còn tồn tại trên cloud nữa (đã bị `pruneOldVersions` dọn, hoặc ai đó Push đè) → lỗi rõ
     "refresh the list", không tải gì.
   - `GET /v1/objects/<sessionId>/<file>` — tải streaming (`readBodyWithProgress`), báo tiến độ theo
     `Content-Length` nếu có; `cancelSignal` được tự kiểm tra lại trong lúc đọc stream (không chỉ lúc
     bắt đầu) để dừng kịp giữa lúc đang tải dở 1 file lớn.
   - **Xác minh checksum**: so hash tính lại từ buffer vừa tải với header `X-Sha256` (hoặc
     `version.sha256` nếu thiếu header) — lệch thì BÁO LỖI NGAY, KHÔNG ghi file xuống đĩa (tránh lưu
     file hỏng do lỗi mạng giữa đường).
   - Ghi an toàn: viết ra `<dest>.downloading` rồi `renameSync` sang tên thật — `rescan()` lọc đúng
     đuôi `.db` nên không bao giờ thấy file đang tải dở nằm giữa `data/`.
   - Đặt lại `mtime` của file = `modifiedAt` GỐC (thời điểm sửa ở máy đã Push), KHÔNG phải thời điểm
     tải về — để lần `status()`/`SessionConflictDialog` sau gợi ý đúng bản nào mới hơn thật sự.
   - Ghi `pulledVersions[manifestKey] = savedAs`. **KHÔNG ghi `syncBase` ở đây** — xem lý do ở mục "So
     sánh local ↔ cloud" phía trên (chờ người dùng tự chọn giữ bản nào qua `SessionConflictDialog` nếu
     trùng `sessions.id` với session đang có).
   - Lỗi ở bước nào cũng không chặn các mục còn lại trong lượt.

### Cách ly lỗi & huỷ giữa chừng (áp dụng chung cho Push và Pull)

- Mỗi session/mỗi bản trong 1 lượt được xử lý tuần tự, ĐỘC LẬP — lỗi 1 cái (mất mạng giữa chừng, file
  bị xoá ngoài ý muốn, server trả lỗi) chỉ đánh dấu `status: "error"` cho đúng cái đó; các mục còn lại
  trong danh sách vẫn tiếp tục chạy hết, không bị kéo theo.
- `cancelSignal` (bấm Cancel hoặc đóng modal lúc đang chạy) được kiểm tra ở 2 chỗ: trước khi bắt đầu xử
  lý 1 session/bản MỚI (dừng cả lượt ngay, không mở thêm gì nữa), và bên trong request/stream ĐANG chạy
  (abort ngay, không đợi tải/upload xong mới dừng).
- Timeout tách biệt theo loại lời gọi: JSON nhỏ (status/connect/list/start-upload/complete-upload) =
  30s cố định; riêng PUT từng phần upload KHÔNG có timeout tự động (chỉ dừng bằng Cancel tay) — vì 1
  phần 5MB qua mạng upload chậm ở Việt Nam hoàn toàn có thể mất hơn 30s dù vẫn đang truyền bình thường,
  không phải treo.

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

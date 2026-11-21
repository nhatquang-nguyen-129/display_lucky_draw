# Cloud Sync — account đăng nhập, đồng bộ theo điểm chốt qua Cloudflare Worker + R2

Lời gọi network DUY NHẤT trong toàn bộ app (`electron/auth.ts` + `electron/cloudSync.ts`) — vẫn CHỦ Ý,
nhưng giờ **bắt buộc có mạng để đăng nhập + đồng bộ**, khác hẳn mô hình "100% offline, Cloud Sync chỉ
là ngoại lệ tuỳ chọn" trước đây (xem lịch sử ở Git nếu cần, mục này mô tả đúng hành vi HIỆN TẠI). Điều
vẫn đúng: participant/prize/draw/landing vẫn chạy trên 1 file SQLite local để nhanh (`better-sqlite3`,
đồng bộ) — mạng cần lúc **mở app/login** và ở các **điểm chốt đồng bộ** (xem mục "Đồng bộ theo điểm chốt"), không
phải cho từng thao tác quay số/sửa dữ liệu.

Máy hoàn toàn mới (chưa cài gì) cần chạy được app trước — xem [`docs/local/setup.md`](../local/setup.md)
(clone, Node 20, `npm install`, `electron-rebuild`). Mục này chỉ nói phần Cloud Sync/Account riêng.

## Cơ chế hoạt động (giải thích đơn giản, không cần đọc code)

Giống **phần mềm có kích hoạt bản quyền + tài khoản đăng nhập**: lần đầu cài, chủ sở hữu nhập 1 mã kích
hoạt (Access Code) và tạo tài khoản admin; từ đó mọi máy chỉ còn thấy màn đăng nhập username/password.
"Server" là 1 Cloudflare Worker do chính bạn deploy, dữ liệu là các session quay số của từng tài khoản.

```
App (máy của team)  ---HTTPS--->  Cloudflare Worker  <--->  R2 bucket
      │                            (URL cố định)                 │
      │  lần đầu: Access Code + tạo admin ─────────────────>     │
      │  sau đó: username + password  ─────────────────────>     │
      │                    Worker kiểm tra mật khẩu (PBKDF2)     │
      │  <───────────────── đúng thì cấp vé vào (sessionToken)   │
      │  dùng "vé" đó cho mọi lần sau (lấy session, lưu bài...)  │
      └──────────────────────────────────────────────────────────┘
```

| Thành phần | Là gì |
|---|---|
| **Server URL** (`WORKER_URL` trong `electron/config/cloudEnv.ts`) | Cố định sẵn trong code theo môi trường (dev/prod), người dùng không nhập |
| **Access Code** | CHÍNH LÀ secret `ADMIN_TOKEN` của Worker — chỉ chủ sở hữu biết. Dùng đúng 2 việc: kích hoạt lần đầu (tạo admin) và đặt lại mật khẩu admin |
| **Username + password** | Đăng nhập hằng ngày cho MỌI tài khoản (admin lẫn tài khoản team do admin tạo) |
| **R2 bucket** | Nơi Worker cất tài khoản (mật khẩu chỉ lưu dạng băm) + dữ liệu session của từng tài khoản |

Đăng nhập xong Worker phát 1 "vé tạm" (`sessionToken`), app dùng vé này cho các lần gọi tiếp theo. Vé
này cũng tạo ra luật "1 tài khoản chỉ 1 máy dùng tại 1 thời điểm" — Worker chỉ phát 1 vé hoạt động cho
mỗi tài khoản, máy khác đăng nhập khi vé cũ còn hiệu lực bị từ chối.

## Vì sao đổi từ Space ẩn danh sang Account

Trước đây "Space" (Read code/Write token dùng chung) không ngăn được việc 2 team/2 máy cùng sửa chung
1 dữ liệu — mỗi máy tự Push/Pull tay, dễ tạo conflict khi nhiều người mượn app cùng lúc. Giờ:

1. **Account thay Space** — mỗi account dữ liệu riêng hoàn toàn, tách biệt account khác.
2. **1 account chỉ 1 thiết bị đăng nhập hoạt động tại 1 thời điểm** — server (Worker) enforce bằng
   khoá phiên độc quyền + heartbeat, không phải app tự nhường nhau.
3. **Đồng bộ tự động theo điểm chốt** — không còn nút bấm tay; mỗi lần đồng bộ kiểm tra phiên bản trên
   cloud trước (khoá 1 máy chỉ đảm bảo không 2 máy ghi CÙNG LÚC, không đảm bảo máy vừa login có bản mới
   nhất), không bao giờ âm thầm đè bản mới hơn.
4. **Đúng 1 account admin** tạo mọi account khác (không ai tự đăng ký).

## Kích hoạt + đăng nhập username/password

**Màn đầu tiên** (`src/pages/Login.tsx`) phụ thuộc `GET /v1/status` (công khai, chỉ trả `activated`):

| Trạng thái | Màn hiện ra |
|---|---|
| Chưa kích hoạt (chưa có admin trên Worker) | 2 bước: **Welcome to Lucky Draw Studio** — 1 ô Access Code, Continue → Worker chỉ kiểm tra mã (`POST /v1/admin/verify-access-code`, sai thì ô rung + báo lỗi); đúng → trượt sang **Create Admin Account** (username + mật khẩu ×2) → tạo admin (`POST /v1/admin/activate`, kiểm tra lại Access Code) rồi đăng nhập luôn |
| Đã kích hoạt | **Sign in**: Username + Password. Máy khác KHÔNG còn thấy màn Access Code — kích hoạt lần 2 bị từ chối (409) |
| Quên mật khẩu admin | Link **"Forgot admin password?"** → Access Code + mật khẩu mới (`POST /v1/admin/reset-password`), trả lại username admin. Máy đang đăng nhập bằng mật khẩu cũ bị đăng xuất |

- **Access Code = secret `ADMIN_TOKEN`** của Worker (đặt ở Dashboard → Worker → Settings → Variables and
  Secrets, tick **Secret**). Đổi Access Code = đổi secret đó. Không có email/SMS khôi phục.
- **Tài khoản team** do admin tạo trong Settings → Accounts (username + mật khẩu ban đầu). Team quên mật
  khẩu → admin bấm **Reset password** đặt mật khẩu mới.
- Username: 3–32 ký tự (chữ, số, `.`, `-`, `_`), không phân biệt hoa thường, không trùng. Mật khẩu ≥ 8 ký
  tự.
- Mật khẩu lưu dạng **PBKDF2-SHA256** (salt riêng, 50.000 vòng — lưu số vòng theo từng tài khoản để tăng
  sau được), token chỉ lưu dạng hash — lộ R2 bucket cũng không lộ mật khẩu/token dùng thật.
- Sai mật khẩu 5 lần liên tiếp → khoá đăng nhập tài khoản đó 5 phút (HTTP 423). Sai username hay sai
  mật khẩu đều trả cùng 1 thông báo (không lộ username có tồn tại).
- Admin tạo theo kiểu login-code cũ (`/v1/admin/bootstrap`, `admin/bootstrapped.json`) KHÔNG được tính là
  đã kích hoạt (marker mới là `admin/activated.json`) và bị ẩn khỏi danh sách tài khoản — chỉ ảnh hưởng
  dữ liệu test ở Worker dev.

### Khoá phiên độc quyền + heartbeat

`POST /v1/login` chiếm 1 khoá độc quyền cho account đó (`accounts/<id>/active-session.json`). Máy đã
đăng nhập gửi `POST /v1/heartbeat` mỗi 30 giây (`electron/auth.ts`) để giữ khoá "tươi". Máy khác login
cùng account:

- Khoá còn tươi (heartbeat trong vòng 90 giây gần nhất) → **401/409 bị từ chối ngay** — phải đợi máy
  kia logout hoặc để khoá tự "nguội" (crash/mất mạng không heartbeat được trong 90s).
- Khoá đã nguội → được cấp khoá mới bình thường, không cần admin can thiệp.

Admin có lối thoát khẩn riêng (Settings → Accounts → **Force logout**) — nhả khoá ngay lập tức, không
cần đợi 90 giây, dùng khi 1 máy bị treo/mất mà team cần vào account đó ở máy khác gấp.

### Bắt buộc có mạng — mở app, mất mạng giữa buổi

- **Mở app lúc không có mạng** (hoặc Worker lỗi 5xx): không vào được app — màn **"No internet
  connection"** + nút Retry (`src/App.tsx` `<RequireAuth>`, `auth.getStartupStatus()`/`retryStartup()`).
  Phiên đã lưu KHÔNG bị xoá — có mạng lại bấm Retry là vào luôn, không phải nhập lại mã.
- **Mất mạng khi ĐANG dùng app KHÔNG tự đăng xuất** (`startHeartbeat()`): hiện **popup "Connection lost —
  reconnecting..."** (`ReconnectPopup.tsx`) ở cửa sổ chính, Landing Builder và Data Editor — KHÔNG hiện ở
  cửa sổ Present (đang chiếu lên LED, khán giả sẽ thấy; main.ts không gửi sự kiện tới cửa sổ đó). Quay số
  vẫn chạy bình thường, Confirm lúc mất mạng được đánh dấu "chưa đồng bộ" và tự đẩy khi có mạng lại
  (heartbeat thành công lại → `syncAll()`). Popup tự đóng; "Hide" chỉ ẩn tới lần mất mạng kế tiếp.
- **Chỉ đăng xuất khi server trả 401/403** (bị phiên khác chiếm, Force logout, account bị Disable —
  `isSessionInvalid()` trong `auth.ts`). Lỗi 5xx/429 (server lỗi tạm thời) xử lý y như mất mạng. Đăng xuất
  cục bộ (IPC `auth:revoked`) quay về màn Login ở cửa sổ chính — cửa sổ phụ đang mở vẫn chạy bình thường,
  phần chưa đồng bộ vẫn giữ cờ trên đĩa, lần login sau tự đẩy tiếp.

## Dữ liệu theo account — `data/accounts/<accountId>/`

Login xong, `electron/db.ts`'s `switchAccount(accountId)` trỏ lại toàn bộ `data/` (DATA_DIR/TRASH_DIR/
BACKUP_DIR/.tab-order.json) sang thư mục riêng của account đó — mọi session/tab vẫn hoạt động y hệt
trước (nhiều tab trong 1 account, Session Lock, Duplicate...), chỉ khác "gốc" vật lý. Logout
(`switchAccount(null)`) trả về thư mục gốc — **dữ liệu KHÔNG bị xoá**, máy quen (venue cố định) login
lại không cần tải lại từ đầu.

**Lần đầu 1 account login trên 1 máy**: nếu máy đó có sẵn file `.db` rời nằm thẳng trong `data/` (từ
trước khi có tính năng Account), app hỏi 1 lần "Found N sessions on this computer" (`Login.tsx`) — chọn
Import thì file được CHUYỂN (không copy) vào thư mục account, Skip thì để nguyên chỗ cũ, không đụng tới
(`listRootLooseSessionFiles()`/`importLooseFileToAccount()` trong `db.ts`).

## Đồng bộ theo điểm chốt (`electron/cloudSync.ts`)

Không đồng bộ liên tục, không có nút Push/Pull tay. Mọi IPC ghi dữ liệu chỉ **đánh dấu "chưa đồng bộ"**
(`markDirty`, không gọi mạng); đồng bộ thật chạy ở các **điểm chốt**:

| Điểm chốt | Cách đồng bộ |
|---|---|
| Bấm **Draw** (`draw:pick` — ghi 1 dòng `draw_results` chưa Confirm) | Chỉ đánh dấu |
| **Confirm** (`draw:commit`), **Reset session** | Đồng bộ ngay (gom 1,5s) — kết quả trúng giải chính thức luôn lên cloud |
| Edit/delete ở **cửa sổ chính**: prize, participant (kể cả Import/Replace), tạo/đổi tên/khoá/duplicate/đóng tab session | Đồng bộ ngay (gom 1,5s) |
| Cùng các IPC trên nhưng gọi từ **Landing Builder/Data Editor** (mỗi lần Save, đổi Data type, import video) | Chỉ đánh dấu → đồng bộ **1 lần lúc đóng cửa sổ** |
| **Đóng** Landing Builder / Data Editor / Present | Đồng bộ session đó |
| **Chuyển tab** (`sync:session` từ `SessionContext.tsx`) | Session vừa rời + kiểm tra session vừa mở |
| **Xoá** session | Xoá HÌNH THỨC: file local vào Trash + gửi dấu "đã xoá" lên cloud (`POST /v1/sessions/:id/delete`). Dữ liệu (mọi bản lưu) vẫn còn nguyên trên cloud — xem mục "Xoá session = xoá hình thức" |
| **Login**, mở app với phiên đã lưu, **có mạng lại** | `syncAll()` — toàn bộ account |
| **Thoát app**, Logout | `flushDirty()` — xem bên dưới |

Phân biệt cửa sổ gọi tới bằng `touched(e, sessionId)` trong `main.ts` (`BrowserWindow.fromWebContents(e.sender)`).

### Mỗi lần đồng bộ = kiểm tra rồi mới làm (`syncSession`)

Trạng thái local lưu ở `data/accounts/<id>/.sync-state.json`, mỗi session `{ baseVersion, baseHash,
dirty }` — `baseVersion` = bản cloud (tên file `<pushedAtMs>.db`) mà file local được dựng từ đó. Không
đổi schema SQLite. Session chưa có trong file này (vừa tạo, Duplicate, Restore, Import file rời) = "chưa
đồng bộ".

Hỏi Worker bản mới nhất (`GET /v1/sessions/:id/head` — rất nhẹ, không tải file), rồi:

| Local | Cloud so với `baseVersion` | Làm gì |
|---|---|---|
| Không sửa | Không đổi | Không làm gì (trường hợp phổ biến nhất — 1 request nhỏ) |
| Có sửa | Không đổi | **Push** — Worker kiểm tra lại `baseVersion` ở bước complete, lệch thì 409 |
| Không sửa | Mới hơn | **Pull** — thay file local (`replaceSessionFile`, bản cũ sao lưu vào `.backup/`) |
| Có sửa | Mới hơn (hoặc Push nhận 409) | **Giữ cả 2**: bản local tách thành session mới "<tên> (this computer)" (`forkSessionAsLocalCopy`), bản cloud giữ id gốc. Không bao giờ âm thầm đè |
| Không sửa | Đã bị xoá | Chuyển bản local vào Trash |
| Có sửa | Đã bị xoá | Push (ưu tiên không mất dữ liệu — Worker tự gỡ dấu xoá) |

- Session chưa có trạng thái mà nội dung y hệt bản cloud mới nhất → nhận luôn làm `baseVersion`, không
  tách bản thừa (vd mất file `.sync-state.json`).
- Không Pull đè/chuyển vào Trash session đang mở cửa sổ phụ (Present/Builder/Data Editor giữ dữ liệu
  trong bộ nhớ) — giữ nguyên, làm lại lúc đóng cửa sổ đó (`setBusyCheck`).
- Mỗi session chạy lần lượt, tối đa 1 lượt chờ phía sau lượt đang chạy — nhiều Confirm liên tiếp lúc mạng
  chậm chỉ gộp thành 1 lượt kế tiếp, không xếp hàng N lần upload.
- Lỗi mạng → giữ nguyên cờ, chấm trên tab báo lỗi, thử lại ở điểm chốt kế tiếp hoặc khi có mạng lại.
- `syncAll()` dùng luôn listing `GET /v1/sessions` (kèm `deleted[]`), tải về session cloud mà máy chưa có
  (trừ session đã bị xoá), rồi chạy đúng quy tắc trên cho từng session local.
- **Lưu ý hiệu năng**: mỗi lần đồng bộ vẫn chụp + đẩy NGUYÊN file (`VACUUM INTO`). Session nhúng video
  lớn (bảng `media`) thì mỗi Confirm là 1 lần upload nặng — nếu thực tế thấy chậm thì cân nhắc tách media
  hoặc chỉ đẩy riêng kết quả Confirm (đã bàn, chưa làm).

### Thoát app / Logout (`flushDirty`)

Đồng bộ mọi session còn cờ, chờ tối đa 5 giây (Logout: 10 giây). Thoát app mà vẫn còn session chưa xong →
hộp thoại **"Wait" / "Quit anyway"** (Wait = thử thêm tối đa 30 giây rồi hỏi lại). Chọn gì thì cờ vẫn còn
trên đĩa — lần login sau account này trên máy này tự đẩy tiếp.

### Chấm trạng thái

Tab (`TabBar.tsx`) chỉ hiện 2 biểu tượng: đám mây có mũi tên chạy lên (`CloudSyncIcon.tsx`) = đang đồng bộ, chấm than đỏ = lần gần nhất lỗi (tự thử
lại ở điểm chốt kế tiếp/khi có mạng lại). Đã lên cloud, hoặc chỉ "có sửa chưa đồng bộ" (chờ điểm chốt, vd
đang mở Data Editor), thì không hiện gì. `SessionsModal.tsx` ghi rõ trạng thái từng session.
Nguồn: `sync:getStatuses` + sự kiện `sync:status` (`src/lib/syncStatus.ts`).

Không còn lối "Browse..." mở file `.db` rời trên máy (dữ liệu nằm trên cloud của account) — danh sách
Open (`SessionsModal.tsx`) chỉ liệt kê session của account, nút **Refresh** = `syncAll()` rồi liệt kê lại.
`SessionConflictDialog` vẫn còn (generic) nhưng chỉ kích hoạt khi ai đó tự copy tay 1 file trùng id vào
thư mục dữ liệu.

### Tách môi trường dev/prod trên cùng 1 máy

`electron/config/cloudEnv.ts` (import ĐẦU TIÊN của `main.ts`): chạy chưa đóng gói (`npm run electron:dev`)
→ Worker `dev` + `userData` riêng `%APPDATA%\lucky-draw-app-dev` (không dùng chung phiên đăng nhập lẫn
`data/` với bản Setup cài trên cùng máy); bản đóng gói → Worker `prod`, `userData` mặc định. Phiên đã lưu
có `workerUrl` khác môi trường đang chạy → bỏ qua.

## Xoá session = xoá hình thức

Xoá session trong app (chuột phải tab → Delete) KHÔNG xoá dữ liệu trên cloud — chỉ ẩn khỏi account đó:

- Máy đang dùng: file vào Trash, dấu "đã xoá" (`accounts/<id>/deleted/<sessionId>.json`) gửi lên Worker. Session
  không còn hiện ở danh sách Open; máy khác của account đó khi đồng bộ cũng chuyển bản local vào Trash, và
  không bao giờ tải lại session đã xoá.
- Account tự khôi phục được: **Restore** trong Trash → lần đồng bộ kế tiếp đẩy lên lại, Worker tự gỡ dấu xoá.
- **Admin** xem + khôi phục session đã xoá của bất kỳ account nào: Settings → Accounts → chọn account → **View Session**
  (bảng mọi session của account đó, lọc Deleted, nút Restore). Restore chỉ gỡ
  dấu xoá — máy của account đó tự tải session về lại ở lần đồng bộ kế tiếp (login, Open → Refresh, có mạng
  lại). Admin không mở được nội dung session (Worker không đọc file `.db`). Session chưa từng lên cloud thì
  không hiện trong bảng (Worker không có bản nào).
- Không có thao tác xoá vĩnh viễn nào trong app (hộp thoại Restore chỉ có Restore) — kể cả Trash trên máy
  cũng không xoá hẳn. Muốn xoá hẳn dữ liệu trên cloud thì dọn tay qua Cloudflare Dashboard.

## Lưu session đăng nhập local — `safeStorage`, KHÔNG phải `data/`

`electron/auth.ts` lưu `{workerUrl, accountId, sessionToken}` mã hoá qua Electron `safeStorage` (OS
keychain) ở `app.getPath("userData")/auth-session.enc` — **CỐ Ý KHÔNG** theo pattern
`data/.cloud-sync.json` cũ (file JSON plaintext trong thư mục portable): đây là credential thật, không
nên đi theo khi ai đó copy `data/` sang máy/USB khác. `safeStorage.isEncryptionAvailable()` là `false`
(hiếm, vài cấu hình Linux không có keyring) → không lưu gì, bắt login lại mỗi lần mở app thay vì âm
thầm ghi plaintext.

## Quản lý account (Settings → Accounts, chỉ admin thấy)

| Việc | Route Worker | Ghi chú |
|---|---|---|
| Tạo account mới | `POST /v1/accounts` | `{username, password}` — admin tự đưa username/mật khẩu cho team |
| Liệt kê mọi account | `GET /v1/accounts` | Username, Online/Offline + lần cuối thấy, Disabled, **số session** (còn hiện / đã xoá), **dung lượng cloud** (mọi bản đang giữ, kể cả session đã xoá), **lần đồng bộ gần nhất** — tính từ đúng 1 lần list `accounts/`, không tốn thêm request |
| Team quên mật khẩu | `POST /v1/accounts/:id/reset-password` | `{password}` — đặt mật khẩu mới, mở khoá nếu đang bị khoá do sai nhiều lần |
| Xem mọi session của account + khôi phục session đã xoá | `GET /v1/accounts/:id/sessions`, `POST /v1/accounts/:id/restore-session` `{sessionId}` | Tick chọn 1 account rồi bấm **View Session** trên thanh công cụ (cạnh Reset Password / Logout / Disable / Create — Logout và Disable hỏi lại "Are you sure?"): bảng mọi session (lọc All/Active/Deleted) — tên, trạng thái, lần đồng bộ gần nhất, số participant, dung lượng bản mới nhất, dung lượng cloud + số bản đang giữ, phiên bản app; Restore cho session đã xoá |
| Máy bị treo, cần vào gấp ở máy khác | `POST /v1/accounts/:id/force-logout` | Nhả khoá ngay, không đợi 90s |
| Team ngừng mượn app | `POST /v1/accounts/:id/disable` / `/enable` | KHÔNG xoá dữ liệu trong R2 |

Admin KHÔNG đọc được participant/prize bên trong session của account khác — Worker vẫn chỉ chuyển file
`.db` opaque, không mở file ra xem (giống hệt nguyên tắc cũ của Space).

Dữ liệu của CHÍNH account Admin không có gì đặc biệt — vẫn login bằng 1 mã, vẫn có khoá phiên độc
quyền riêng, vẫn tự tạo session/quay số được như account thường (`accounts/<adminId>/sessions/...`).
Khác biệt DUY NHẤT là cờ `isAdmin: true` mở khoá bảng quản lý ở trên.

## Deploy Worker (1 lần — chỉ cần làm trên MỘT máy, không phải mỗi máy)

Deploy gắn với tài khoản Cloudflare, không gắn với máy nào. **2 môi trường tách biệt hoàn toàn** (Worker
+ R2 bucket riêng, dữ liệu không lẫn vào nhau), khai báo chung 1 file `cloud/worker/wrangler.toml` qua
`[env.dev]` — không phải 2 project/2 tài khoản Cloudflare riêng.

**Bước 0 — đổi subdomain tài khoản (1 lần, làm TRÊN Cloudflare Dashboard, không phải file code)**: mặc
định Cloudflare cấp 1 subdomain ngẫu nhiên dạng 1 từ liền (vd `luckydrawstudio`) — đổi sang dạng có gạch
nối `lucky-draw-studio` cho dễ đọc, ở Dashboard → **Workers & Pages** → Overview/Account Home → mục hiện
subdomain hiện tại, có nút đổi. Lưu ý: subdomain `workers.dev` là DUY NHẤT trên toàn Cloudflare (không
chỉ riêng tài khoản bạn) — cần thử xem tên còn trống không; đổi xong ảnh hưởng URL của **mọi** Worker
trong tài khoản, không chỉ riêng project này.

| Môi trường | Worker | R2 bucket | URL | Deploy | App nào trỏ vào |
|---|---|---|---|---|---|
| **prod** (mặc định, không `--env`) | `prod` | `lucky-draw-prod` | `prod.lucky-draw-studio.workers.dev` | `npx wrangler deploy` | Bản đóng gói thật (`npm run package`) |
| **dev** | `dev` | `lucky-draw-dev` | `dev.lucky-draw-studio.workers.dev` | `npx wrangler deploy --env dev` | `npm run electron:dev` (Vite dev server) |

Tên Worker ngắn (`prod`/`dev`) vì nằm trong URL. Bucket có tiền tố project (`lucky-draw-prod`/
`lucky-draw-dev`): bucket không nằm trong URL nào (chỉ hiện ở mục R2 riêng của Dashboard, tách khỏi danh
sách Worker), tên trần `prod`/`dev` sẽ không cho biết bucket thuộc project nào nếu tài khoản có thêm
project khác. Tạo bucket: Location **Automatic**, KHÔNG chọn jurisdiction, Storage Class **Standard**
(Infrequent Access tính phí đọc + tối thiểu 30 ngày lưu — app đọc/ghi thường xuyên và tự xoá bản cũ),
để **private** (chỉ Worker truy cập qua binding `BUCKET`).

`src/pages/Login.tsx`'s `WORKER_URL` tự chọn theo `import.meta.env.DEV` (Vite tự phân biệt dev server
với production build) — KHÔNG có cờ/biến nào phải nhớ truyền tay lúc build.

Trong `cloud/worker/`:

```bash
npm install
npx wrangler login                              # mở trình duyệt, làm 1 lần

# --- Prod ---
npx wrangler r2 bucket create lucky-draw-prod   # hoặc tạo trên Dashboard; đã tồn tại (code 10004) thì bỏ qua
npx wrangler deploy                             # in ra https://prod.lucky-draw-studio.workers.dev
npx wrangler secret put ADMIN_TOKEN              # dán 1 chuỗi ngẫu nhiên dài, lưu ở trình quản lý mật khẩu

# --- Dev ---
npx wrangler r2 bucket create lucky-draw-dev
npx wrangler deploy --env dev                   # in ra https://dev.lucky-draw-studio.workers.dev
npx wrangler secret put ADMIN_TOKEN --env dev   # nên đặt KHÁC prod — không sao nếu bị lộ, chỉ ảnh hưởng dữ liệu test
```

- R2 cần bật trong Cloudflare Dashboard (bắt buộc khai thẻ thanh toán, kể cả free tier 10GB) — làm 1 lần,
  dùng chung cho cả 2 môi trường.
- Phải `deploy` TRƯỚC `secret put` — secret gắn vào 1 Worker đã tồn tại.
- Nếu subdomain `lucky-draw-studio` không đặt được (đã có người khác dùng) — đổi sang tên khác ở Bước 0,
  rồi sửa lại `WORKER_URL` trong `electron/config/cloudEnv.ts` cho khớp.

### Kích hoạt (đúng 1 lần cho MỖI môi trường, NGAY TRONG APP)

Không còn chạy `curl` bootstrap. Sau khi deploy + đặt secret `ADMIN_TOKEN`, mở app (bản dev → Worker dev,
bản đóng gói → Worker prod): màn **Activate** hiện ra → nhập Access Code (= `ADMIN_TOKEN` của môi trường
đó) + username/mật khẩu admin. prod và dev là 2 Worker/2 bucket riêng nên mỗi bên kích hoạt riêng, nên
đặt `ADMIN_TOKEN` khác nhau.

Chạy thử Worker local không cần deploy: `npm run dev` trong `cloud/worker/` với `.dev.vars` chứa
`ADMIN_TOKEN=...` (đã gitignore) — R2 giả lập nằm trong `.wrangler/state/`, URL `http://localhost:8787`.

## API Worker (`cloud/worker/src/index.ts`)

Mọi request (trừ status/activate/reset-password admin/login) gửi `Authorization: Bearer <sessionToken>`.

| Method + path | Auth | Việc |
|---|---|---|
| `GET /v1/status` | — | `{activated}` — app chọn màn Activate hay Sign in |
| `POST /v1/admin/verify-access-code` | `{accessCode}` | Chỉ kiểm tra Access Code (bước 1 màn kích hoạt), không tạo gì. 401 sai mã, 409 đã kích hoạt |
| `POST /v1/admin/activate` | `{accessCode, username, password}` | Tạo admin (chỉ khi chưa kích hoạt; 401 sai Access Code, 409 đã kích hoạt) |
| `POST /v1/admin/reset-password` | `{accessCode, password}` | Đặt mật khẩu admin mới, trả `username`, nhả khoá phiên admin đang giữ |
| `POST /v1/login` | `{username, password, deviceId}` | Chiếm khoá phiên, trả `sessionToken` + `isAdmin`. 401 sai thông tin, 423 bị khoá do sai nhiều lần, 409 nếu máy khác giữ khoá còn tươi, 403 nếu bị Disable |
| `POST /v1/logout` | sessionToken | Nhả khoá (chỉ khi token còn khớp) |
| `POST /v1/heartbeat` | sessionToken | Làm mới khoá, trả lại `name`/`isAdmin` hiện tại |
| `GET /v1/sessions` | sessionToken | Mọi bản mọi session CỦA ACCOUNT ĐÓ, mới nhất trước, kèm metadata + `deleted[]` (session đã bị xoá) |
| `GET /v1/sessions/:id/head` | sessionToken | Bản mới nhất của 1 session (`version`, `sha256`) + cờ `deleted` — không tải file |
| `POST /v1/sessions/:id/delete` | sessionToken | Đánh dấu đã xoá (tombstone), KHÔNG xoá các bản đã lưu |
| `GET /v1/accounts/:id/sessions` | sessionToken (`isAdmin`) | Mọi session của 1 account: `status` (active/deleted), `deletedAt`, `lastSyncedAt`, `participantCount`, `appVersion`, `versions`, `latestSize`, `totalSize` (từ metadata bản mới nhất, không mở file; 2 lần list, không GET từng object) |
| `POST /v1/accounts/:id/restore-session` | sessionToken (`isAdmin`) | `{sessionId}` — gỡ dấu đã xoá |
| `GET /v1/objects/<sessionId>/<pushedAtMs>.db` | sessionToken | Tải 1 bản, header `X-Sha256` |
| `POST /v1/uploads` → `PUT .../parts/<n>` → `POST .../complete` / `DELETE` | sessionToken | Multipart upload. `complete` nhận `baseVersion`: cloud đã có bản khác `baseVersion` → huỷ upload, 409. Thành công trả `version` + gỡ dấu đã xoá |
| `POST /v1/accounts` | sessionToken (`isAdmin`) | Tạo account thường mới `{username, password}` |
| `GET /v1/accounts` | sessionToken (`isAdmin`) | Liệt kê mọi account |
| `POST /v1/accounts/:id/reset-password` \| `/force-logout` \| `/disable` \| `/enable` | sessionToken (`isAdmin`) | Xem bảng ở mục "Quản lý account" |

R2 layout: `accounts/<id>/account.json` (username, mật khẩu PBKDF2, isAdmin, disabled), `usernames/<username>.json`,
`admin/activated.json`, `accounts/<id>/active-session.json`,
`sessionTokens/<hash>.json`, `accounts/<id>/sessions/<sessionId>/<pushedAtMs>.db` (giữ 10 bản gần nhất
mỗi session, không đổi so với Space cũ — `pruneOldVersions()`), `accounts/<id>/deleted/<sessionId>.json`
(dấu đã xoá).

## Migration từ Space cũ

**Không có đường chuyển tự động.** Team nào đang dùng Read/Write code cũ cần được admin tạo account
mới (Settings → Accounts) với username/mật khẩu — chi phí 1 lần, đã được chủ dự án chấp nhận khi duyệt
thiết kế này. Dữ liệu từng Push lên Space cũ vẫn còn nguyên trong R2 dưới `spaces/<spaceId cũ>/` (không
tự xoá) nhưng không còn route nào đọc lại được qua app — dọn tay qua Cloudflare Dashboard nếu cần.

## File liên quan

| File | Vai trò |
|---|---|
| `cloud/worker/` | Cloudflare Worker + `wrangler.toml` (binding R2 `BUCKET`) — project riêng, `npm install` riêng |
| `electron/auth.ts` | Login/logout/heartbeat, lưu session qua `safeStorage`, quản lý account (admin) |
| `electron/config/cloudEnv.ts` | Chọn môi trường dev/prod (`WORKER_URL`) + `userData` riêng cho bản dev — import ĐẦU TIÊN của `main.ts` |
| `electron/cloudSync.ts` | `markDirty`/`syncSoon`/`syncSession`/`syncAll`/`flushDirty`/`markSessionDeleted`, `.sync-state.json`, `contentHash()`, multipart upload/download |
| `electron/db.ts` | `switchAccount()`, `listRootLooseSessionFiles()`/`importLooseFileToAccount()`, `snapshotSession()`, `listSessionFiles()`, `replaceSessionFile()`, `forkSessionAsLocalCopy()` |
| `electron/main.ts` | IPC `auth:*`/`sync:*`, `touched()` ở cuối các handler ghi dữ liệu, đồng bộ lúc đóng cửa sổ phụ, hộp thoại Wait/Quit anyway |
| `src/App.tsx` | `<RequireAuth>`: đã đăng nhập / màn Login / màn "No internet connection" |
| `src/pages/Login.tsx` | Màn đăng nhập (chỉ gửi mã, địa chỉ Worker do main process chọn) |
| `src/pages/Settings.tsx` | Card Account (Log out) + bảng quản lý Accounts (chỉ admin) |
| `src/components/SessionsModal.tsx` | Liệt kê + mở session của account đang login, trạng thái đồng bộ từng session, Refresh = `sync:all` |
| `src/components/ReconnectPopup.tsx` | Popup mất kết nối — dùng ở `Layout.tsx`, `LandingBuilderWindow.tsx`, `DataEditorWindow.tsx` (KHÔNG ở Present) |
| `src/components/TabBar.tsx`, `src/lib/syncStatus.ts` | Chấm trạng thái đồng bộ trên tab |
| `src/components/SessionConflictDialog.tsx` | Vẫn generic — chỉ kích hoạt khi có file trùng id bị copy tay vào thư mục dữ liệu |

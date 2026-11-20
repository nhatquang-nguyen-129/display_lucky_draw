# Cloud Sync — account đăng nhập, tự động Push/Pull qua Cloudflare Worker + R2

Lời gọi network DUY NHẤT trong toàn bộ app (`electron/auth.ts` + `electron/cloudSync.ts`) — vẫn CHỦ Ý,
nhưng giờ **bắt buộc có mạng để đăng nhập + đồng bộ**, khác hẳn mô hình "100% offline, Cloud Sync chỉ
là ngoại lệ tuỳ chọn" trước đây (xem lịch sử ở Git nếu cần, mục này mô tả đúng hành vi HIỆN TẠI). Điều
vẫn đúng: participant/prize/draw/landing vẫn chạy trên 1 file SQLite local để nhanh (`better-sqlite3`,
đồng bộ) — mạng chỉ cần lúc **login** và cho **auto-push chạy nền**, không phải cho từng thao tác quay
số/sửa dữ liệu.

Máy hoàn toàn mới (chưa cài gì) cần chạy được app trước — xem [`docs/local/setup.md`](../local/setup.md)
(clone, Node 20, `npm install`, `electron-rebuild`). Mục này chỉ nói phần Cloud Sync/Account riêng.

## Cơ chế hoạt động (giải thích đơn giản, không cần đọc code)

Dễ hình dung nhất: giống hệt **CD-key/serial key kết nối tới server kiểm tra bản quyền** của phần mềm
ngày trước — chỉ khác "server" ở đây là 1 Cloudflare Worker do chính bạn tự deploy, và "dữ liệu" thay vì
là trạng thái kích hoạt thì là các session quay số của account đó.

```
App (máy của team)  ---HTTPS--->  Cloudflare Worker  <--->  R2 bucket
      │                            (URL cố định,                │
      │                             giống "địa chỉ server")      │
      │                                                          │
      │  gửi Access Code  ─────────────────────────────────>     │
      │                       Worker băm mã, tra trong kho       │
      │                       xem khớp account nào               │
      │  <───────────────── đúng thì cấp vé vào (sessionToken)   │
      │                                                          │
      │  dùng "vé" đó cho mọi lần sau (lấy session, lưu bài...)  │
      └──────────────────────────────────────────────────────────┘
```

3 thành phần, tương đương với mô hình CD-key cũ:

| Khái niệm cũ (CD-key) | Tương đương trong app này | Là gì |
|---|---|---|
| Địa chỉ server kiểm tra bản quyền | **Server URL** (`WORKER_URL` trong `src/pages/Login.tsx`) | Cố định sẵn trong code, người dùng không cần biết/nhập — giống app ngày xưa đã "trỏ sẵn" vào đúng server của hãng |
| CD-key / serial number | **Access Code** | Chuỗi duy nhất gắn với 1 account — "đúng mã mới vào được", sai mã bị từ chối thẳng |
| Server lưu danh sách key hợp lệ | **R2 bucket** (kho lưu trữ của Cloudflare) | Nơi Worker cất giữ "mã nào thuộc account nào" + dữ liệu của account đó — y hệt server bản quyền ngày xưa lưu danh sách key đã bán |

Khác 1 chút so với CD-key ngày xưa: sau khi Access Code được chấp nhận, Worker không bắt gõ lại mã đó
mỗi lần — nó phát cho app 1 "vé tạm" (`sessionToken`), app dùng vé này cho các lần gọi tiếp theo (đỡ
phải gửi lại mã gốc liên tục). Vé này cũng chính là cái tạo ra luật "1 account chỉ 1 máy dùng được tại
1 thời điểm" — Worker chỉ phát 1 vé hoạt động cho mỗi account, máy khác xin vé mới khi vé cũ còn hiệu
lực sẽ bị từ chối thẳng.

Người dùng (team mượn app) hoàn toàn không cần biết/thấy gì về Worker/R2/Cloudflare — với họ chỉ đơn
giản là: "gõ đúng mã mới dùng được, sai mã thì không vào được dữ liệu."

## Vì sao đổi từ Space ẩn danh sang Account

Trước đây "Space" (Read code/Write token dùng chung) không ngăn được việc 2 team/2 máy cùng sửa chung
1 dữ liệu — mỗi máy tự Push/Pull tay, dễ tạo conflict khi nhiều người mượn app cùng lúc. Giờ:

1. **Account thay Space** — mỗi account dữ liệu riêng hoàn toàn, tách biệt account khác.
2. **1 account chỉ 1 thiết bị đăng nhập hoạt động tại 1 thời điểm** — server (Worker) enforce bằng
   khoá phiên độc quyền + heartbeat, không phải app tự nhường nhau.
3. **Push/Pull tự động hoàn toàn** — không còn nút bấm tay; vì luôn chỉ có đúng 1 thiết bị ghi, không
   cần thuật toán "diverged/2 bên cùng sửa" phức tạp như Space cũ.
4. **Đúng 1 account admin** tạo mọi account khác (không ai tự đăng ký).

## Đăng nhập bằng 1 mã — không username/password

Mỗi account có 1 **login code** (dạng `XXXXX-XXXXX`, Crockford base32, giống Read/Write code cũ) do
admin tạo trong Settings (`src/pages/Settings.tsx`, mục "Accounts"). KHÔNG có username/password/"quên
mật khẩu" — hệ thống không lưu email nào để khôi phục. Mất mã → admin bấm **Regenerate code** (mã cũ
hết hiệu lực ngay, cấp mã mới).

Worker chỉ lưu **hash SHA-256** của mã (`logincodes/<hash>.json`) — lộ R2 bucket cũng không lộ mã dùng
thật. Mã chỉ hiện đúng 1 lần lúc tạo/regenerate — copy ngay, đóng banner là mất, không hiện lại.

### Khoá phiên độc quyền + heartbeat

`POST /v1/login` chiếm 1 khoá độc quyền cho account đó (`accounts/<id>/active-session.json`). Máy đã
đăng nhập gửi `POST /v1/heartbeat` mỗi 30 giây (`electron/auth.ts`) để giữ khoá "tươi". Máy khác login
cùng account:

- Khoá còn tươi (heartbeat trong vòng 90 giây gần nhất) → **401/409 bị từ chối ngay** — phải đợi máy
  kia logout hoặc để khoá tự "nguội" (crash/mất mạng không heartbeat được trong 90s).
- Khoá đã nguội → được cấp khoá mới bình thường, không cần admin can thiệp.

Admin có lối thoát khẩn riêng (Settings → Accounts → **Force logout**) — nhả khoá ngay lập tức, không
cần đợi 90 giây, dùng khi 1 máy bị treo/mất mà team cần vào account đó ở máy khác gấp.

**Mất mạng tạm thời khi ĐANG đăng nhập KHÔNG tự đăng xuất** (`electron/auth.ts`'s `startHeartbeat()`
phân biệt `AuthNetworkError` — lỗi không tới được server — với lỗi server TRẢ VỀ rõ ràng như 401): chỉ
hiện banner "Reconnecting..." ở cửa sổ chính (`Layout.tsx`), KHÔNG đóng cửa sổ Present/Landing
Builder/Data Editor nào — app chạy live tại sự kiện, 1 lần rớt mạng ngắn không được phép làm gián đoạn
buổi quay số. Chỉ khi server trả lỗi THẬT (bị phiên khác chiếm) mới tự đăng xuất cục bộ (IPC
`auth:revoked`), quay về màn Login ở cửa sổ chính — cửa sổ phụ đang mở vẫn chạy bình thường cho tới khi
người dùng chủ động Logout.

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

## Auto-push / catch-up pull (`electron/cloudSync.ts`)

Không còn nút Push/Pull hay trạng thái "diverged" — vì chỉ có đúng 1 thiết bị ghi tại 1 thời điểm:

- **`scheduleAutoPush(sessionId)`**: gọi ở cuối mỗi IPC handler ghi dữ liệu (participants/prizes
  create-update-delete-bulk*, sessions rename/updateOptions/updateColumnTypes/updateColumnLabels/
  updateLandingConfig, draw pick/commit/resetSession, media importVideo — xem `electron/main.ts`).
  Debounce 5 giây theo từng session (nhiều sửa liên tiếp chỉ đẩy 1 lần), so hash với bản ĐÃ push/pull
  gần nhất của chính máy này (`lastPushedHash`, cache cục bộ — không cần hỏi lại server trước mỗi lần
  vì không còn ai khác ghi được). Tái dùng nguyên `snapshotSession()` (VACUUM INTO), `contentHash()`,
  protocol multipart upload từ bản Cloud Sync cũ.
- **`catchUpPull()`**: chạy ĐÚNG 1 LẦN ngay sau khi login xong — tải về mọi session account sở hữu trên
  cloud mà máy này CHƯA có (máy mới, hoặc máy khác vừa login account này lần đầu). Không reconcile gì
  thêm sau đó.
- **Flush lúc quit/blur**: đóng app hay mất focus cửa sổ chính đẩy nốt phần đang debounce
  (`flushPendingPushes`) — lúc quit giới hạn 3 giây rồi cho đóng LUÔN dù chưa xong (không bao giờ giữ
  chân người dùng, khác hẳn cơ chế "chặn quit chờ Push" của Space cũ).
- Không còn `SessionConflictDialog` liên quan tới Pull — dialog đó vẫn còn (generic, dùng chung toàn
  app) nhưng giờ chỉ thực sự kích hoạt bởi lối phụ "Browse..." (file ngoài `data/`, USB).

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
| Tạo account mới | `POST /v1/accounts` | Trả login code đúng 1 lần |
| Liệt kê mọi account | `GET /v1/accounts` | Tên, Online/Offline (có khoá phiên còn tươi không), Disabled |
| Mất mã | `POST /v1/accounts/:id/regenerate-code` | Mã cũ hết dùng được ngay |
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
| **prod** (mặc định, không `--env`) | `prod` | `prod` | `prod.lucky-draw-studio.workers.dev` | `npx wrangler deploy` | Bản đóng gói thật (`npm run package`) |
| **dev** | `dev` | `dev` | `dev.lucky-draw-studio.workers.dev` | `npx wrangler deploy --env dev` | `npm run electron:dev` (Vite dev server) |

Tên Worker VÀ tên R2 bucket đều là `prod`/`dev` — đồng bộ hoàn toàn. Bucket không nằm trong URL nào cả
(chỉ hiện trong mục R2 riêng của Cloudflare Dashboard, tách khỏi danh sách Worker) nên không ảnh hưởng
người dùng app; chấp nhận đánh đổi là nếu sau này có project khác trong CÙNG tài khoản Cloudflare này,
tên bucket `prod`/`dev` sẽ không tự nói lên là của project nào.

`src/pages/Login.tsx`'s `WORKER_URL` tự chọn theo `import.meta.env.DEV` (Vite tự phân biệt dev server
với production build) — KHÔNG có cờ/biến nào phải nhớ truyền tay lúc build.

Trong `cloud/worker/`:

```bash
npm install
npx wrangler login                              # mở trình duyệt, làm 1 lần

# --- Prod ---
npx wrangler r2 bucket create prod              # đã tồn tại (code 10004) thì bỏ qua
npx wrangler deploy                             # in ra https://prod.lucky-draw-studio.workers.dev
npx wrangler secret put ADMIN_TOKEN              # dán 1 chuỗi ngẫu nhiên dài, lưu ở trình quản lý mật khẩu

# --- Dev ---
npx wrangler r2 bucket create dev
npx wrangler deploy --env dev                   # in ra https://dev.lucky-draw-studio.workers.dev
npx wrangler secret put ADMIN_TOKEN --env dev   # nên đặt KHÁC prod — không sao nếu bị lộ, chỉ ảnh hưởng dữ liệu test
```

- R2 cần bật trong Cloudflare Dashboard (bắt buộc khai thẻ thanh toán, kể cả free tier 10GB) — làm 1 lần,
  dùng chung cho cả 2 môi trường.
- Phải `deploy` TRƯỚC `secret put` — secret gắn vào 1 Worker đã tồn tại.
- Nếu subdomain `lucky-draw-studio` không đặt được (đã có người khác dùng) — đổi sang tên khác ở Bước 0,
  rồi sửa lại `WORKER_URL` trong `src/pages/Login.tsx` cho khớp.

### Tạo account Admin (đúng 1 lần cho MỖI môi trường, NGOÀI app)

`ADMIN_TOKEN` CHỈ dùng cho bước này — mọi thao tác quản lý account khác sau đó admin tự làm trong app
bằng chính phiên đăng nhập của mình (Settings → Accounts), không cần biết `ADMIN_TOKEN` nữa. Gọi lại
lần 2 (trên CÙNG môi trường) sẽ bị từ chối (409 — đã có admin) — prod và dev là 2 Worker/2 R2 bucket
riêng nên mỗi bên cần bootstrap ADMIN riêng, không dùng chung được.

```bash
# Prod
curl -X POST "https://prod.lucky-draw-studio.workers.dev/v1/admin/bootstrap" \
  -H "Authorization: Bearer <ADMIN_TOKEN của prod>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin"}'

# Dev
curl -X POST "https://dev.lucky-draw-studio.workers.dev/v1/admin/bootstrap" \
  -H "Authorization: Bearer <ADMIN_TOKEN của dev>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin"}'
```

Trả về `loginCode` đúng 1 lần — dùng mã này đăng nhập ở màn Login của app (Server URL = URL Worker vừa
deploy). Chạy thử local không cần deploy: `npm run dev` trong `cloud/worker/` với `.dev.vars` chứa
`ADMIN_TOKEN=...` (đã gitignore) — R2 giả lập nằm trong `.wrangler/state/`, URL `http://localhost:8787`
(app chấp nhận `http://` CHỈ cho localhost, còn lại bắt buộc `https://`).

## API Worker (`cloud/worker/src/index.ts`)

Mọi request (trừ bootstrap/login) gửi `Authorization: Bearer <sessionToken>`.

| Method + path | Auth | Việc |
|---|---|---|
| `POST /v1/admin/bootstrap` | `ADMIN_TOKEN` | Tạo account admin đầu tiên (đúng 1 lần, xem mục trên) |
| `POST /v1/login` | `{loginCode, deviceId}` | Chiếm khoá phiên, trả `sessionToken` + `isAdmin`. 409 nếu máy khác giữ khoá còn tươi, 403 nếu bị Disable |
| `POST /v1/logout` | sessionToken | Nhả khoá (chỉ khi token còn khớp) |
| `POST /v1/heartbeat` | sessionToken | Làm mới khoá, trả lại `name`/`isAdmin` hiện tại |
| `GET /v1/sessions` | sessionToken | Mọi bản mọi session CỦA ACCOUNT ĐÓ, mới nhất trước, kèm metadata |
| `GET /v1/objects/<sessionId>/<pushedAtMs>.db` | sessionToken | Tải 1 bản, header `X-Sha256` |
| `POST /v1/uploads` → `PUT .../parts/<n>` → `POST .../complete` / `DELETE` | sessionToken | Multipart upload — không đổi so với bản cũ, chỉ auth khác |
| `POST /v1/accounts` | sessionToken (`isAdmin`) | Tạo account thường mới |
| `GET /v1/accounts` | sessionToken (`isAdmin`) | Liệt kê mọi account |
| `POST /v1/accounts/:id/regenerate-code` \| `/force-logout` \| `/disable` \| `/enable` | sessionToken (`isAdmin`) | Xem bảng ở mục "Quản lý account" |

R2 layout: `accounts/<id>/account.json`, `logincodes/<hash>.json`, `accounts/<id>/active-session.json`,
`sessionTokens/<hash>.json`, `accounts/<id>/sessions/<sessionId>/<pushedAtMs>.db` (giữ 10 bản gần nhất
mỗi session, không đổi so với Space cũ — `pruneOldVersions()`).

## Migration từ Space cũ

**Không có đường chuyển tự động.** Team nào đang dùng Read/Write code cũ cần được admin tạo account
mới (Settings → Accounts) và cấp login code mới — chi phí 1 lần, đã được chủ dự án chấp nhận khi duyệt
thiết kế này. Dữ liệu từng Push lên Space cũ vẫn còn nguyên trong R2 dưới `spaces/<spaceId cũ>/` (không
tự xoá) nhưng không còn route nào đọc lại được qua app — dọn tay qua Cloudflare Dashboard nếu cần.

## File liên quan

| File | Vai trò |
|---|---|
| `cloud/worker/` | Cloudflare Worker + `wrangler.toml` (binding R2 `BUCKET`) — project riêng, `npm install` riêng |
| `electron/auth.ts` | Login/logout/heartbeat, lưu session qua `safeStorage`, quản lý account (admin) |
| `electron/cloudSync.ts` | `scheduleAutoPush`/`catchUpPull`/`flushPendingPushes`, `contentHash()`, multipart upload/download |
| `electron/db.ts` | `switchAccount()`, `listRootLooseSessionFiles()`/`importLooseFileToAccount()`, `snapshotSession()`, `listSessionFiles()` |
| `electron/main.ts` | IPC `auth:*`, hook `scheduleAutoPush` ở cuối các handler ghi dữ liệu |
| `src/pages/Login.tsx` | Màn đăng nhập (full-screen, wrap bởi `<RequireAuth>` trong `src/App.tsx`) |
| `src/pages/Settings.tsx` | Card Account (Log out) + bảng quản lý Accounts (chỉ admin) |
| `src/components/SessionsModal.tsx` | Liệt kê + mở session của account đang login, chấm "Saving..." thụ động, Browse phụ cho file ngoài `data/` |
| `src/components/Layout.tsx` | Banner "Reconnecting..." khi mất mạng tạm thời (`ConnectivityBanner`) |
| `src/components/SessionConflictDialog.tsx` | Vẫn generic — giờ chỉ thực sự kích hoạt bởi lối phụ Browse |

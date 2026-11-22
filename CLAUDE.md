# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này.

## Project

Lucky Draw Studio — app desktop Electron chạy quay số trúng thưởng cho sự kiện. Dữ liệu lưu SQLite cục bộ (participant/prize/draw/landing vẫn chạy trên 1 file `.db` local để nhanh, `better-sqlite3` đồng bộ — không phải mọi thao tác cần mạng). Mỗi "phiên quay số" là 1 tab kiểu Chrome, độc lập hoàn toàn về participants/prizes với nhau, gắn vào 1 **account** đã đăng nhập.

App dùng mô hình **account đăng nhập, BẮT BUỘC có mạng lúc login + để đồng bộ nền** — KHÔNG còn "100% offline" như trước (quyết định kiến trúc đã duyệt, xem `docs/architecture/cloud-sync.md`). Lần đầu mở app (Worker chưa có admin) hiện màn **Activate**: Access Code (= secret `ADMIN_TOKEN` của Worker) + tạo admin; đã kích hoạt thì mọi máy chỉ thấy màn đăng nhập **username/password** (quên mật khẩu admin → Access Code đặt lại; tài khoản team do admin tạo/đặt lại mật khẩu trong Settings → Accounts, `src/pages/Settings.tsx`). Chỉ **1 thiết bị đăng nhập hoạt động tại 1 thời điểm** (khoá phiên độc quyền + heartbeat phía Cloudflare Worker, `cloud/worker/`). Đăng nhập xong, `data/` của máy tự trỏ sang thư mục riêng của account đó (`electron/db.ts`'s `switchAccount()`) và đồng bộ cloud **tự động theo điểm chốt** (`electron/cloudSync.ts`) — **mục tiêu: cloud gần realtime nhất có thể so với app, không tốn request thừa, không làm app chờ mạng** (mọi thay đổi về đồng bộ đánh giá theo độ trễ / số request / dung lượng mỗi lần đẩy — xem mục "Mục tiêu" + "Lộ trình tối ưu" trong `docs/architecture/cloud-sync.md`): mọi IPC ghi dữ liệu chỉ `markDirty`, đồng bộ thật chạy khi Confirm/edit-delete ở cửa sổ chính/đóng cửa sổ Builder-Data Editor-Present/chuyển tab/login/thoát app — mỗi lần đồng bộ kiểm tra phiên bản cloud (`baseVersion`) trước, không bao giờ đè bản mới hơn. IPC ghi dữ liệu MỚI phải gọi `touched(e, sessionId)` ở cuối handler (`main.ts`). Không còn nút Push/Pull tay, không còn Space ẩn danh/Read-Write code cũ. Thoát app = đăng xuất (`auth.logoutOnQuit` sau khi đẩy nốt dữ liệu) — mở app luôn phải đăng nhập lại. Mở app không có mạng → màn "No internet connection" (không vào được app); mất mạng lúc đang dùng KHÔNG tự đăng xuất/đóng cửa sổ nào (chỉ hiện popup "Reconnecting...", không hiện ở cửa sổ Present); chỉ bị đăng xuất khi server trả 401/403 (`auth:revoked`). Bản dev dùng Worker `dev` + `userData` riêng (`electron/config/cloudEnv.ts`). Xem `docs/architecture/cloud-sync.md` cho đầy đủ: route Worker, R2 layout, điểm chốt đồng bộ, lưu session local qua `safeStorage`, quản lý account (admin).

Stack: Electron + Vite + React + TypeScript + better-sqlite3 + Tailwind CSS.

## Định hướng công nghệ

| Layer | Công nghệ | Vì sao chọn |
|---|---|---|
| Desktop shell | Electron | Duy nhất cho phép build app offline chạy Windows/macOS từ 1 codebase web, có `fs`/`shell` native |
| UI | React 18 + TypeScript | Component model phù hợp Builder kiểu kéo-thả, TS bắt lỗi sớm cho 1 codebase nhiều kiểu dữ liệu (Participant/Prize/LandingComponent...) |
| Build/dev server | Vite | Hot-reload nhanh cho renderer, tách biệt rõ với build electron (`tsc -p electron/tsconfig.json`) |
| Styling | Tailwind CSS | Không cần thêm build step riêng cho CSS, style inline ngay cạnh JSX — hợp với tốc độ lặp UI nhanh của 1 app 1 người maintain |
| DB | better-sqlite3 | Đồng bộ (synchronous API) — tránh phải quản lý async/await cho MỌI query trong 1 app vốn đã nhiều IPC async rồi; là **native module** nên bắt buộc `electron-rebuild` mỗi khi đổi Electron version hay `npm install` lại |
| Router | react-router-dom | Điều hướng giữa các trang trong cửa sổ chính + định tuyến cho 2 loại cửa sổ phụ (`/present/:sessionId`, `/landing-builder/:sessionId`) |
| Import dữ liệu | papaparse (CSV), xlsx (Excel) | Import participant từ file người tổ chức đã có sẵn |

Nguyên tắc chọn công nghệ mới cho dự án này: ưu tiên giải pháp **không thêm dependency** nếu CSS/Canvas 2D/API trình duyệt sẵn có đã làm được (xem `docs/landing/builder.md` mục 11 — ví dụ cụ thể cho hiệu ứng đồ hoạ), vì đây là app 1 người maintain, phần lõi (quay số/sửa dữ liệu) vẫn chạy trên SQLite local — mỗi dependency mới là thêm rủi ro bảo trì dài hạn, không phải chỉ chi phí cài đặt ban đầu. Không thêm thư viện "phòng khi cần" — chỉ thêm khi có nhu cầu cụ thể đã thử cách hiện có không đủ.

## Lệnh hay dùng

- `npm run electron:dev` — chạy dev (Vite + Electron song song). Sửa file trong `electron/` phải tắt bật lại lệnh này, không hot-reload như phần renderer.
- `npm run package` — build production qua electron-builder, output vào `release/`: `…-win.zip` (bản thư mục/portable, có thư mục mẹ, tự nén bằng `electron/make-portable-zip.mjs`) + `…-win\` (zip đó giải nén sẵn, dùng ngay) + `…-Setup.exe` (Installer) trên Windows — luôn đủ 3 lựa chọn này; `…-mac.zip` (universal, ký ad-hoc) trên Mac — luôn build cho hệ điều hành đang chạy. Xem `docs/deploy/`.
- `npx electron-rebuild` — bắt buộc chạy lại mỗi khi `npm install` xong hoặc đổi version Electron, vì `better-sqlite3` là native module, không rebuild sẽ lỗi `NODE_MODULE_VERSION mismatch`.

## Quy tắc commit & push

Khi được yêu cầu "commit từng file" (hoặc nhiều file đổi vì nhiều lý do khác nhau trong cùng 1 phiên
làm việc) — **mỗi file 1 commit riêng, message viết riêng theo đúng nội dung đổi của file đó**, không
dùng 1 message chung chung rồi lặp lại y hệt cho mọi file (kiểu "Update X.tsx", "Update Y.tsx" — không
nói lên file đó thực sự đổi gì). Message phải mô tả **thay đổi thật** trong file đó: đổi UI gì, bỏ phần
nào, thêm field/behavior gì — không phải tên file hay "misc changes". Hai file đổi cùng lúc vì cùng 1 lý
do (vd tách 1 tính năng ra 2 file) vẫn có thể gộp 1 commit nếu nó là 1 đơn vị thay đổi hợp lý — quy tắc
ở đây là "message phải khớp nội dung", không phải "luôn luôn 1 file 1 commit cứng nhắc" khi việc tách
file nhỏ hơn sẽ làm lịch sử khó đọc hơn thay vì dễ hơn.

Chỉ commit khi người dùng yêu cầu rõ ràng (không tự ý commit). Chỉ push khi được yêu cầu rõ ràng riêng,
kể cả sau khi đã commit xong.

## Kiến trúc quan trọng — đọc trước khi sửa

- **Mô hình tab/session**: `src/context/SessionContext.tsx` quản lý tab đang active. MỌI bảng liên quan participant/prize đều có cột `session_id` — bất kỳ IPC handler hay query mới nào thêm vào bảng `participants`/`prizes` đều PHẢI lọc theo `session_id`, không được quên (đã từng vỡ ở `Dashboard.tsx`/`Prizes.tsx` do quên việc này).
- **Session Lock** (`sessions.locked`, chuột phải vào tab trong `TabBar.tsx` để đổi), 2 mức: **Input lock** (`2`) chỉ chặn sửa/xoá participant/prize + Data Editor, vẫn quay số/sửa Landing/trình chiếu thoải mái; **Full lock** (`1`, giá trị cũ) chặn toàn bộ — KHÔNG phải bảo mật (không password), chỉ tránh thao tác nhầm. Chặn thật nằm ở đầu mỗi IPC handler liên quan trong `main.ts`, không phải chỉ disable nút: IPC mới đụng participant/prize/cấu hình dữ liệu → gọi `assertInputsUnlocked()`; IPC mới ghi dữ liệu khác hay mở cửa sổ edit → `assertSessionUnlocked()` (chỉ chặn Full lock). Renderer dùng `src/lib/sessionLock.ts`. Xem `docs/architecture/session-lock.md`.
- **IPC 3 lớp bắt buộc đồng bộ khi thêm field/API mới**: `electron/main.ts` (handler thật) → `electron/preload.ts` (expose qua contextBridge) → `src/types.ts` (khai báo type `window.api`). Thiếu 1 trong 3 sẽ lỗi TS hoặc lỗi runtime "not a function".
- **Renderer KHÔNG được tự đọc file qua `fetch("file://...")`** — bị Chromium chặn do `contextIsolation: true`. Mọi thao tác đọc file phải qua IPC, main process đọc bằng `fs` rồi trả nội dung qua `ipcMain.handle`. Xem `dialog:openAndReadFile` trong `main.ts` làm mẫu.
- **Data Editor** (`src/components/DataEditorModal.tsx` + `src/lib/dataEditor/`): dùng Command Pattern — mọi thao tác sửa dữ liệu (sửa ô, Clean, Generate, xoá dòng...) đều là 1 object `{ execute, undo }` thuần, chạy qua `useCommandHistory`. Thêm tính năng mới cho Data Editor → viết thêm 1 command trong `commands.ts`, không sửa trực tiếp state trong component.
- **Participant KHÔNG có field "cố định" theo nghĩa cũ nữa — chỉ có Data Type**: import (`Participants.tsx`) đưa NGUYÊN mọi cột file vào `extra_data`, generic hoàn toàn, không đoán/match tên cột. Cột SQL `name`/`phone`/`code`/`email` trên bảng `participants` vẫn tồn tại (tương thích ngược cho dữ liệu cũ) nhưng KHÔNG còn được ghi bởi luồng mới, và Data Editor chỉ hiện chúng khi đang có dữ liệu thật (`isCoreFieldActive`). "Cột nào là Name/Phone/Code/Email" xác định ĐỘNG qua `sessions.participant_column_types` (dropdown "Data type" trong Data Editor — đây là cơ chế DUY NHẤT, không có thao tác "Use as"/di chuyển dữ liệu nào cả) — dùng `resolveColumnForType` (`validate.ts`), `resolveParticipantDisplayField` (`src/lib/landing/types.ts`), hoặc `resolveParticipantField` (`electron/participantFields.ts`) tuỳ nơi gọi (3 bản song song vì `electron/` không import được `src/`). Draw Engine (thuật toán CHỌN ai trúng, `drawEngine.ts`) chỉ dùng `participant.id`/`status`, KHÔNG bao giờ cần biết field nào tên gì — nhưng tên hiển thị của người trúng (`participantName`/`participant_name`...) PHẢI resolve qua các hàm trên, không đọc cứng `p.name`. Xem `docs/participants/column-mapping.md` + `docs/architecture/draw-engine.md`.
- **Màu sắc** (nguyên tắc thiết kế UI/UX — chốt theo brand guideline): nền chính luôn **trắng #FFFFFF** (`base-950`); mọi tính năng/button/text **KHÔNG dùng màu đen thuần** — xoay quanh 3 màu thương hiệu định nghĩa 1 chỗ duy nhất trong `tailwind.config.js` (`gold` = xanh đậm #283F94, `teal` = xanh nhạt #56BCF6, `highlight` = vàng #F5BE41 — tên biến giữ nguyên từ bản theme tối cũ, đừng nhầm theo nghĩa đen của tên). Text thường vẫn dùng thang `base-100`…`base-500` (xám) khi cần độ tương phản trung tính, nhưng điểm nhấn (heading, nút chính, trạng thái) ưu tiên 3 màu trên thay vì đen/xám đậm.
- **Nút bấm** (nguyên tắc UI/UX): các nút **đứng cạnh nhau hoặc cùng 1 cụm điều khiển** (thanh công cụ, chân popup Cancel/Confirm, hàng nút trong 1 dòng) phải **cùng kích thước** — cùng chiều cao VÀ cùng chiều rộng (đặt `w-…` cố định chung cho cả cụm, đủ cho nhãn dài nhất), không để mỗi nút co theo độ dài chữ. **Màu nút KHÔNG áp dụng bộ màu thương hiệu ở dòng trên** — giữ nguyên kiểu nút sẵn có của app (các variant `primary`/`secondary`/`danger`/`ghost` trong `src/components/Button.tsx`, nút viền mảnh xám ở thanh công cụ). Mẫu đã áp dụng: Settings → Accounts (`src/pages/Settings.tsx`, `BTN`).
- **Không dùng Prettier/ESLint tự động chưa cấu hình** — format theo style đang có trong file lân cận (2 space, dấu `"`, không dùng `;` cuối JSX attribute).
- **UI luôn tiếng Anh** (đã pivot toàn bộ, quyết định để giữ đơn giản, không xây i18n) — comment code vẫn tiếng Việt.
- **Landing Builder không có hệ tín hiệu/Trigger Graph** (đã bỏ hẳn — từng có 1 kiến trúc Signal Emitter/Receiver + màn hình nối dây riêng, gỡ bỏ vì quá phức tạp so với nhu cầu thực tế của 1 app quay số đơn thuần). Button (`src/components/landing/views/ButtonView.tsx`) chạy đúng 1 **action cố định** chọn từ dropdown trong `ButtonPanel.tsx` (Draw/Confirm/Reset session/Show-hide Scoreboard/Open link) — bấm là gọi THẲNG 1 hàm của `DrawSequenceActions` (`useDrawSequence.ts`), không qua tín hiệu/trung gian nào. Không có action "Redraw/Discard" riêng — đã GỘP vào "Draw": bấm Draw lúc đang có candidate chờ Confirm (`sequence.isPending`) tự chạy `sequence.redo()` thay vì pick() mới. Lucky Wheel tự phát hiện có candidate mới bằng cách dò `results[0].id` đổi (xem `WheelTemplate.tsx`/`DigitRollerTemplate.tsx`), không cần ai "ra lệnh" nó quay. Thêm loại component mới xem checklist 4 bước ở đầu `src/lib/landing/types.ts`; chi tiết đầy đủ về Button action xem `docs/landing/button.md`. Tài liệu Landing: `docs/landing/builder.md` (cửa sổ dựng trang), `docs/landing/presentation.md` (Present Mode, luồng quay, Interactions with Draw), `docs/landing/<component>.md` (từng loại component).

- **Mỗi session = 1 file SQLite trong `data/`** (`electron/db.ts`): KHÔNG có 1 kết nối `db` chung — mọi truy vấn lấy kết nối qua `getDb(sessionId)`, nên IPC mới nào đụng DB PHẢI nhận `sessionId` (kể cả IPC sửa/xoá theo id bản ghi). Định danh session = `sessions.id` bên trong file, tên file `<tên>__<8 ký tự id>.db` chỉ để đọc. `data/` = `<userData>/data/` (dev, bản Setup, `.app` trong Applications) hoặc `data/` cạnh exe/`.app` (bản portable) — đây là thư mục GỐC; sau khi đăng nhập, dữ liệu thật sự nằm ở `data/accounts/<accountId>/` (xem `switchAccount()` trong `db.ts`, `docs/architecture/cloud-sync.md`). Có ≥ 2 file cùng id → `SessionConflictDialog.tsx` cho người dùng chọn. Chi tiết: `docs/architecture/database-schema.md` mục "Lưu trữ theo session", `docs/deploy/portable.md`.

- **Tài liệu kiến trúc đầy đủ** (schema DB toàn bộ 4 bảng, IPC 3 lớp có sơ đồ, mô hình session/tab, multi-window, thuật toán Draw Engine, Dashboard) nằm ở `docs/architecture/` (bắt đầu từ `ipc-and-windows.md`) — đọc trước khi làm việc lớn đụng tới nhiều phần của app cùng lúc. Data Editor/Import/Data Type: `docs/participants/`. Landing Builder/Present Mode/từng component: `docs/landing/`. Setup máy dev: `docs/local/` (`setup.md` → `run-dev.md` → `testing.md`). Build/phân phối: `docs/deploy/`. Không thư mục nào có README — mỗi file tự trỏ sang file liên quan.

## Việc cần hỏi lại trước khi làm

- Thay đổi schema DB (`electron/db.ts`) luôn cần kèm migration an toàn cho DB cũ (xem các hàm `migrate...()` cuối file `db.ts` làm mẫu) — không được `DROP`/`ALTER` phá dữ liệu người dùng đã có.
- Không tự ý đổi logic `drawEngine.ts` (thuật toán random) nếu không được yêu cầu rõ — đây là phần nhạy cảm nhất về tính công bằng.
- Version `X.Y.Z`: `X` = đổi kiến trúc, **chỉ tăng khi chủ dự án duyệt**; `Y` = thêm/đổi/xoá tính năng lớn; `Z` = thay đổi nhỏ/sửa lỗi. Chủ dự án quyết định bản nào tăng số nào — xem `docs/deploy/release.md` bước 2.
- **Mỗi khi vừa làm xong 1 thay đổi code (fix/feature) — trước khi build release hoặc kết thúc việc**:
  báo lại version hiện tại ở `package.json` trên CẢ 2 branch `branch_2x` (`git show branch_2x:package.json`
  hoặc nhánh đang checkout) lẫn `main` (`git show main:package.json` hoặc `git show origin/main:package.json`),
  rồi hỏi chủ dự án có muốn bump lên `vX.Y.Z` kế tiếp không (X/Y/Z tăng cái nào theo đúng quy tắc ở
  dòng trên) — KHÔNG tự ý bump khi chưa được xác nhận.
- Lucky Wheel (Wheel Circular + Digit Roller) đã CHỐT cho production (xem `CHANGELOG.md`) — chỉ sửa bug, không đổi hành vi/giao diện nếu không được yêu cầu rõ.

## BUG đã xác định — chưa fix (xoá mục này sau khi làm xong)

**[2026-10-03]** Xoá hết participant rồi import file mới ("Replace" trong `Participants.tsx`) → Wheel
không nhận được trường dữ liệu hiển thị (tên người trúng ra rỗng).

Nguyên nhân xác nhận qua đọc code: luồng Replace (`Participants.tsx:108-118`) gọi `bulkDelete` rồi
`bulkImport`, nhưng `participants:bulkImport` (`electron/main.ts:443-489`) **chỉ ghi lại
`imported_columns`**, KHÔNG đụng tới `sessions.participant_column_types`/`participant_column_labels`.
Mapping "cột nào là Name/Phone/..." của file CŨ vẫn còn nguyên trong DB. Nếu file mới có tên cột khác
file cũ → mapping cũ trỏ vào cột không còn tồn tại → cả 3 hàm resolve (`resolveParticipantField`
`electron/participantFields.ts`, `resolveParticipantDisplayField` `src/lib/landing/types.ts`,
`resolveColumnForType` `src/lib/dataEditor/validate.ts`) không tìm thấy cột nào gắn type "name" →
trả về rỗng. Vì import mới luôn ghi `name: ""` vào cột SQL lõi (`Participants.tsx:95`, generic hoàn
toàn, không đoán cột) nên không có fallback nào cứu được. Nếu file mới trùng tên cột với file cũ thì
mapping cũ tình cờ vẫn khớp → không thấy lỗi → đúng với cảm giác "thỉnh thoảng mới bị".

Hướng fix đã chốt với chủ dự án (chưa code): trong `participants:bulkImport`, sau khi tính được tập
tên cột của lần import này (`columns`, đã có sẵn ở dòng tính `imported_columns`) — dọn
(prune) `participant_column_types` và `participant_column_labels`: xoá key nào KHÔNG còn nằm trong
`columns` VÀ không phải core field (`name`/`phone`/`code`/`email`, luôn giữ vì không phụ thuộc file
import). Cột trùng tên với file cũ tự động giữ nguyên mapping, không cần người dùng gán lại tay; cột
không còn tồn tại thì mapping biến mất sạch (không còn ma trỏ vào cột chết). `electron/
participantFields.ts` cần export thêm 1 set tên core field (hoặc tái dùng `CORE_FIELDS` sẵn có trong
file, đổi thành `export`) để `main.ts` dùng khi prune.

## TODO — plan đang dang dở (xoá mục này sau khi làm xong)

**[NHẮC CHỦ DỰ ÁN ĐẦU MỖI PHIÊN LÀM VIỆC cho tới khi xong — 2026-11-22] Tách ảnh/video thành asset
riêng trên R2 để cloud gần realtime.** Chủ dự án muốn làm TỪ TỪ theo từng giai đoạn bên dưới — mỗi
phiên chỉ làm 1 giai đoạn, xong hỏi lại rồi mới sang giai đoạn kế. Plan đã viết, CHƯA duyệt chi tiết
(đọc lại + xác nhận với chủ dự án trước khi code giai đoạn 1).

Vì sao: mỗi lần Confirm đang đẩy NGUYÊN file session ~13MB (đo `HCM-BE-BO-Final`: video bảng `media`
5,5MB + ảnh base64 trong `landing_config` 4,1MB + `prizes.display_image` 2,2MB + participants 1,1MB,
`draw_results` chỉ vài KB) → mạng upload ~3Mbps mất 30–40s/lần. Tách xong còn ~1MB/lần. Bối cảnh đầy đủ:
`docs/architecture/cloud-sync.md` mục "Mục tiêu" + "Lộ trình tối ưu".

Hướng đã chọn — **tách ở TẦNG ĐỒNG BỘ, không đổi cách lưu local**: file `.db` trên máy GIỮ NGUYÊN
(video vẫn BLOB trong `media`, ảnh vẫn data URL trong JSON) → KHÔNG đổi schema local, KHÔNG migration,
KHÔNG sửa renderer/Landing/Prize/Present/Lucky Wheel (Wheel đã chốt production). Chỉ bản chụp gửi lên
cloud là bản "nhẹ":
- **Push** (`cloudSync.ts`, nên tách module mới `electron/cloudAssets.ts`): `VACUUM INTO` bản chụp
  như hiện tại → mở bản chụp → (1) `media.data` thay bằng blob rỗng, (2) duyệt JSON `landing_config` +
  `prizes.display_image` (+ `image_path` nếu là data URL), mọi chuỗi `data:` dài > ~16KB thay bằng
  `"cloudasset:<sha256>"` → ghi danh sách vào bảng mới CHỈ có trong bản chụp `_cloud_assets(sha256,
  mime, size, ...)` → `VACUUM` lại cho nhỏ. Asset nào cloud chưa có → upload TRƯỚC, đủ hết mới upload
  `.db` (thiếu asset = Landing thiếu ảnh sau khi Pull). Nhớ sha đã upload trong `.sync-state.json`
  (`uploadedAssets`) để khỏi hỏi lại; `media` id không bao giờ đổi nội dung → cache sha theo id.
- **Pull** (`downloadVersion`/`syncAll`): tải `.db` nhẹ → đọc `_cloud_assets` → tải asset còn thiếu
  vào cache `data/accounts/<id>/.assets/<sha>` → ghi ngược lại (rehydrate) vào đúng chỗ → xoá bảng
  `_cloud_assets` → mới `replaceSessionFile` (nguyên tử: không bao giờ có file local thiếu ảnh). File
  cloud cũ không có `_cloud_assets` (bản đầy đủ từ trước) → dùng nguyên như hiện tại (tương thích ngược).
- `baseHash`/sha256 metadata tính trên bản NHẸ (cùng nội dung → cùng bản nhẹ → cùng hash).
- **Worker**: `POST /v1/assets/check {hashes}` → trả hash còn thiếu; upload asset dùng lại luồng
  multipart sẵn có với key `accounts/<id>/assets/<sha256>` (video tới 500MB); `GET /v1/assets/:sha`;
  `listAccounts`/`listAccountSessions` cộng thêm dung lượng prefix `assets/`. Chưa cần dọn asset mồ côi
  (soft delete vẫn giữ mọi bản — làm sau nếu storage thành vấn đề).
- Lưu ý: app bản cũ (1.4.x) Pull bản nhẹ sẽ thiếu ảnh — prod chưa phát hành nên chấp nhận được, nhưng
  phải ghi rõ trong CHANGELOG/release là mọi máy phải lên bản mới cùng lúc.

Giai đoạn (mỗi giai đoạn 1 phiên, xong thì đánh ✅ ở đây):
1. Worker: route asset + thống kê dung lượng + test local (`wrangler dev`) + deploy dev.
2. App: `cloudAssets.ts` (dehydrate/rehydrate + cache + thứ tự asset-trước-db), test bằng session thật
   (copy file `.db` của account dev, KHÔNG sửa bản gốc): đo dung lượng bản nhẹ, Push → Pull máy sạch →
   so sánh nội dung giống hệt bản gốc, Landing/Present hiển thị đủ ảnh/video.
3. Gần realtime: `touched()` trong `main.ts` cho Landing Builder/Data Editor cũng `syncSoon` (gom dài hơn,
   vd 5s) thay vì chờ đóng cửa sổ; cân nhắc đẩy cả `draw:pick`. Cập nhật bảng điểm chốt trong
   `cloud-sync.md`.
   - **3b (phần phụ, tuỳ chọn — chủ dự án muốn có, CHƯA chốt (a)/(b), hỏi lại trước khi làm): bỏ nút
     Save → tự lưu + tự đồng bộ** ở Landing Builder (`LandingBuilderWindow.tsx` `handleSave`) và Data
     Editor (`DataEditorModal.tsx`, hiện đã tự lưu sau 20s `AUTOSAVE_DELAY_MS` + nút Save). Giữ nguyên
     Undo/Redo (lịch sử trong bộ nhớ cửa sổ, không phụ thuộc Save — Undo sau khi đã lưu chỉ là 1 thay đổi
     mới, tự lưu tiếp; đóng cửa sổ thì mất lịch sử như hiện tại). Đổi "Discard all unsaved changes" thành
     "Revert to when opened" (hoặc bỏ); sửa các cảnh báo Data Editor kiểu "can't be undone after Save".
     **Rủi ro chính:** Present tự đọc lại landing từ DB định kỳ (`PresentMode.tsx` `CONFIG_POLL_MS`) —
     hiện nút Save đóng vai "phát hành", tự lưu sẽ đưa thao tác đang sửa dở lên màn LED trước khán giả.
     Hướng xử lý: **(a, đề xuất)** chỉ tự lưu khi session KHÔNG có cửa sổ Present nào đang mở, đang chiếu
     thì Builder quay về nút Save/"Publish" (không đổi DB); **(b)** tách bản nháp (tự lưu + đồng bộ) và bản
     đang chiếu (chỉ đổi khi Publish) — an toàn nhất nhưng đổi schema, cần migration. Phải làm SAU giai
     đoạn 2 (không thì mỗi lần tự lưu đẩy ~13MB).
4. Lịch sử theo thời gian trên Worker (10 bản gần nhất + 1 bản/giờ) thay vì chỉ 10 bản gần nhất.
5. (Tuỳ chọn) Xác thực Worker 3 lần đọc R2/request → 1.
Xong hết: cập nhật `docs/architecture/cloud-sync.md` (Lộ trình, bảng chi phí, R2 layout), `CHANGELOG.md`,
xoá mục này.

**[HOÃN — 2026-10-02]** Đã làm giải pháp tạm component "Frame" (`outputFrame`,
xem `docs/landing/output-frame.md`) vì sát giờ sự kiện, canvas vẫn 1920×1080. Plan bên dưới giữ lại để làm sau.

**Canvas Landing tuỳ chỉnh kích thước** (không chỉ cố định 1920×1080) — lý do: màn LED thật của người
dùng là 3584×2304 (~1.56:1, không phải 16:9), hiện bị letterbox ~12.5% viền đen trên/dưới.

Đã xác nhận qua đọc code (KHÔNG cần đổi DB/IPC — chỉ renderer + 1 UI mới):
- `LandingCanvas.tsx` (artboard thật trong Builder) **đã đọc `config.canvas.width/height` sẵn** —
  sửa/zoom/pan trên canvas tuỳ chỉnh đã chạy đúng ngay bây giờ, không cần sửa gì ở đây.
- Chỉ 3 chỗ còn đọc hằng số cứng `CANVAS_WIDTH`/`CANVAS_HEIGHT` (`src/lib/landing/types.ts:965-966`)
  thay vì giá trị thật của session:
  1. `src/pages/PresentMode.tsx:62` — công thức fit-scale cửa sổ trình chiếu (dễ sửa nhất: đổi sang
     `config.canvas.width/height`, thêm vào dependency array của effect đang để `[]`).
  2. `src/pages/LandingPage.tsx:52` (+ JSX dòng 106) — preview ở cửa sổ chính, tương tự.
  3. `src/components/landing/componentRegistry.ts` — 6 entry (Background + 5 effect full-bleed, dòng
     114-115/272-273/291-292/307-308/324-325/340-341) dùng `CANVAS_WIDTH`/`CANVAS_HEIGHT` làm
     `defaultWidth`/`defaultHeight`, chỉ được đọc trong `createComponentAt()` (dòng 358-372) lúc tạo
     component mới — cần thêm cờ `fullBleed?: true` vào các entry này, đổi `createComponentAt` nhận
     thêm `canvasWidth, canvasHeight`, và 2 nơi gọi nó trong `LandingBuilderWindow.tsx` (dòng 497, 512)
     truyền `prev.canvas.width, prev.canvas.height` (đã có sẵn trong scope).
- Chưa có UI nào sửa được `canvas.width/height` — cần thêm 1 nút trong header
  `LandingBuilderWindow.tsx` (cạnh tên session, trước cụm Undo/Redo — xem popover "History" dòng
  603-636 làm mẫu UI) hiện `W × H` hiện tại, mở popover 2 ô nhập Width/Height + nút Apply, gọi
  `updateConfig((prev) => ({...prev, canvas: {width, height}}), {commit:true, label:"Changed canvas size"})`
  (tái dùng đúng pattern update/undo đã có, không cần code lưu mới).
- KHÔNG tự resize lại component đã đặt sẵn khi đổi canvas size (giống Figma) — chỉ áp dụng cho
  component tạo MỚI sau khi đổi.
- Xong phần code thì cập nhật `docs/landing/builder.md` (dòng 41, đang ghi "Artboard cố định
  1920×1080"), `docs/landing/presentation.md` (dòng 15-16), và `CHANGELOG.md`.

Plan đầy đủ (đã viết nhưng chưa review lại với người dùng) từng nằm ở
`/Users/quang/.claude/plans/merry-questing-map.md` trên máy cũ — mục này là bản tóm tắt mang theo
sang máy khác, dùng `/plan` hoặc đọc lại mục này để tiếp tục đúng chỗ.

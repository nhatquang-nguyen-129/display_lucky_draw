# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này.

## Project

Lucky Draw Studio — app desktop Electron chạy quay số trúng thưởng cho sự kiện, **hoàn toàn offline**, không có backend/cloud. Dữ liệu lưu SQLite cục bộ. Mỗi "phiên quay số" là 1 tab kiểu Chrome, độc lập hoàn toàn về participants/prizes với nhau.

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

Nguyên tắc chọn công nghệ mới cho dự án này: ưu tiên giải pháp **không thêm dependency** nếu CSS/Canvas 2D/API trình duyệt sẵn có đã làm được (xem `docs/landing/builder.md` mục 11 — ví dụ cụ thể cho hiệu ứng đồ hoạ), vì đây là app 1 người maintain, chạy offline hoàn toàn — mỗi dependency mới là thêm rủi ro bảo trì dài hạn, không phải chỉ chi phí cài đặt ban đầu. Không thêm thư viện "phòng khi cần" — chỉ thêm khi có nhu cầu cụ thể đã thử cách hiện có không đủ.

## Lệnh hay dùng

- `npm run electron:dev` — chạy dev (Vite + Electron song song). Sửa file trong `electron/` phải tắt bật lại lệnh này, không hot-reload như phần renderer.
- `npm run package` — build production qua electron-builder, output vào `release/`: `…-win.zip` (bản thư mục/portable, có thư mục mẹ, tự nén bằng `electron/make-portable-zip.mjs`) + `…-Setup.exe` (Installer) trên Windows; `…-mac.zip` (universal, ký ad-hoc) trên Mac — luôn build cho hệ điều hành đang chạy. Xem `docs/deploy/`.
- `npx electron-rebuild` — bắt buộc chạy lại mỗi khi `npm install` xong hoặc đổi version Electron, vì `better-sqlite3` là native module, không rebuild sẽ lỗi `NODE_MODULE_VERSION mismatch`.

## Kiến trúc quan trọng — đọc trước khi sửa

- **Mô hình tab/session**: `src/context/SessionContext.tsx` quản lý tab đang active. MỌI bảng liên quan participant/prize đều có cột `session_id` — bất kỳ IPC handler hay query mới nào thêm vào bảng `participants`/`prizes` đều PHẢI lọc theo `session_id`, không được quên (đã từng vỡ ở `Dashboard.tsx`/`Prizes.tsx` do quên việc này).
- **Session Lock** (`sessions.locked`, chuột phải vào tab trong `TabBar.tsx` để khoá/mở khoá): chặn sửa/xoá participant/prize + mở Data Editor/Presentation/Builder sau khi đã quay xong — KHÔNG phải bảo mật (không password), chỉ tránh thao tác nhầm. Chặn thật nằm ở `assertSessionUnlocked()` đầu mỗi IPC handler liên quan trong `main.ts`, không phải chỉ disable nút. Thêm IPC mới sửa/xoá dữ liệu hay mở cửa sổ edit → nhớ gọi hàm này. Xem `docs/architecture/session-lock.md`.
- **IPC 3 lớp bắt buộc đồng bộ khi thêm field/API mới**: `electron/main.ts` (handler thật) → `electron/preload.ts` (expose qua contextBridge) → `src/types.ts` (khai báo type `window.api`). Thiếu 1 trong 3 sẽ lỗi TS hoặc lỗi runtime "not a function".
- **Renderer KHÔNG được tự đọc file qua `fetch("file://...")`** — bị Chromium chặn do `contextIsolation: true`. Mọi thao tác đọc file phải qua IPC, main process đọc bằng `fs` rồi trả nội dung qua `ipcMain.handle`. Xem `dialog:openAndReadFile` trong `main.ts` làm mẫu.
- **Data Editor** (`src/components/DataEditorModal.tsx` + `src/lib/dataEditor/`): dùng Command Pattern — mọi thao tác sửa dữ liệu (sửa ô, Clean, Generate, xoá dòng...) đều là 1 object `{ execute, undo }` thuần, chạy qua `useCommandHistory`. Thêm tính năng mới cho Data Editor → viết thêm 1 command trong `commands.ts`, không sửa trực tiếp state trong component.
- **Participant KHÔNG có field "cố định" theo nghĩa cũ nữa — chỉ có Data Type**: import (`Participants.tsx`) đưa NGUYÊN mọi cột file vào `extra_data`, generic hoàn toàn, không đoán/match tên cột. Cột SQL `name`/`phone`/`code`/`email` trên bảng `participants` vẫn tồn tại (tương thích ngược cho dữ liệu cũ) nhưng KHÔNG còn được ghi bởi luồng mới, và Data Editor chỉ hiện chúng khi đang có dữ liệu thật (`isCoreFieldActive`). "Cột nào là Name/Phone/Code/Email" xác định ĐỘNG qua `sessions.participant_column_types` (dropdown "Data type" trong Data Editor — đây là cơ chế DUY NHẤT, không có thao tác "Use as"/di chuyển dữ liệu nào cả) — dùng `resolveColumnForType` (`validate.ts`), `resolveParticipantDisplayField` (`src/lib/landing/types.ts`), hoặc `resolveParticipantField` (`electron/participantFields.ts`) tuỳ nơi gọi (3 bản song song vì `electron/` không import được `src/`). Draw Engine (thuật toán CHỌN ai trúng, `drawEngine.ts`) chỉ dùng `participant.id`/`status`, KHÔNG bao giờ cần biết field nào tên gì — nhưng tên hiển thị của người trúng (`participantName`/`participant_name`...) PHẢI resolve qua các hàm trên, không đọc cứng `p.name`. Xem `docs/participants/column-mapping.md` + `docs/architecture/draw-engine.md`.
- **Màu sắc**: theme sáng, 3 màu thương hiệu định nghĩa 1 chỗ duy nhất trong `tailwind.config.js` (`gold` = xanh đậm #2244A5, `teal` = xanh nhạt #20C7F1, `highlight` = vàng #FFCA2D — tên biến giữ nguyên từ bản theme tối cũ, đừng nhầm theo nghĩa đen của tên).
- **Không dùng Prettier/ESLint tự động chưa cấu hình** — format theo style đang có trong file lân cận (2 space, dấu `"`, không dùng `;` cuối JSX attribute).
- **UI luôn tiếng Anh** (đã pivot toàn bộ, quyết định để giữ đơn giản, không xây i18n) — comment code vẫn tiếng Việt.
- **Landing Builder không có hệ tín hiệu/Trigger Graph** (đã bỏ hẳn — từng có 1 kiến trúc Signal Emitter/Receiver + màn hình nối dây riêng, gỡ bỏ vì quá phức tạp so với nhu cầu thực tế của 1 app quay số đơn thuần). Button (`src/components/landing/views/ButtonView.tsx`) chạy đúng 1 **action cố định** chọn từ dropdown trong `ButtonPanel.tsx` (Draw/Confirm/Reset session/Show-hide Scoreboard/Open link) — bấm là gọi THẲNG 1 hàm của `DrawSequenceActions` (`useDrawSequence.ts`), không qua tín hiệu/trung gian nào. Không có action "Redraw/Discard" riêng — đã GỘP vào "Draw": bấm Draw lúc đang có candidate chờ Confirm (`sequence.isPending`) tự chạy `sequence.redo()` thay vì pick() mới. Lucky Wheel tự phát hiện có candidate mới bằng cách dò `results[0].id` đổi (xem `WheelTemplate.tsx`/`DigitRollerTemplate.tsx`), không cần ai "ra lệnh" nó quay. Thêm loại component mới xem checklist 4 bước ở đầu `src/lib/landing/types.ts`; chi tiết đầy đủ về Button action xem `docs/landing/button.md`. Tài liệu Landing: `docs/landing/builder.md` (cửa sổ dựng trang), `docs/landing/presentation.md` (Present Mode, luồng quay, Interactions with Draw), `docs/landing/<component>.md` (từng loại component).

- **Mỗi session = 1 file SQLite trong `data/`** (`electron/db.ts`): KHÔNG có 1 kết nối `db` chung — mọi truy vấn lấy kết nối qua `getDb(sessionId)`, nên IPC mới nào đụng DB PHẢI nhận `sessionId` (kể cả IPC sửa/xoá theo id bản ghi). Định danh session = `sessions.id` bên trong file, tên file `<tên>__<8 ký tự id>.db` chỉ để đọc. `data/` = `<userData>/data/` (dev, bản Setup, `.app` trong Applications) hoặc `data/` cạnh exe/`.app` (bản portable). Có ≥ 2 file cùng id → `SessionConflictDialog.tsx` cho người dùng chọn. Chi tiết: `docs/architecture/database-schema.md` mục "Lưu trữ theo session", `docs/deploy/portable.md`.

- **Tài liệu kiến trúc đầy đủ** (schema DB toàn bộ 4 bảng, IPC 3 lớp có sơ đồ, mô hình session/tab, multi-window, thuật toán Draw Engine, Dashboard) nằm ở `docs/architecture/` (bắt đầu từ `ipc-and-windows.md`) — đọc trước khi làm việc lớn đụng tới nhiều phần của app cùng lúc. Data Editor/Import/Data Type: `docs/participants/`. Landing Builder/Present Mode/từng component: `docs/landing/`. Setup máy dev: `docs/local/` (`setup.md` → `run-dev.md` → `testing.md`). Build/phân phối: `docs/deploy/`. Không thư mục nào có README — mỗi file tự trỏ sang file liên quan.

## Việc cần hỏi lại trước khi làm

- Thay đổi schema DB (`electron/db.ts`) luôn cần kèm migration an toàn cho DB cũ (xem các hàm `migrate...()` cuối file `db.ts` làm mẫu) — không được `DROP`/`ALTER` phá dữ liệu người dùng đã có.
- Không tự ý đổi logic `drawEngine.ts` (thuật toán random) nếu không được yêu cầu rõ — đây là phần nhạy cảm nhất về tính công bằng.
- Version `X.Y.Z`: `X` = đổi kiến trúc, **chỉ tăng khi chủ dự án duyệt**; `Y` = thêm/đổi/xoá tính năng lớn; `Z` = thay đổi nhỏ/sửa lỗi. Chủ dự án quyết định bản nào tăng số nào — xem `docs/deploy/release.md` bước 2.
- Lucky Wheel (Wheel Circular + Digit Roller) đã CHỐT cho production (xem `CHANGELOG.md`) — chỉ sửa bug, không đổi hành vi/giao diện nếu không được yêu cầu rõ.

## TODO — plan đang dang dở (xoá mục này sau khi làm xong)

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

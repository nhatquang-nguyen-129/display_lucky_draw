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

Nguyên tắc chọn công nghệ mới cho dự án này: ưu tiên giải pháp **không thêm dependency** nếu CSS/Canvas 2D/API trình duyệt sẵn có đã làm được (xem `docs/landing/effects.md` — ví dụ cụ thể cho hiệu ứng đồ hoạ), vì đây là app 1 người maintain, chạy offline hoàn toàn — mỗi dependency mới là thêm rủi ro bảo trì dài hạn, không phải chỉ chi phí cài đặt ban đầu. Không thêm thư viện "phòng khi cần" — chỉ thêm khi có nhu cầu cụ thể đã thử cách hiện có không đủ.

## Lệnh hay dùng

- `npm run electron:dev` — chạy dev (Vite + Electron song song). Sửa file trong `electron/` phải tắt bật lại lệnh này, không hot-reload như phần renderer.
- `npm run package` — build production qua electron-builder, output vào `release/`.
- `npx electron-rebuild` — bắt buộc chạy lại mỗi khi `npm install` xong hoặc đổi version Electron, vì `better-sqlite3` là native module, không rebuild sẽ lỗi `NODE_MODULE_VERSION mismatch`.

## Kiến trúc quan trọng — đọc trước khi sửa

- **Mô hình tab/session**: `src/context/SessionContext.tsx` quản lý tab đang active. MỌI bảng liên quan participant/prize đều có cột `session_id` — bất kỳ IPC handler hay query mới nào thêm vào bảng `participants`/`prizes` đều PHẢI lọc theo `session_id`, không được quên (đã từng vỡ ở `Dashboard.tsx`/`Prizes.tsx` do quên việc này).
- **IPC 3 lớp bắt buộc đồng bộ khi thêm field/API mới**: `electron/main.ts` (handler thật) → `electron/preload.ts` (expose qua contextBridge) → `src/types.ts` (khai báo type `window.api`). Thiếu 1 trong 3 sẽ lỗi TS hoặc lỗi runtime "not a function".
- **Renderer KHÔNG được tự đọc file qua `fetch("file://...")`** — bị Chromium chặn do `contextIsolation: true`. Mọi thao tác đọc file phải qua IPC, main process đọc bằng `fs` rồi trả nội dung qua `ipcMain.handle`. Xem `dialog:openAndReadFile` trong `main.ts` làm mẫu.
- **Data Editor** (`src/components/DataEditorModal.tsx` + `src/lib/dataEditor/`): dùng Command Pattern — mọi thao tác sửa dữ liệu (sửa ô, Clean, Generate, xoá dòng...) đều là 1 object `{ execute, undo }` thuần, chạy qua `useCommandHistory`. Thêm tính năng mới cho Data Editor → viết thêm 1 command trong `commands.ts`, không sửa trực tiếp state trong component.
- **Participant KHÔNG có field "cố định" theo nghĩa cũ nữa — chỉ có Data Type**: import (`Participants.tsx`) đưa NGUYÊN mọi cột file vào `extra_data`, generic hoàn toàn, không đoán/match tên cột. Cột SQL `name`/`phone`/`code`/`email` trên bảng `participants` vẫn tồn tại (tương thích ngược cho dữ liệu cũ) nhưng KHÔNG còn được ghi bởi luồng mới, và Data Editor chỉ hiện chúng khi đang có dữ liệu thật (`isCoreFieldActive`). "Cột nào là Name/Phone/Code/Email" xác định ĐỘNG qua `sessions.participant_column_types` (dropdown "Data type" trong Data Editor — đây là cơ chế DUY NHẤT, không có thao tác "Use as"/di chuyển dữ liệu nào cả) — dùng `resolveColumnForType` (`validate.ts`), `resolveParticipantDisplayField` (`src/lib/landing/types.ts`), hoặc `resolveParticipantField` (`electron/participantFields.ts`) tuỳ nơi gọi (3 bản song song vì `electron/` không import được `src/`). Draw Engine (thuật toán CHỌN ai trúng, `drawEngine.ts`) chỉ dùng `participant.id`/`status`, KHÔNG bao giờ cần biết field nào tên gì — nhưng tên hiển thị của người trúng (`participantName`/`participant_name`...) PHẢI resolve qua các hàm trên, không đọc cứng `p.name`. Xem `docs/participants/column-mapping.md` + `docs/architecture/draw-engine.md`.
- **Màu sắc**: theme sáng, 3 màu thương hiệu định nghĩa 1 chỗ duy nhất trong `tailwind.config.js` (`gold` = xanh đậm #2244A5, `teal` = xanh nhạt #20C7F1, `highlight` = vàng #FFCA2D — tên biến giữ nguyên từ bản theme tối cũ, đừng nhầm theo nghĩa đen của tên).
- **Không dùng Prettier/ESLint tự động chưa cấu hình** — format theo style đang có trong file lân cận (2 space, dấu `"`, không dùng `;` cuối JSX attribute).
- **UI luôn tiếng Anh** (đã pivot toàn bộ, quyết định để giữ đơn giản, không xây i18n) — comment code vẫn tiếng Việt.
- **Landing Builder không có hệ tín hiệu/Trigger Graph** (đã bỏ hẳn — từng có 1 kiến trúc Signal Emitter/Receiver + màn hình nối dây riêng, gỡ bỏ vì quá phức tạp so với nhu cầu thực tế của 1 app quay số đơn thuần). Button (`src/components/landing/views/ButtonView.tsx`) chạy đúng 1 **action cố định** chọn từ dropdown trong `ButtonPanel.tsx` (Draw/Confirm/Reset session/Show-hide Scoreboard/Open link) — bấm là gọi THẲNG 1 hàm của `DrawSequenceActions` (`useDrawSequence.ts`), không qua tín hiệu/trung gian nào. Không có action "Redraw/Discard" riêng — đã GỘP vào "Draw": bấm Draw lúc đang có candidate chờ Confirm (`sequence.isPending`) tự chạy `sequence.redo()` thay vì pick() mới. Lucky Wheel tự phát hiện có candidate mới bằng cách dò `results[0].id` đổi (xem `WheelTemplate.tsx`/`DigitRollerTemplate.tsx`), không cần ai "ra lệnh" nó quay. Thêm loại component mới xem checklist 4 bước ở đầu `src/lib/landing/types.ts`; chi tiết đầy đủ về Button action xem `docs/landing/button-actions.md` (mục lục toàn bộ Landing Builder: `docs/landing/README.md`).

- **Tài liệu kiến trúc đầy đủ** (schema DB toàn bộ 4 bảng, IPC 3 lớp có sơ đồ, mô hình session/tab, multi-window, thuật toán Draw Engine, roadmap) nằm ở `docs/architecture/` — đọc trước khi làm việc lớn đụng tới nhiều phần của app cùng lúc. Data Editor/Import: `docs/participants/`. Landing Builder/Lucky Wheel/Effect: `docs/landing/`.

## Việc cần hỏi lại trước khi làm

- Thay đổi schema DB (`electron/db.ts`) luôn cần kèm migration an toàn cho DB cũ (xem các hàm `migrate...()` cuối file `db.ts` làm mẫu) — không được `DROP`/`ALTER` phá dữ liệu người dùng đã có.
- Không tự ý đổi logic `drawEngine.ts` (thuật toán random) nếu không được yêu cầu rõ — đây là phần nhạy cảm nhất về tính công bằng.
- Lucky Wheel (Wheel Circular + Digit Roller) đã CHỐT cho production (xem `CHANGELOG.md`) — chỉ sửa bug, không đổi hành vi/giao diện nếu không được yêu cầu rõ.

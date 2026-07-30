# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này.

## Project

Lucky Draw Studio — app desktop Electron chạy quay số trúng thưởng cho sự kiện, **hoàn toàn offline**, không có backend/cloud. Dữ liệu lưu SQLite cục bộ. Mỗi "phiên quay số" là 1 tab kiểu Chrome, độc lập hoàn toàn về participants/prizes với nhau.

Stack: Electron + Vite + React + TypeScript + better-sqlite3 + Tailwind CSS.

## Lệnh hay dùng

- `npm run electron:dev` — chạy dev (Vite + Electron song song). Sửa file trong `electron/` phải tắt bật lại lệnh này, không hot-reload như phần renderer.
- `npm run package` — build production qua electron-builder, output vào `release/`.
- `npx electron-rebuild` — bắt buộc chạy lại mỗi khi `npm install` xong hoặc đổi version Electron, vì `better-sqlite3` là native module, không rebuild sẽ lỗi `NODE_MODULE_VERSION mismatch`.

## Kiến trúc quan trọng — đọc trước khi sửa

- **Mô hình tab/session**: `src/context/SessionContext.tsx` quản lý tab đang active. MỌI bảng liên quan participant/prize đều có cột `session_id` — bất kỳ IPC handler hay query mới nào thêm vào bảng `participants`/`prizes` đều PHẢI lọc theo `session_id`, không được quên (đã từng vỡ ở `Dashboard.tsx`/`Prizes.tsx` do quên việc này).
- **IPC 3 lớp bắt buộc đồng bộ khi thêm field/API mới**: `electron/main.ts` (handler thật) → `electron/preload.ts` (expose qua contextBridge) → `src/types.ts` (khai báo type `window.api`). Thiếu 1 trong 3 sẽ lỗi TS hoặc lỗi runtime "not a function".
- **Renderer KHÔNG được tự đọc file qua `fetch("file://...")`** — bị Chromium chặn do `contextIsolation: true`. Mọi thao tác đọc file phải qua IPC, main process đọc bằng `fs` rồi trả nội dung qua `ipcMain.handle`. Xem `dialog:openAndReadFile` trong `main.ts` làm mẫu.
- **Data Editor** (`src/components/DataEditorModal.tsx` + `src/lib/dataEditor/`): dùng Command Pattern — mọi thao tác sửa dữ liệu (sửa ô, Clean, Generate, xoá dòng...) đều là 1 object `{ execute, undo }` thuần, chạy qua `useCommandHistory`. Thêm tính năng mới cho Data Editor → viết thêm 1 command trong `commands.ts`, không sửa trực tiếp state trong component.
- **Prize có 2 tầng field**: field cố định (`name`, `phone`, `code`, `email`...) và field optional lưu trong cột `extra_data` (JSON). Draw Engine (`electron/drawEngine.ts`) chỉ đọc field cố định — không bao giờ đọc `extra_data`, giữ đúng ranh giới này khi sửa.
- **Màu sắc**: theme sáng, 3 màu thương hiệu định nghĩa 1 chỗ duy nhất trong `tailwind.config.js` (`gold` = xanh đậm #2244A5, `teal` = xanh nhạt #20C7F1, `highlight` = vàng #FFCA2D — tên biến giữ nguyên từ bản theme tối cũ, đừng nhầm theo nghĩa đen của tên).
- **Không dùng Prettier/ESLint tự động chưa cấu hình** — format theo style đang có trong file lân cận (2 space, dấu `"`, không dùng `;` cuối JSX attribute).
- **Landing component chỉ thuộc 1 trong 2 nhóm — Signal Emitter hoặc Signal Receiver, không bao giờ cả hai**: đây là nguyên tắc kiến trúc cố định cho Landing Builder (`src/components/landing/`), áp dụng cho MỌI component hiện có lẫn tương lai. Emitter (Button hôm nay; sau này QR Scanner/NFC Reader/Keyboard Shortcut...) là component người vận hành thao tác trực tiếp trong Present Mode — CHỈ phát Event (vd `Button.Click`), không tự chạy business logic/animation nào, không biết Draw/Confirm/Fireworks/Lucky Wheel là gì. Receiver (Lucky Wheel, Fireworks, Stage Light hôm nay; Countdown, Winner Banner, Prize Image, Scoreboard, Video, Music... sau này) CHỈ nhận Command từ Trigger Graph để tự thực thi animation/logic của chính nó (vd `Wheel.StartSpin`) — người vận hành KHÔNG thao tác trực tiếp lên Receiver ở Present Mode; Receiver có thể tự phát Event riêng sau khi xong việc (vd `Wheel.SpinCompleted`) để Graph định tuyến tiếp. Trigger Graph (`triggerGraph/`) là tầng trung gian DUY NHẤT nối Emitter → Receiver (Event → Command), không bao giờ biết Receiver thực thi cụ thể ra sao. Tên tín hiệu luôn theo quy ước `Component.Action` (vd `Wheel.StartSpin`, `Fireworks.Play`) — khai báo tập trung ở `COMPONENT_SIGNALS` trong `componentRegistry.ts`. Thêm loại component mới PHẢI xác định rõ Emitter hay Receiver trước khi code (xem checklist ở đầu `src/lib/landing/types.ts`).

## Việc cần hỏi lại trước khi làm

- Thay đổi schema DB (`electron/db.ts`) luôn cần kèm migration an toàn cho DB cũ (xem các hàm `migrate...()` cuối file `db.ts` làm mẫu) — không được `DROP`/`ALTER` phá dữ liệu người dùng đã có.
- Không tự ý đổi logic `drawEngine.ts` (thuật toán random) nếu không được yêu cầu rõ — đây là phần nhạy cảm nhất về tính công bằng.

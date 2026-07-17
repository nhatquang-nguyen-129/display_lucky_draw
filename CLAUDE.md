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

## Việc cần hỏi lại trước khi làm

- Thay đổi schema DB (`electron/db.ts`) luôn cần kèm migration an toàn cho DB cũ (xem các hàm `migrate...()` cuối file `db.ts` làm mẫu) — không được `DROP`/`ALTER` phá dữ liệu người dùng đã có.
- Không tự ý đổi logic `drawEngine.ts` (thuật toán random) nếu không được yêu cầu rõ — đây là phần nhạy cảm nhất về tính công bằng.

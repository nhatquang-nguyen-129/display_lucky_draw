# Testing — dữ liệu dev & kiểm tra thay đổi

## Vị trí dữ liệu

Mỗi session (tab) là 1 file SQLite `<tên-session>__<mã>.db` trong thư mục `data/` — cơ chế đầy đủ ở
[`docs/architecture/database-schema.md`](../architecture/database-schema.md#lưu-trữ-theo-session--mỗi-session-là-1-file).
Nút **Data folder** ở góc phải thanh tab mở thẳng thư mục đang dùng.

| Cách chạy | Windows | macOS | Linux |
|---|---|---|---|
| Dev (`npm run electron:dev`), bản cài đặt | `%APPDATA%/lucky-draw-app/data/` | `~/Library/Application Support/lucky-draw-app/data/` | `~/.config/lucky-draw-app/data/` |
| Bản portable (giải nén từ zip) | `data/` cạnh exe | `data/` cạnh `.app` | — |

Thư mục tên `lucky-draw-app` (theo `name` trong `package.json`), không phải "Lucky Draw Studio" — lý do ở
[`docs/deploy/installer.md`](../deploy/installer.md).

- File dùng `journal_mode = DELETE`: không có file `-wal`, copy file `.db` lúc nào cũng đủ dữ liệu.
- Máy dev có `lucky-draw.db` kiểu cũ (1 file mọi session, ở `%APPDATA%/lucky-draw-app/`): lần chạy đầu
  sau khi cập nhật, app tự tách thành từng file trong `data/` và giữ file gốc làm
  `lucky-draw.db.migrated-<thời điểm>.bak`.
- Test tính năng mang session sang máy khác: copy 1 file từ `data/` sang `data/` của 1 bản portable.

## Reset dữ liệu để test lại từ đầu

- 1 session: xoá tab (✕ trên tab) → file vào `data/.trash/`, lấy lại được bằng cách chuyển file về `data/`.
- Toàn bộ: tắt app → chuyển hết file trong `data/` ra chỗ khác → mở lại: app trống hoàn toàn.

Nhẹ hơn: mỗi session độc lập hoàn toàn về participants/prizes, nên tạo 1 tab session test riêng thay vì
thử trên session thật đang chuẩn bị cho sự kiện.

## Kiểm tra thay đổi trước khi commit

Project không dùng Jest/Vitest/Playwright. Kiểm tra bằng 2 việc:

1. **Type-check** — bắt sớm lỗi kiểu, đặc biệt lỗi IPC 3 lớp thiếu đồng bộ (`CLAUDE.md`):

   ```bash
   npx tsc --noEmit                          # renderer (src/)
   npx tsc -p electron/tsconfig.json --noEmit  # main process (electron/)
   ```

   `npm run build` (renderer + Vite + main) kiểm tra kỹ hơn nhưng chậm hơn — nên chạy trước khi
   `npm run package`, không cần sau mỗi thay đổi nhỏ.

2. **Test thủ công trong app** — `npm run electron:dev` ([run-dev.md](./run-dev.md)), thao tác trực tiếp
   qua tính năng vừa sửa (không chỉ nhìn code). Sửa `electron/` thì nhớ tắt/chạy lại.

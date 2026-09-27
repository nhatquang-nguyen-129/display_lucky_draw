# Testing — dữ liệu dev & kiểm tra thay đổi

## Vị trí file SQLite

Tạo tự động ở lần chạy đầu tiên. Vị trí do `resolveDbDir()` (`electron/db.ts`) quyết định:

| Cách chạy | Windows | macOS | Linux |
|---|---|---|---|
| Dev (`npm run electron:dev`), bản cài đặt | `%APPDATA%\lucky-draw-app\lucky-draw.db` | `~/Library/Application Support/lucky-draw-app/lucky-draw.db` | `~/.config/lucky-draw-app/lucky-draw.db` |
| Bản portable (giải nén từ zip) | `data\lucky-draw.db` cạnh exe | `data/lucky-draw.db` cạnh `.app` | — |

Thư mục tên `lucky-draw-app` (theo `name` trong `package.json`), không phải "Lucky Draw Studio" — lý do ở
[`docs/deploy/installer.md`](../deploy/installer.md). Chi tiết bản portable:
[`docs/deploy/portable.md`](../deploy/portable.md).

Mở nhanh thư mục DB: Windows `explorer $env:APPDATA\lucky-draw-app`; macOS Finder → Go → Go to Folder
`~/Library/Application Support/lucky-draw-app`.

Lúc app chạy có thêm `lucky-draw.db-wal`/`-shm` (SQLite chế độ WAL). **Bản dev không đóng DB khi
thoát**, nên phần dữ liệu mới nhất có thể vẫn nằm trong `-wal` — copy DB dev đi đâu thì copy kèm
`-wal`.

## Reset dữ liệu để test lại từ đầu

Đóng app → xoá `lucky-draw.db` (kèm `-wal`/`-shm` nếu có) → mở lại: app tạo schema mới hoàn toàn trống.
Dùng khi cần test 1 flow từ trạng thái sạch (tạo session → import → quay số) hoặc nghi DB cũ đang dở
dang do 1 lỗi. **Không hoàn tác được** — muốn giữ dữ liệu thì copy file ra chỗ khác trước.

Nhẹ hơn: mỗi session độc lập hoàn toàn về participants/prizes, nên tạo 1 tab session test riêng thay vì
thử trên session thật đang chuẩn bị cho sự kiện.

## Kiểm tra thay đổi trước khi commit

Project **chưa có test tự động** (không có Jest/Vitest/Playwright). Kiểm tra bằng 2 việc:

1. **Type-check** — bắt sớm lỗi kiểu, đặc biệt lỗi IPC 3 lớp thiếu đồng bộ (`CLAUDE.md`):

   ```bash
   npx tsc --noEmit                          # renderer (src/)
   npx tsc -p electron/tsconfig.json --noEmit  # main process (electron/)
   ```

   `npm run build` (renderer + Vite + main) kiểm tra kỹ hơn nhưng chậm hơn — nên chạy trước khi
   `npm run package`, không cần sau mỗi thay đổi nhỏ.

2. **Test thủ công trong app** — `npm run electron:dev` ([run-dev.md](./run-dev.md)), thao tác trực tiếp
   qua tính năng vừa sửa (không chỉ nhìn code). Sửa `electron/` thì nhớ tắt/chạy lại.

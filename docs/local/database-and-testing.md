# Database & kiểm tra thay đổi (test)

## Vị trí file SQLite

Database tạo tự động ở lần chạy đầu tiên — chưa từng chạy app thì chưa có file này:

| Hệ điều hành | Vị trí |
|---|---|
| Windows | `%APPDATA%\lucky-draw-app\lucky-draw.db` |
| macOS | `~/Library/Application Support/lucky-draw-app/lucky-draw.db` |
| Linux | `~/.config/lucky-draw-app/lucky-draw.db` |

Mở thư mục chứa DB trên Windows:

```powershell
explorer $env:APPDATA\lucky-draw-app
```

## Reset toàn bộ dữ liệu (test lại từ đầu)

Đóng app, xoá file `lucky-draw.db` (đúng theo bảng vị trí ở trên), mở lại app — mọi session/
participant/prize/kết quả quay cũ mất sạch, app khởi tạo schema mới hoàn toàn trống. Dùng cách này
khi cần kiểm tra 1 flow từ trạng thái sạch (vd test lại toàn bộ luồng tạo session → import → quay
số), hoặc khi nghi ngờ DB cũ đang ở trạng thái dở dang do 1 lỗi trước đó.

Cẩn thận: xoá file này KHÔNG hoàn tác được, mất toàn bộ dữ liệu thật (participants/prizes/kết quả) đã
nhập trước đó.

## Kiểm tra thay đổi trước khi commit

Project **chưa có test suite tự động** (không có Jest/Vitest/Playwright nào cấu hình trong
`package.json`) — kiểm tra thay đổi hiện tại dựa vào 2 việc:

1. **Type-check** — bắt lỗi kiểu dữ liệu sớm, đặc biệt hữu ích cho lỗi IPC 3 lớp thiếu đồng bộ (xem
   `CLAUDE.md`):

```bash
npx tsc --noEmit
```

   Có thể dùng `npm run build` (chạy `tsc -b` cho renderer + `vite build` + `tsc` cho `electron/`) để
   kiểm tra kỹ hơn trước khi `npm run package` (xem [`../deploy/`](../deploy/README.md)) — không bắt buộc
   sau mỗi thay đổi nhỏ lúc đang dev vì chạy chậm hơn `tsc --noEmit`.

2. **Test thủ công trong chính app** — chạy `npm run electron:dev` (xem [run-dev.md](./run-dev.md)),
   thao tác trực tiếp qua tính năng vừa sửa (không chỉ nhìn code). Vì mỗi session độc lập hoàn toàn
   về participants/prizes, tạo 1 tab test riêng thay vì test trực tiếp trên dữ liệu session thật đang
   dùng — tránh làm hỏng dữ liệu sự kiện thật nếu app đang được chuẩn bị cho 1 sự kiện sắp diễn ra.

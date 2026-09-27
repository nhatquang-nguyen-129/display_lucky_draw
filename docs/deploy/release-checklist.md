# Test bản đóng gói & phân phối

## Test the packaged app before distributing

Trước khi đưa file cho người vận hành sự kiện, LUÔN test trên 1 máy KHÔNG có Node/VS Code/source code
(hoặc ít nhất tạo 1 user Windows mới, hoặc tắt hẳn kết nối tới `node_modules` của repo) để chắc chắn
package tự chạy được độc lập:

- [ ] Giải nén file `…-win.zip` rồi double-click `Lucky Draw Studio.exe` (hoặc chạy Installer rồi mở
      app từ Start Menu) — app mở lên bình thường, không có cửa sổ DevTools nào tự bật (chỉ bật ở
      `NODE_ENV=development`, package production không bật).
- [ ] Bản thư mục: sau lần mở đầu tiên có `data\lucky-draw.db` cạnh exe. (Installer: DB ở
      `%APPDATA%\lucky-draw-app\`, xem [`docs/local/database-and-testing.md`](../local/database-and-testing.md).)
- [ ] Tạo 1 session mới, import participants/prizes, thử quay số — xác nhận SQLite hoạt động.
- [ ] Mở Landing Builder/Present Mode — xác nhận render/hiệu ứng bình thường như lúc dev.
- [ ] Đóng app, mở lại — xác nhận dữ liệu vừa tạo vẫn còn. Sau khi đóng, `data\` chỉ còn
      `lucky-draw.db` (không còn `-wal`/`-shm`).
- [ ] Double-click exe lần 2 khi app đang mở — chỉ cửa sổ cũ được đưa lên trước, không mở thêm app.
- [ ] Bản thư mục: copy nguyên thư mục sang chỗ khác (hoặc USB), mở từ đó — thấy đủ dữ liệu cũ.

## Distributing to event operators

- **Bản thư mục** (khuyến nghị): copy NGUYÊN thư mục app (đã giải nén, đã có `data\lucky-draw.db`
  chuẩn bị sẵn) vào USB, hoặc gửi file zip kèm hướng dẫn "Giải nén (chuột phải → Extract All) rồi
  double-click `Lucky Draw Studio.exe`, không cần cài gì — luôn copy cả thư mục, không tách file ra".
  Mở exe ngay trong zip chưa giải nén → app báo lỗi và thoát (chủ đích, tránh mất dữ liệu). Chi tiết
  quy trình chuẩn bị/vận hành: [portable-app.md](./portable-app.md).
- **Installer**: gửi file `Setup.exe`, người dùng tự chạy qua 2 bước (chọn thư mục → cài) rồi mở từ
  Start Menu/biểu tượng Desktop (đã bật `createDesktopShortcut`).
- **Cảnh báo SmartScreen/Antivirus**: app CHƯA được ký số (code signing) — lần đầu mở trên máy lạ,
  Windows SmartScreen nhiều khả năng hiện cảnh báo "Windows protected your PC". Đây là hành vi BÌNH
  THƯỜNG với app chưa ký số, không phải app bị lỗi — người dùng bấm **"More info" → "Run anyway"** để
  tiếp tục. Một số phần mềm diệt virus cũng có thể báo nhầm (false positive) vì lý do tương tự — cân
  nhắc mua chứng chỉ code signing nếu phát hành rộng rãi lâu dài (ngoài phạm vi tài liệu này).

Gặp lỗi lúc build/mở app đóng gói? Xem [troubleshooting.md](./troubleshooting.md).

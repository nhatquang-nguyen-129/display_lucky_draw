# Test bản đóng gói & phân phối

## Test the packaged app before distributing

Trước khi đưa file cho người vận hành sự kiện, LUÔN test trên 1 máy KHÔNG có Node/VS Code/source code
(hoặc ít nhất tạo 1 user Windows mới, hoặc tắt hẳn kết nối tới `node_modules` của repo) để chắc chắn
package tự chạy được độc lập:

- [ ] Double-click file portable (hoặc chạy Installer rồi mở app từ Start Menu) — app mở lên bình
      thường, không có cửa sổ DevTools nào tự bật (chỉ bật ở `NODE_ENV=development`, package production
      không bật).
- [ ] Tạo 1 session mới, import participants/prizes, thử quay số — xác nhận SQLite hoạt động (xem
      [`docs/local/database-and-testing.md`](../local/database-and-testing.md) để biết vị trí file
      `.db` tạo ra sau lần mở đầu tiên).
- [ ] Mở Landing Builder/Present Mode — xác nhận render/hiệu ứng bình thường như lúc dev.
- [ ] Đóng app, mở lại — xác nhận dữ liệu vừa tạo vẫn còn (SQLite ghi đúng chỗ, không bị mất khi thoát).

## Distributing to event operators

- **Portable**: copy đúng 1 file `.exe` vào USB/ổ chia sẻ, gửi kèm hướng dẫn "double-click để chạy,
  không cần cài gì". Không để lại gì trên máy venue sau khi xong việc — xoá file là dọn sạch.
- **Installer**: gửi file `Setup.exe`, người dùng tự chạy qua 2 bước (chọn thư mục → cài) rồi mở từ
  Start Menu/biểu tượng Desktop (đã bật `createDesktopShortcut`).
- **Cảnh báo SmartScreen/Antivirus**: app CHƯA được ký số (code signing) — lần đầu mở trên máy lạ,
  Windows SmartScreen nhiều khả năng hiện cảnh báo "Windows protected your PC". Đây là hành vi BÌNH
  THƯỜNG với app chưa ký số, không phải app bị lỗi — người dùng bấm **"More info" → "Run anyway"** để
  tiếp tục. Một số phần mềm diệt virus cũng có thể báo nhầm (false positive) vì lý do tương tự — cân
  nhắc mua chứng chỉ code signing nếu phát hành rộng rãi lâu dài (ngoài phạm vi tài liệu này).

Gặp lỗi lúc build/mở app đóng gói? Xem [troubleshooting.md](./troubleshooting.md).

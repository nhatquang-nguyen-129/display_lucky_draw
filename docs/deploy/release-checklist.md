# Release checklist — test trước khi phát cho người vận hành

Trước khi đưa file cho người vận hành sự kiện, LUÔN test trên 1 máy KHÔNG có Node/VS Code/source code
(hoặc ít nhất 1 user hệ điều hành khác), đúng hệ điều hành sẽ dùng ở venue, để chắc bản đóng gói tự
chạy được độc lập.

## Chung (mọi định dạng, mọi hệ điều hành)

- [ ] App mở lên bình thường, không tự bật DevTools (chỉ bật ở `NODE_ENV=development`).
- [ ] Tạo session mới, import participants/prizes, quay thử: SQLite hoạt động.
- [ ] Mở Landing Builder/Present Mode: render/hiệu ứng như lúc dev.
- [ ] Đóng app, mở lại: dữ liệu vừa tạo vẫn còn.
- [ ] Mở app lần 2 khi đang chạy: chỉ đưa cửa sổ cũ lên trước, không mở thêm app.
- [ ] Đóng cửa sổ cuối cùng: app thoát hẳn (cả trên Mac).

## Theo định dạng

- **Portable**: checklist Windows ở [portable.md → Windows](./portable.md#3-windows) (thư mục
  `data\`, copy thư mục sang chỗ khác, chạy từ zip bị chặn), checklist Mac ở
  [portable.md → Checklist test trên Mac](./portable.md#checklist-test-trên-mac).
- **Installer**: [installer.md → Checklist test](./installer.md#5-checklist-test).

## Phân phối

- **Portable** (khuyến nghị): copy sẵn NGUYÊN thư mục đã giải nén (kèm các file session đã chuẩn bị
  trong `data/`) vào USB, hoặc gửi file zip kèm hướng dẫn "giải nén rồi mở app bên trong, luôn copy cả
  thư mục". Chỉ cần gửi thêm 1 session cho máy đã có app: gửi đúng 1 file session, người nhận đặt vào
  `data/` (nút **Data folder**). Chi tiết: [portable.md](./portable.md).
- **Installer**: gửi `Setup.exe` (Windows); trên Mac gửi bản portable kèm hướng dẫn kéo `.app` vào
  Applications. Chi tiết: [installer.md](./installer.md).
- **Cảnh báo lần đầu mở trên máy lạ**: app chưa ký số chính thức, nên Windows hiện SmartScreen (**More
  info → Run anyway**), Mac hiện Gatekeeper (**Open Anyway** trong Privacy & Security). Đây là hành vi
  BÌNH THƯỜNG, không phải app lỗi. Phần mềm diệt virus có thể báo nhầm vì cùng lý do. Muốn hết cảnh
  báo cần chứng chỉ code signing (Windows) / Apple Developer ID + notarization (Mac), ngoài phạm vi
  hiện tại.

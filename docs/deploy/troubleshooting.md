# Troubleshooting — build & đóng gói

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| App vừa mở đã tắt ngay, không báo lỗi gì | `better-sqlite3` chưa rebuild đúng bản Electron dùng để đóng gói | Xoá `node_modules` + `release/`, `npm install` lại, `npm run package` lại từ đầu (không cần tự chạy `electron-rebuild` tay trước, xem [build.md](./build.md)) |
| Lỗi `NODE_MODULE_VERSION mismatch` khi mở app đã đóng gói | Đóng gói trên 1 máy nhưng test bằng `node_modules` của máy khác/máy dev | Luôn `npm run package` và test TRÊN CÙNG 1 máy trong 1 lần chạy |
| electron-builder báo lỗi tải `electron`/`winCodeSign` prebuilt binary | Mạng chặn/timeout lúc tải cache lần đầu | Thử lại (cache tải dở vẫn tiếp tục được), hoặc kiểm tra proxy/firewall công ty |
| Icon app hiện icon mặc định của Electron, không phải icon đã chỉnh | PNG convert sang `.ico` thất bại lúc build | Chuẩn bị sẵn file `.ico` riêng, trỏ `build.win.icon` sang file đó (xem [README.md](./README.md) mục Prerequisites) |
| SmartScreen chặn hẳn, không thấy nút "Run anyway" | Cấu hình Windows/policy công ty chặn app chưa ký số | Cần code signing certificate — ngoài phạm vi tài liệu này |

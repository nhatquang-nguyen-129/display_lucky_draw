# Troubleshooting — build & đóng gói

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| App vừa mở đã tắt ngay, không báo lỗi gì | `better-sqlite3` chưa rebuild đúng bản Electron dùng để đóng gói | Xoá `node_modules` + `release/`, `npm install` lại, `npm run package` lại từ đầu (không cần tự chạy `electron-rebuild` tay trước, xem [build.md](./build.md)) |
| App đóng gói lỗi `require is not defined` / `exports is not defined in ES module scope` | Thiếu `dist-electron/package.json` (`{"type":"commonjs"}`) — build bằng lệnh khác `npm run build`/`build:electron` | Luôn build qua `npm run package` (đã gọi `build:electron` → `write-pkg.mjs`), xem [build.md](./build.md) |
| Lỗi `NODE_MODULE_VERSION mismatch` khi mở app đã đóng gói | Đóng gói trên 1 máy nhưng test bằng `node_modules` của máy khác/máy dev | Luôn `npm run package` và test TRÊN CÙNG 1 máy trong 1 lần chạy |
| electron-builder báo lỗi tải `electron`/`winCodeSign` prebuilt binary | Mạng chặn/timeout lúc tải cache lần đầu | Thử lại (cache tải dở vẫn tiếp tục được), hoặc kiểm tra proxy/firewall công ty |
| electron-builder lỗi giải nén `winCodeSign`: `Cannot create symbolic link : A required privilege is not held by the client` | User Windows không có quyền tạo symlink (file nén có 2 symlink `.dylib` của macOS) | Bật **Developer Mode** (Settings → System → For developers) rồi build lại; hoặc giải nén tay 1 lần: `node_modules\7zip-bin\win\x64\7za.exe x <file>.7z -o%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0` (báo lỗi 2 symlink là bình thường, phần Windows vẫn đủ), xoá các thư mục/file số tạm (`123456789`, `123456789.7z`) trong cùng thư mục cache |
| Icon app hiện icon mặc định của Electron, không phải icon đã chỉnh | PNG convert sang `.ico` thất bại lúc build | Chuẩn bị sẵn file `.ico` riêng, trỏ `build.win.icon` sang file đó (xem [README.md](./README.md) mục Prerequisites) |
| SmartScreen chặn hẳn, không thấy nút "Run anyway" | Cấu hình Windows/policy công ty chặn app chưa ký số | Cần code signing certificate — ngoài phạm vi tài liệu này |
| Bản thư mục báo "The app is running from a temporary folder" | Mở exe ngay trong file `.zip` chưa giải nén (Windows bung tạm ra `%TEMP%`) | Chuột phải file zip → Extract All, chạy exe trong thư mục đã giải nén |
| Bản thư mục báo "Cannot write to the data folder" | Thư mục app nằm trên ổ chỉ-đọc/USB khoá write-protect/thư mục không có quyền ghi | Chuyển nguyên thư mục app sang chỗ ghi được (Desktop, Documents, USB không khoá) |
| Bản thư mục mở ra TRỐNG dù đã chuẩn bị dữ liệu | `lucky-draw.db` không nằm đúng `data\` cạnh exe (quên copy, copy sai chỗ) — app lặng lẽ tạo DB rỗng mới | Tắt app, đặt đúng file vào `data\lucky-draw.db` (xem [portable-app.md](./portable-app.md#quy-trình-chuẩn-bị)) |

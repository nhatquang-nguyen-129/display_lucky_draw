# Troubleshooting — lỗi khi build & đóng gói

Lỗi lúc **chạy** app đã đóng gói (chạy từ zip, không ghi được `data/`, Gatekeeper, App Translocation,
app mở ra trống…): xem mục "Lỗi thường gặp" trong [portable.md](./portable.md) (theo từng hệ điều
hành) và [installer.md](./installer.md).

## Chung

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| App đóng gói vừa mở đã tắt ngay, không báo lỗi gì | `better-sqlite3` chưa rebuild đúng bản Electron dùng để đóng gói | Xoá `node_modules` + `release/`, cài lại (`npm install`/`npm ci`), `npm run package` lại từ đầu (không cần chạy tay `electron-rebuild`) |
| App đóng gói lỗi `require is not defined` / `exports is not defined in ES module scope` | Thiếu `dist-electron/package.json` (`{"type":"commonjs"}`), do build bằng lệnh khác `npm run build`/`build:electron` | Luôn build qua `npm run package`, xem [build.md](./build.md#build) |
| Lỗi `NODE_MODULE_VERSION mismatch` khi mở app đã đóng gói | Đóng gói trên 1 máy nhưng test bằng `node_modules` của máy khác/máy dev | Luôn `npm run package` và test trên cùng 1 máy trong 1 lần chạy |
| electron-builder báo lỗi tải `electron`/`winCodeSign` prebuilt binary | Mạng chặn/timeout lúc tải cache lần đầu | Thử lại (cache tải dở vẫn tiếp tục được), hoặc kiểm tra proxy/firewall |
| `make-portable-zip: … đang tồn tại` | Còn sót thư mục `release/Lucky Draw Studio` (lần nén trước bị ngắt giữa chừng) | Xoá thư mục đó (hoặc cả `release/`) rồi build lại |

## Windows

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Lỗi giải nén `winCodeSign`: `Cannot create symbolic link : A required privilege is not held by the client` | User Windows không có quyền tạo symlink (file nén có 2 symlink `.dylib` của macOS) | Bật **Developer Mode** (Settings → System → For developers) rồi build lại; hoặc giải nén tay 1 lần: `node_modules\7zip-bin\win\x64\7za.exe x <file>.7z -o%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0` (báo lỗi 2 symlink là bình thường, phần Windows vẫn đủ), rồi xoá các thư mục/file số tạm (`123456789`, `123456789.7z`) trong cùng thư mục cache |
| Icon app là icon mặc định của Electron | PNG convert sang `.ico` thất bại | Chuẩn bị file `.ico` riêng, trỏ `build.win.icon` sang file đó (xem [build.md](./build.md#yêu-cầu-trước-khi-build)) |
| `make-portable-zip` lỗi gọi `tar.exe` | Windows cũ hơn Windows 10 (1803) chưa có `tar.exe` | Build trên Windows 10/11 |

## macOS

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `npm ci` lỗi build `better-sqlite3` | Thiếu Xcode Command Line Tools, hoặc sai major Node | `xcode-select --install`, dùng Node 20 |
| `npm run package` lỗi ở bước gộp universal (`@electron/universal`, `lipo`) | Native module không gộp được 2 kiến trúc | Đổi `build.mac.target[0].arch` thành `["arm64"]` (chỉ chạy trên Mac chip M) rồi build lại, ghi lỗi vào [portable.md](./portable.md#6-việc-còn-lại) |
| `codesign` báo lỗi trong `make-portable-zip` | Thiếu Xcode Command Line Tools | `xcode-select --install` |
| electron-builder đòi certificate/ký bằng identity lạ | Keychain có sẵn chứng chỉ Developer, hoặc `build.mac.identity` bị đổi khỏi `null` | Giữ `identity: null` (script tự ký ad-hoc) |
| Build xong, `codesign --verify` báo "valid on disk", NHƯNG mở app tự thoát trong 1-2s, không cửa sổ, không dialog, không crash report | **Đã xác nhận thật trên Mac test (2026-09-28)** — AMFI chặn chữ ký ad-hoc (`log show`: `AppleMobileFileIntegrityError Code=-423 "adhoc signed or signed by an unknown certificate chain"`), `spctl --assess` báo "rejected". `codesign --verify` chỉ kiểm tra TOÀN VẸN chữ ký (đúng những gì đã ký), KHÔNG kiểm tra chữ ký đó có được macOS/AMFI CHẤP NHẬN để chạy hay không — 2 việc khác nhau | CHƯA có cách xử lý tạm — xem [portable.md → Ký số](./portable.md#ký-số-code-signing) và [Việc còn lại](./portable.md#6-việc-còn-lại) (cần Developer ID + notarization) |

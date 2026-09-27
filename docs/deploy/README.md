# Deploy — Đóng gói Lucky Draw Studio ra file phân phối

Tài liệu này nối tiếp [`docs/local/`](../local/README.md) (setup môi trường + chạy được `npm run
electron:dev`) — hướng dẫn đóng gói app thành 1 file thật sự đưa cho người vận hành sự kiện dùng,
KHÔNG cần cài Node/Git/source code gì cả.

| File | Nội dung |
|---|---|
| [build.md](./build.md) | Cấu hình `electron-builder` đã có sẵn, chạy `npm run package`, vị trí file output trong `release/` |
| [portable-app.md](./portable-app.md) | Bản thư mục mang theo cả app lẫn toàn bộ dữ liệu (participant/prize/landing) — DB nằm ở `data\` cạnh app. Windows đã implement, macOS còn là kế hoạch |
| [release-checklist.md](./release-checklist.md) | Checklist test bản đóng gói trước khi phát cho người vận hành + cách phân phối (bản thư mục/Installer, cảnh báo SmartScreen) |
| [troubleshooting.md](./troubleshooting.md) | Bảng triệu chứng → nguyên nhân → cách xử lý khi build/đóng gói lỗi |
| [other-platforms.md](./other-platforms.md) | macOS/Linux — ngoài phạm vi chính, ghi chú ngắn nếu cần sau này |

## Bản thư mục hay Installer?

**Khuyến nghị: bản thư mục (file `…-win.zip`) là định dạng chính**, không phải Installer — vì:

| | Bản thư mục (zip) | Installer (NSIS Setup) |
|---|---|---|
| Cần quyền Admin? | Không | Thường có (tuỳ cấu hình) |
| Cách dùng | Giải nén 1 lần, copy nguyên thư mục vào USB, double-click `Lucky Draw Studio.exe` | Phải chạy trình cài đặt, chọn thư mục, chờ cài xong |
| Dữ liệu nằm ở | `data\lucky-draw.db` NGAY TRONG thư mục app — copy thư mục là mang theo dữ liệu | `%APPDATA%\lucky-draw-app\` của máy đã cài |
| Dọn dẹp sau sự kiện | Xoá thư mục là xong | Phải gỡ cài đặt (uninstall) |
| Phù hợp với | Máy laptop mượn/thuê tại venue, không rõ quyền admin | Máy cố định, dùng lại nhiều lần, muốn có icon Start Menu |

Vì app này chạy 1-lần-1-sự-kiện trên máy tại chỗ (thường không phải máy của mình, không chắc có
quyền admin) và cần mang theo dữ liệu đã chuẩn bị sẵn, **bản thư mục là lựa chọn an toàn và đơn giản
hơn**. Mỗi lần `npm run package` build ra CẢ HAI (xem [build.md](./build.md)).

Không còn build file `.exe` portable 1-file — lý do ở
[portable-app.md](./portable-app.md#vì-sao-là-thư-mục-không-phải-1-file-exe-portable).

## Prerequisites

- Đã hoàn thành toàn bộ [`docs/local/install-dependencies.md`](../local/install-dependencies.md)
  (Node.js 20 LTS, `npm install`, Native Build Tools, `npx electron-rebuild`) và xác nhận `npm run
  electron:dev` chạy được bình thường (xem [`docs/local/run-dev.md`](../local/run-dev.md)).
- **Build TRÊN ĐÚNG hệ điều hành đích** — muốn ra file `.exe` cho Windows thì phải chạy lệnh build
  TRÊN MÁY WINDOWS (không build từ macOS/Linux rồi mang sang). Lý do: `better-sqlite3` là native
  module, biên dịch ra binary khớp đúng hệ điều hành + kiến trúc CPU của máy đang build. Cross-build
  từ macOS sang Windows về lý thuyết electron-builder có hỗ trợ một phần, nhưng rủi ro build "tưởng
  xong" mà app không mở được ở máy khác (lỗi chỉ lộ ra lúc mở app thật, không lộ lúc build) — không
  đáng đánh đổi cho 1 app quay số dùng trực tiếp tại sự kiện.
- Icon hiện tại (`assets/icon/app-icon.png`) là PNG. electron-builder có thể tự convert sang `.ico`
  lúc build Windows, nhưng không phải lúc nào cũng ra icon đẹp — nếu muốn chắc chắn, chuẩn bị thêm 1
  file `assets/icon/app-icon.ico` (đa kích cỡ 16/32/48/256px) và trỏ `build.win.icon` sang file đó
  trong `package.json`. Không bắt buộc để build chạy được.

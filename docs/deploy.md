# Deploy — Đóng gói Lucky Draw Studio ra file phân phối (Portable EXE / Installer)

## 1. Purpose

Tài liệu này nối tiếp `docs/local.md` (setup môi trường + chạy được `npm run electron:dev`) — hướng
dẫn đóng gói app thành 1 file thật sự đưa cho người vận hành sự kiện dùng, KHÔNG cần cài Node/Git/
source code gì cả.

**Khuyến nghị: Portable EXE là định dạng chính**, không phải Installer — vì:

| | Portable EXE | Installer (NSIS Setup) |
|---|---|---|
| Cần quyền Admin? | Không | Thường có (tuỳ cấu hình) |
| Cách dùng | Copy 1 file `.exe` vào USB, double-click chạy thẳng | Phải chạy trình cài đặt, chọn thư mục, chờ cài xong |
| Dọn dẹp sau sự kiện | Xoá file là xong | Phải gỡ cài đặt (uninstall) |
| Phù hợp với | Máy laptop mượn/thuê tại venue, không rõ quyền admin | Máy cố định, dùng lại nhiều lần, muốn có icon Start Menu |

Vì app này chạy 1-lần-1-sự-kiện trên máy tại chỗ (thường không phải máy của mình, không chắc có
quyền admin), **Portable EXE là lựa chọn an toàn và đơn giản hơn**. Repo đã cấu hình sẵn để build ra
CẢ HAI (xem mục 4) — vẫn có Installer nếu bạn cần dùng máy cố định lâu dài.

## 2. Prerequisites

- Đã hoàn thành toàn bộ `docs/local.md` §2 (Node.js 20 LTS, `npm install`, Native Build Tools,
  `npx electron-rebuild`) và xác nhận `npm run electron:dev` chạy được bình thường.
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

## 3. Build configuration đã có sẵn

`package.json`'s `build` field (đọc bởi `electron-builder`) đã khai báo Windows build ra 2 target
cùng lúc mỗi lần chạy `npm run package`:

```json
"win": {
  "target": [
    { "target": "portable", "arch": ["x64"] },
    { "target": "nsis", "arch": ["x64"] }
  ]
},
"portable": {
  "artifactName": "${productName}-${version}-portable.exe"
},
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "artifactName": "${productName}-${version}-Setup.exe"
}
```

- `oneClick: false` + `allowToChangeInstallationDirectory: true` — Installer hiện đúng 2 màn hình hỏi
  (chọn thư mục cài + xác nhận), không cài âm thầm 1-click, người dùng biết rõ đang cài gì vào đâu.
- Không cần sửa gì thêm — mục này chỉ để biết cấu hình đang có, xem tiếp mục 4 để build.

## 4. Build the package

```bash
npm run package
```

Lệnh này chạy tuần tự:

1. `npm run build` — biên dịch renderer (`tsc -b && vite build`, ra `dist/`) và main process
   (`tsc -p electron/tsconfig.json`, ra `dist-electron/`).
2. `electron-builder` — đóng gói `dist/` + `dist-electron/` + `node_modules` (dependencies production,
   gồm cả `better-sqlite3` đã tự rebuild lại đúng bản Electron dùng để đóng gói — electron-builder tự
   làm bước này, không cần chạy tay `electron-rebuild` lại lần nữa trước khi package) thành file thực
   thi, ghi ra thư mục `release/`.

Lần build đầu có thể mất vài phút (electron-builder tải `electron` prebuilt binary cho Windows nếu
chưa có sẵn trong cache `~/.cache/electron` hoặc `%LOCALAPPDATA%\electron\Cache`). Các lần sau nhanh
hơn nhiều nhờ cache.

## 5. Locate output files

Sau khi chạy xong, `release/` chứa (tên file khớp `productName`/`version` trong `package.json`):

| File | Ý nghĩa |
|---|---|
| `Lucky Draw Studio-0.1.0-portable.exe` | File portable — copy đi đâu chạy đó, không cần cài |
| `Lucky Draw Studio-0.1.0-Setup.exe` | Trình cài đặt (Installer) |
| `win-unpacked/` | Thư mục app đã giải nén thô (dùng để test nhanh, KHÔNG phải file để đưa cho người dùng cuối) |

`release/` không commit vào Git (build output, tự sinh lại được) — đã có sẵn trong `.gitignore`.

## 6. Test the packaged app before distributing

Trước khi đưa file cho người vận hành sự kiện, LUÔN test trên 1 máy KHÔNG có Node/VS Code/source code
(hoặc ít nhất tạo 1 user Windows mới, hoặc tắt hẳn kết nối tới `node_modules` của repo) để chắc chắn
package tự chạy được độc lập:

- [ ] Double-click file portable (hoặc chạy Installer rồi mở app từ Start Menu) — app mở lên bình
      thường, không có cửa sổ DevTools nào tự bật (chỉ bật ở `NODE_ENV=development`, package production
      không bật).
- [ ] Tạo 1 session mới, import participants/prizes, thử quay số — xác nhận SQLite hoạt động (xem
      `docs/local.md` §3.4 để biết vị trí file `.db` tạo ra sau lần mở đầu tiên).
- [ ] Mở Landing Builder/Present Mode — xác nhận render/hiệu ứng bình thường như lúc dev.
- [ ] Đóng app, mở lại — xác nhận dữ liệu vừa tạo vẫn còn (SQLite ghi đúng chỗ, không bị mất khi thoát).

## 7. Distributing to event operators

- **Portable**: copy đúng 1 file `.exe` vào USB/ổ chia sẻ, gửi kèm hướng dẫn "double-click để chạy,
  không cần cài gì". Không để lại gì trên máy venue sau khi xong việc — xoá file là dọn sạch.
- **Installer**: gửi file `Setup.exe`, người dùng tự chạy qua 2 bước (chọn thư mục → cài) rồi mở từ
  Start Menu/biểu tượng Desktop (đã bật `createDesktopShortcut`).
- **Cảnh báo SmartScreen/Antivirus**: app CHƯA được ký số (code signing) — lần đầu mở trên máy lạ,
  Windows SmartScreen nhiều khả năng hiện cảnh báo "Windows protected your PC". Đây là hành vi BÌNH
  THƯỜNG với app chưa ký số, không phải app bị lỗi — người dùng bấm **"More info" → "Run anyway"** để
  tiếp tục. Một số phần mềm diệt virus cũng có thể báo nhầm (false positive) vì lý do tương tự — cân
  nhắc mua chứng chỉ code signing nếu phát hành rộng rãi lâu dài (ngoài phạm vi tài liệu này).

## 8. Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| App vừa mở đã tắt ngay, không báo lỗi gì | `better-sqlite3` chưa rebuild đúng bản Electron dùng để đóng gói | Xoá `node_modules` + `release/`, `npm install` lại, `npm run package` lại từ đầu (không cần tự chạy `electron-rebuild` tay trước, xem mục 4) |
| Lỗi `NODE_MODULE_VERSION mismatch` khi mở app đã đóng gói | Đóng gói trên 1 máy nhưng test bằng `node_modules` của máy khác/máy dev | Luôn `npm run package` và test TRÊN CÙNG 1 máy trong 1 lần chạy |
| electron-builder báo lỗi tải `electron`/`winCodeSign` prebuilt binary | Mạng chặn/timeout lúc tải cache lần đầu | Thử lại (cache tải dở vẫn tiếp tục được), hoặc kiểm tra proxy/firewall công ty |
| Icon app hiện icon mặc định của Electron, không phải icon đã chỉnh | PNG convert sang `.ico` thất bại lúc build | Chuẩn bị sẵn file `.ico` riêng, trỏ `build.win.icon` sang file đó (xem mục 2) |
| SmartScreen chặn hẳn, không thấy nút "Run anyway" | Cấu hình Windows/policy công ty chặn app chưa ký số | Cần code signing certificate — ngoài phạm vi tài liệu này |

## 9. macOS / Linux (ngoài phạm vi chính của tài liệu)

Người dùng cuối của app này chủ yếu chạy Windows tại sự kiện, nên tài liệu tập trung vào file `.exe`.
Nếu cần bản macOS/Linux, `electron-builder` cũng đóng gói được `dmg`/`AppImage` từ cùng 1 codebase —
thêm khối `"mac"`/`"linux"` tương ứng vào `build` trong `package.json` rồi build TRÊN ĐÚNG hệ điều
hành đó (cùng lý do ở mục 2 — native module `better-sqlite3`).

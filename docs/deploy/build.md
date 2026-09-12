# Build configuration & chạy đóng gói

## Build configuration đã có sẵn

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
- Không cần sửa gì thêm — mục này chỉ để biết cấu hình đang có, xem tiếp bên dưới để build.

## Build the package

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

## Locate output files

Sau khi chạy xong, `release/` chứa (tên file khớp `productName`/`version` trong `package.json`):

| File | Ý nghĩa |
|---|---|
| `Lucky Draw Studio-0.1.0-portable.exe` | File portable — copy đi đâu chạy đó, không cần cài |
| `Lucky Draw Studio-0.1.0-Setup.exe` | Trình cài đặt (Installer) |
| `win-unpacked/` | Thư mục app đã giải nén thô (dùng để test nhanh, KHÔNG phải file để đưa cho người dùng cuối) |

`release/` không commit vào Git (build output, tự sinh lại được) — đã có sẵn trong `.gitignore`.

Bước tiếp theo: [release-checklist.md](./release-checklist.md) — test bản đóng gói trước khi phát
cho người vận hành sự kiện.

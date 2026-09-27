# Build configuration & chạy đóng gói

## Build configuration đã có sẵn

Mỗi lần `npm run package` ra 2 bản phân phối cho Windows: **bản thư mục** (file zip, tự nén bằng
`electron/make-portable-zip.mjs`, xem bước 3 bên dưới) và **Installer** (target `nsis` của
electron-builder). `package.json`'s `build` field (đọc bởi `electron-builder`):

```json
"win": {
  "target": [
    { "target": "nsis", "arch": ["x64"] }
  ]
},
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "artifactName": "${productName}-${version}-Setup.exe"
}
```

- KHÔNG dùng target `zip` của electron-builder — zip đó bung thẳng ~18 file lẻ ra chỗ giải nén (không
  có thư mục mẹ), dễ vương vãi ra Desktop.
- `oneClick: false` + `allowToChangeInstallationDirectory: true` — Installer hiện đúng 2 màn hình hỏi
  (chọn thư mục cài + xác nhận), không cài âm thầm 1-click, người dùng biết rõ đang cài gì vào đâu.
- Không cần sửa gì thêm — mục này chỉ để biết cấu hình đang có, xem tiếp bên dưới để build.

## Build the package

```bash
npm run package
```

Lệnh này chạy tuần tự:

1. `npm run build` — biên dịch renderer (`tsc -b && vite build`, ra `dist/`) và main process
   (`npm run build:electron`, ra `dist-electron/`). `build:electron` còn chạy `electron/write-pkg.mjs`
   ghi `dist-electron/package.json` = `{"type":"commonjs"}` — BẮT BUỘC, vì `package.json` gốc có
   `"type": "module"`; thiếu file này thì `main.js` (output CommonJS của tsc) bị hiểu nhầm là ESM và app
   đóng gói crash ngay khi mở.
2. `electron-builder` — đóng gói `dist/` + `dist-electron/` + `node_modules` (dependencies production,
   gồm cả `better-sqlite3` đã tự rebuild lại đúng bản Electron dùng để đóng gói — electron-builder tự
   làm bước này, không cần chạy tay `electron-rebuild` lại lần nữa trước khi package) thành file thực
   thi, ghi ra thư mục `release/` (thư mục app `win-unpacked/` + Installer).
3. `node electron/make-portable-zip.mjs` — nén `release/win-unpacked/` thành
   `${productName}-${version}-win.zip` với thư mục mẹ `Lucky Draw Studio\` bên trong, bỏ qua
   `win-unpacked\data\` (dữ liệu chạy thử). Dùng `tar.exe` có sẵn của Windows 10/11 (không thêm
   dependency); tạm đổi tên `win-unpacked` → `Lucky Draw Studio` trong lúc nén rồi đổi lại.

Lần build đầu có thể mất vài phút (electron-builder tải `electron` prebuilt binary cho Windows nếu
chưa có sẵn trong cache `~/.cache/electron` hoặc `%LOCALAPPDATA%\electron\Cache`). Các lần sau nhanh
hơn nhiều nhờ cache.

## Locate output files

Sau khi chạy xong, `release/` chứa (tên file khớp `productName`/`version` trong `package.json`):

| File | Ý nghĩa |
|---|---|
| `Lucky Draw Studio-1.0.0-win.zip` | **Bản thư mục** (~120 MB) — giải nén ra được thư mục `Lucky Draw Studio\`, chạy `Lucky Draw Studio.exe` bên trong, không cần cài, dữ liệu nằm ở `data\` cạnh exe — xem [portable-app.md](./portable-app.md) |
| `Lucky Draw Studio-1.0.0-Setup.exe` | Trình cài đặt (Installer), dữ liệu ở `%APPDATA%\lucky-draw-app\` |
| `win-unpacked/` | Thư mục app chưa nén (cùng nội dung với file zip) — test nhanh được, nhưng bị ghi đè ở lần build sau, đừng để dữ liệu thật ở đây |
| `builder-debug.yml`, `latest.yml`, `*.blockmap`, `.icon-ico/` | File phụ của electron-builder (debug, auto-update, icon convert) — không dùng, bỏ qua |

`release/` không commit vào Git (build output, tự sinh lại được) — đã có sẵn trong `.gitignore`.

Bước tiếp theo: [release-checklist.md](./release-checklist.md) — test bản đóng gói trước khi phát
cho người vận hành sự kiện.

# Build — đóng gói Lucky Draw Studio ra file phân phối

Nối tiếp [`docs/local/`](../local/setup.md) (setup môi trường, chạy được `npm run electron:dev`).
Kết quả là file đưa cho người vận hành sự kiện dùng, KHÔNG cần cài Node/Git/source code.

## Chọn định dạng phân phối

| | [Portable](./portable.md) (định dạng chính) | [Installer](./installer.md) |
|---|---|---|
| Windows | `…-win.zip`: giải nén ra thư mục `Lucky Draw Studio\` | `…-Setup.exe` |
| macOS | `…-mac.zip`: giải nén ra thư mục `Lucky Draw Studio/` | Kéo `.app` từ bản portable vào Applications |
| Dữ liệu | `data/` trong thư mục app, đi theo app | Thư mục hồ sơ người dùng, gắn với máy |
| Phù hợp | Máy mượn tại venue, cầm USB đi | Máy cố định dùng lâu dài |

App thường chạy 1-lần-1-sự-kiện trên máy tại chỗ (không phải máy của mình, không chắc có quyền
Admin) và cần mang theo dữ liệu chuẩn bị sẵn, nên **portable là lựa chọn mặc định**.

## Yêu cầu trước khi build

- **Build TRÊN ĐÚNG hệ điều hành đích**: ra bản Windows thì build trên Windows, bản Mac thì build trên
  Mac. `npm run package` luôn build cho hệ điều hành đang chạy. Lý do: `better-sqlite3` là native
  module, biên dịch ra binary khớp đúng hệ điều hành + kiến trúc CPU của máy build. Cross-build về lý
  thuyết electron-builder hỗ trợ một phần, nhưng rủi ro build "tưởng xong" mà app không mở được ở máy
  khác (lỗi chỉ lộ ra lúc mở app thật), không đáng đánh đổi cho app dùng trực tiếp tại sự kiện. Script
  nén cũng dùng công cụ có sẵn của từng hệ điều hành (`tar.exe` / `codesign` + `ditto`).
- **Windows**: đã làm xong [`docs/local/setup.md`](../local/setup.md)
  (Node.js 20 LTS, `npm install`, Native Build Tools) và `npm run electron:dev` chạy được
  ([`docs/local/run-dev.md`](../local/run-dev.md)).
- **macOS**: Xcode Command Line Tools (`xcode-select --install`), Node.js 20 LTS, `npm ci`. Các bước
  đầy đủ: [portable.md → Build trên Mac](./portable.md#build-trên-mac).
- **Icon**: `assets/icon/app-icon.png` (1254×1254). electron-builder tự convert sang `.ico` (Windows)
  và `.icns` (macOS). Nếu icon Windows ra xấu, chuẩn bị thêm `assets/icon/app-icon.ico` (đa kích cỡ
  16/32/48/256px) và trỏ `build.win.icon` sang file đó. Không bắt buộc.

## Cấu hình (`package.json` → `build`)

```json
"mac": {
  "target": [{ "target": "dir", "arch": ["universal"] }],
  "category": "public.app-category.productivity",
  "identity": null,
  "hardenedRuntime": false,
  "gatekeeperAssess": false
},
"win": {
  "target": [{ "target": "nsis", "arch": ["x64"] }]
},
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "artifactName": "${productName}-${version}-Setup.exe"
}
```

- **Bản portable không dùng target có sẵn của electron-builder.** electron-builder chỉ xuất thư mục
  app (`win-unpacked/`; `dir` trên Mac), rồi `electron/make-portable-zip.mjs` tự nén thành zip có thư
  mục mẹ. Lý do: [portable.md → Các phương án đã loại](./portable.md#các-phương-án-đã-loại).
- `mac`: universal (Mac chip M + Intel), không ký bằng Developer ID, script tự ký ad-hoc. Lý do:
  [portable.md → Ký số](./portable.md#ký-số-code-signing).
- `nsis`: giải thích từng tuỳ chọn ở [installer.md](./installer.md#cấu-hình-nsis-packagejson--buildnsis).

## Build

```bash
npm run package
```

Chạy tuần tự:

1. `npm run build`: biên dịch renderer (`tsc -b && vite build`, ra `dist/`) và main process
   (`npm run build:electron`, ra `dist-electron/`). `build:electron` còn chạy `electron/write-pkg.mjs`
   ghi `dist-electron/package.json` = `{"type":"commonjs"}`. BẮT BUỘC: `package.json` gốc có
   `"type": "module"`, thiếu file này thì `main.js` (output CommonJS của tsc) bị hiểu nhầm là ESM và
   app đóng gói crash ngay khi mở.
2. `electron-builder`: đóng gói `dist/` + `dist-electron/` + dependencies production (gồm
   `better-sqlite3` được tự rebuild đúng bản Electron, không cần chạy tay `electron-rebuild`) vào
   `release/`.
3. `node electron/make-portable-zip.mjs`: tạo zip portable. Chi tiết:
   [portable.md → Đóng gói](./portable.md#đóng-gói--electronmake-portable-zipmjs).

Lần build đầu mất vài phút (tải Electron prebuilt vào cache; bản Mac universal tải cho cả 2 kiến
trúc). Các lần sau nhanh hơn nhiều.

## Output trong `release/`

Tên file khớp `productName`/`version` trong `package.json`. `release/` không commit vào Git (có sẵn
trong `.gitignore`).

**Windows**

| File | Ý nghĩa |
|---|---|
| `Lucky Draw Studio-<version>-win.zip` | **Bản portable** (~120 MB) |
| `Lucky Draw Studio-<version>-Setup.exe` | **Installer** (~85 MB) |
| `win-unpacked/` | Thư mục app chưa nén, cùng nội dung với zip. Test nhanh được, bị ghi đè ở lần build sau |
| `builder-debug.yml`, `latest.yml`, `*.blockmap`, `.icon-ico/` | File phụ của electron-builder (debug, auto-update, icon convert), bỏ qua |

**macOS**

| File | Ý nghĩa |
|---|---|
| `Lucky Draw Studio-<version>-mac.zip` | **Bản portable** (universal) |
| `mac-universal/Lucky Draw Studio.app` | App chưa nén. Test nhanh được, bị ghi đè ở lần build sau |
| `builder-debug.yml` | Log cấu hình electron-builder, bỏ qua |

Bước tiếp theo: [release-checklist.md](./release-checklist.md). Build lỗi:
[troubleshooting.md](./troubleshooting.md).

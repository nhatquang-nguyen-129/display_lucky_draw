# Release — build, test, phát hành, xử lý lỗi

Hướng dẫn triển khai từ source code ra file đưa cho người vận hành sự kiện (họ KHÔNG cần cài
Node/Git/source code). Nối tiếp [`docs/local/`](../local/setup.md) (setup máy dev). Đặc tính kỹ thuật
từng định dạng: [portable.md](./portable.md) (định dạng chính), [installer.md](./installer.md).

## 1. Chọn định dạng phân phối

| | [Portable](./portable.md) (mặc định) | [Installer](./installer.md) |
|---|---|---|
| Windows | `…-win.zip`: giải nén ra thư mục `Lucky Draw Studio\` | `…-Setup.exe` |
| macOS | `…-mac.zip`: giải nén ra thư mục `Lucky Draw Studio/` | Kéo `.app` từ bản portable vào Applications |
| Dữ liệu | `data/` trong thư mục app, đi theo app | Thư mục hồ sơ người dùng, gắn với máy |
| Phù hợp | Máy mượn tại venue, cầm USB đi | Máy cố định dùng lâu dài |

`npm run package` luôn ra đủ mọi file của hệ điều hành đang chạy. Trên Windows, `release\` luôn có đủ
**3 lựa chọn** (quy ước cố định, đừng bỏ):

| Trong `release\` | Dùng khi |
|---|---|
| `Lucky Draw Studio-<version>-Setup.exe` | Cài lên máy cố định ([installer.md](./installer.md)) |
| `Lucky Draw Studio-<version>-win.zip` | Gửi qua mạng/chat cho người khác |
| `Lucky Draw Studio-<version>-win\` | Bản portable **đã giải nén sẵn** (giống hệt nội dung zip, có sẵn `data\` rỗng) — copy thẳng ra USB/máy venue hoặc chạy thử luôn, không cần unzip |

## 2. Chuẩn bị máy build

**Build TRÊN ĐÚNG hệ điều hành đích**: bản Windows build trên Windows, bản Mac build trên Mac. Lý do:
`better-sqlite3` là native module, biên dịch ra binary khớp đúng hệ điều hành + kiến trúc CPU của máy
build; cross-build dễ ra bản "tưởng xong" mà máy khác không mở được. Script nén cũng dùng công cụ có
sẵn của từng hệ điều hành (`tar.exe` / `codesign` + `ditto`).

| | Windows | macOS |
|---|---|---|
| Hệ điều hành | Windows 10 (1803+) / 11 — cần `tar.exe` có sẵn | Bản nào chạy được Xcode Command Line Tools |
| Công cụ | Làm xong [`docs/local/setup.md`](../local/setup.md) (Node.js 20 LTS, Native Build Tools), `npm run electron:dev` chạy được | `xcode-select --install` (codesign, lipo), Node.js 20 LTS (`nvm install 20 && nvm use 20`) |
| Lần đầu | Có thể gặp lỗi `winCodeSign` symlink, xem [mục 9](#lỗi-khi-build--windows) | Clone repo (mục 4) |

**Icon**: `assets/icon/app-icon.png` (1254×1254), electron-builder tự convert sang `.ico`/`.icns`. Icon
Windows ra xấu thì chuẩn bị thêm `assets/icon/app-icon.ico` (16/32/48/256px) và trỏ `build.win.icon`
sang file đó. Không bắt buộc.

## 3. Build trên Windows

Lệnh PowerShell, chạy ở thư mục gốc repo.

**Bước 0 — terminal.** Nên dùng PowerShell / Windows Terminal ngoài VS Code. Nếu dùng terminal trong VS
Code, chạy trước (VS Code đặt biến này, khiến Electron chạy như Node thuần và crash):

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
cd C:\Users\ADMIN\Documents\display_lucky_draw
```

**Bước 1 — lấy code.**

```powershell
git status                 # phải "working tree clean" — build từ code chưa commit thì khó truy lại sau
git pull
npm ci                     # CHỈ cần khi package.json / package-lock.json vừa đổi
```

Không cần chạy `npx electron-rebuild` cho bản build — electron-builder tự rebuild `better-sqlite3`
(chỉ cần khi muốn chạy dev sau `npm ci`).

**Bước 2 — (tuỳ chọn) tăng version.** Tên file output lấy theo `version` trong `package.json`.

Quy ước đặt version `X.Y.Z` (vd `1.2.3`) của dự án:

| Số | Ý nghĩa | Khi nào tăng |
|---|---|---|
| `X` (major) | Thay đổi cả kiến trúc phần mềm | **Chỉ khi chủ dự án duyệt**, không tự tăng |
| `Y` (minor) | Thay đổi tính năng: thêm tính năng mới, đổi hoặc xoá tính năng lớn | Bản có tính năng mới/đổi lớn |
| `Z` (patch) | Thay đổi nhỏ: sửa lỗi, chỉnh giao diện/hành vi nhỏ | Bản sửa nhỏ, chỉ đổi số cuối |

Chủ dự án là người quyết định mỗi bản thuộc loại nào. Tăng `Y` thì `Z` về 0, tăng `X` thì cả `Y`/`Z` về 0.

```powershell
npm version patch --no-git-tag-version   # 1.0.0 -> 1.0.1 (thay đổi nhỏ)
npm version minor --no-git-tag-version   # 1.0.0 -> 1.1.0 (thay đổi tính năng)
```

Đồng thời đổi mục `## [Unreleased]` trong `CHANGELOG.md` thành `## [<version>] — <ngày>`.

Sửa cả `package.json` lẫn `package-lock.json`, không tự commit/tag (làm ở bước 5).

**Bước 3 — tắt mọi thứ đang giữ file trong `release\`**: app đang chạy từ `release\win-unpacked\` /
`release\Lucky Draw Studio-<version>-win\` / `release\_test\`, cửa sổ Explorer đang mở thư mục đó. Không tắt thì bước 4 lỗi `EPERM`/`EBUSY`.

> **⚠ Dữ liệu thật trong `release\`.** Thư mục giải nén sẵn `release\Lucky Draw Studio-<version>-win\`
> dùng chạy sự kiện được ngay, nên rất dễ có session THẬT trong `data\` của nó. Bước 4 xoá cả
> `release\` — kiểm tra và chuyển dữ liệu ra ngoài TRƯỚC:
>
> ```powershell
> Get-ChildItem release -Recurse -Force | Where-Object { $_.FullName -match '\\data\\' }
> ```
>
> Có file nào → copy nguyên thư mục `data\` đó ra ngoài `release\` (vd `Documents\lucky-draw-backup-<ngày>\`),
> build xong thì chép lại vào `data\` của thư mục giải nén sẵn mới. Nếu app vẫn đang mở từ thư mục đó,
> `Remove-Item` chỉ xoá được các file không bị khoá — file `.db` còn lại nhưng `.trash\`/`.backup\` và
> file chương trình mất hết (đã xảy ra 2026-10-05).

**Bước 4 — xoá bản cũ và build.**

```powershell
Remove-Item -Recurse -Force release -ErrorAction SilentlyContinue
npm run package
```

Mất 1–3 phút (lần đầu lâu hơn: tải Electron vào cache). Thành công khi 3 dòng cuối là:

```
make-portable-zip: …\release\Lucky Draw Studio-<version>-win.zip
make-portable-zip: …\release\Lucky Draw Studio-<version>-win
make-portable-zip: …\release\README.txt
```

Các dòng sau là **bình thường**: `Some chunks are larger than 500 kB`, `description is missed`,
`author is missed`, `no signing info identified, signing is skipped`.

Kiểm tra output:

```powershell
Get-ChildItem release | Select-Object Name, @{n="MB";e={[math]::Round($_.Length/1MB,1)}}
```

Chạy thử bản portable giống hệt người nhận — thư mục giải nén sẵn được giải nén TỪ chính file zip nên
nội dung giống hệt, chạy thẳng được — rồi làm [checklist mục 7](#7-test-trước-khi-phát):

```powershell
$v = (Get-Content package.json -Raw | ConvertFrom-Json).version
& "release\Lucky Draw Studio-$v-win\Lucky Draw Studio.exe"
```

Dữ liệu thử nằm ở `release\Lucky Draw Studio-<version>-win\data\`, mất ở lần build sau. Tắt app khi thử
xong. **Nếu định copy thư mục này ra USB đem đi**, xoá các file BÊN TRONG `data\` thử nghiệm trước (giữ
lại thư mục `data\` rỗng), hoặc build lại, để dữ liệu test không lọt sang máy venue.

**Bước 5 — (tuỳ chọn, khi đã tăng version) commit + tag**, để sau này biết bản người dùng đang cầm build
từ code nào:

```powershell
$v = (Get-Content package.json -Raw | ConvertFrom-Json).version
git add package.json package-lock.json
git commit -m "Release v$v"
git tag "v$v"
git push
git push origin "v$v"
```

**Tóm tắt 1 khối** (build thường, không đổi version):

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
cd C:\Users\ADMIN\Documents\display_lucky_draw
git status
Remove-Item -Recurse -Force release -ErrorAction SilentlyContinue
npm run package
Get-ChildItem release -File
```

## 4. Build trên macOS

Lần đầu trên máy Mac:

```bash
xcode-select --install
git clone https://github.com/nhatquang-nguyen-129/display_lucky_draw.git
cd display_lucky_draw
git checkout branch_2x
```

Mỗi lần build:

```bash
git pull
npm ci                     # cài đúng version trong package-lock.json
rm -rf release
npm run package
ls -lh release
```

`npm run package` trên Mac build x64 + arm64 rồi gộp thành universal (lần đầu tải Electron cho cả 2
kiến trúc nên lâu vài phút), sau đó script ký ad-hoc rồi nén.

**Bắt buộc sau khi build — ký lại bằng chứng chỉ Apple Development.** Chữ ký ad-hoc bị AMFI chặn hẳn:
app tự thoát trong 1-2s, không cửa sổ. Tạo chứng chỉ miễn phí (1 lần/máy) và chạy script ký thủ công từ
trong ra ngoài theo [portable.md → Ký số](./portable.md#cách-chạy-được-miễn-phí--ký-bằng-chứng-chỉ-apple-development-từng-máy),
nhắm vào `release/mac-universal/Lucky Draw Studio.app`. Bản ký lại chỉ chạy trên máy có chứng chỉ đó;
máy Mac khác xem [Mở trên Mac khác chưa có chứng chỉ](./portable.md#mở-trên-mac-khác-chưa-có-chứng-chỉ).

**Rồi BẮT BUỘC nén lại `.zip`** — file `.zip` ở bước build phía trên đã nén xong TRƯỚC lúc ký lại tay
(lúc đó app vẫn còn ad-hoc), nên ký lại `.app` trên đĩa không tự cập nhật `.zip` đã có. Thiếu bước
này thì đem `.zip` cũ đi phát vẫn dính nguyên lỗi AMFI dù `mac-universal/Lucky Draw Studio.app` đã ký
đúng. Lệnh `ditto` + cách xác minh lại: [portable.md → Ký số](./portable.md#ký-số-code-signing) (ngay
sau đoạn ký thủ công).

Chạy thử (mở bằng `open`/Finder, không chạy thẳng binary từ terminal VS Code — xem
[mục 9](#lỗi-khi-chạy-app-đã-phát--macos)):

```bash
open "release/mac-universal/Lucky Draw Studio.app"
```

Test trên Mac khác mà bị Gatekeeper chặn (sau khi đã ký lại):
`xattr -dr com.apple.quarantine "<thư mục Lucky Draw Studio>"`
(giải thích: [portable.md → Gatekeeper](./portable.md#gatekeeper-app-translocation-macos)).

Chạy dev trên Mac (không cần để build): thêm `npx electron-rebuild` sau `npm ci`, rồi
`npm run electron:dev`.

## 5. Bên trong `npm run package`

1. `npm run build`: biên dịch renderer (`tsc -b && vite build` → `dist/`) và main process
   (`build:electron` → `dist-electron/`). `build:electron` còn chạy `electron/write-pkg.mjs` ghi
   `dist-electron/package.json` = `{"type":"commonjs"}`. BẮT BUỘC: `package.json` gốc có
   `"type": "module"`, thiếu file này thì `main.js` (output CommonJS) bị hiểu là ESM và app crash khi mở.
2. `electron-builder`: đóng gói `dist/` + `dist-electron/` + dependencies production (tự rebuild
   `better-sqlite3` đúng bản Electron) vào `release/`. Cấu hình ở `package.json` → `build`; giải thích
   `mac`/portable ở [portable.md](./portable.md#2-thực-thi-kỹ-thuật), `nsis` ở
   [installer.md](./installer.md#cấu-hình-nsis-packagejson--buildnsis).
3. `node electron/make-portable-zip.mjs`: nén bản portable có thư mục mẹ (macOS: ký ad-hoc trước) +
   copy `README.txt`. Chi tiết: [portable.md](./portable.md#đóng-gói--electronmake-portable-zipmjs).

## 6. Output trong `release/`

Tên file theo `productName`/`version` trong `package.json`. `release/` không commit vào Git.

| File | Windows | macOS | Ý nghĩa |
|---|---|---|---|
| `Lucky Draw Studio-<version>-win.zip` / `-mac.zip` | ✓ (~120 MB, x64) | ✓ (universal) | **Bản portable** — đem đi phát |
| `Lucky Draw Studio-<version>-Setup.exe` | ✓ (~85 MB) | — | **Installer** — đem đi phát |
| `README.txt` | ✓ | ✓ | Hướng dẫn nhanh cho người nhận — đem đi phát. Nguồn: `assets/distribution/README.txt` (`{{version}}` tự điền); sửa ở nguồn, không sửa trong `release/` |
| `win-unpacked/` / `mac-universal/Lucky Draw Studio.app` | ✓ | ✓ | App chưa nén, test nhanh được, bị ghi đè ở lần build sau |
| `builder-debug.yml`, `builder-effective-config.yaml`, `latest.yml`, `*.blockmap`, `.icon-ico/` | ✓ | một phần | File phụ của electron-builder, bỏ qua |

## 7. Test trước khi phát

LUÔN test trên 1 máy KHÔNG có Node/VS Code/source code (hoặc ít nhất 1 user hệ điều hành khác), đúng hệ
điều hành sẽ dùng ở venue.

**Chung**

- [ ] App mở lên bình thường, không tự bật DevTools.
- [ ] Tạo session, import participants/prizes, quay thử: SQLite hoạt động.
- [ ] Mở Landing Builder/Present Mode: render/hiệu ứng như lúc dev.
- [ ] Đóng app, mở lại: dữ liệu vẫn còn.
- [ ] Mở app lần 2 khi đang chạy: chỉ đưa cửa sổ cũ lên trước.
- [ ] Đóng cửa sổ cuối cùng: app thoát hẳn (cả trên Mac — không còn chấm dưới icon Dock).

**Portable — Windows**

- [ ] Giải nén `…-win.zip` ra đúng 1 thư mục `Lucky Draw Studio\`; tạo session → có `data\<tên>__<mã>.db` cạnh exe.
- [ ] Copy nguyên thư mục sang chỗ khác → mở thấy đủ dữ liệu.
- [ ] Mở exe ngay trong zip (chưa giải nén) → báo lỗi "temporary folder" rồi thoát.

**Portable — macOS** (kết quả lần test đầu: 2026-09-28, MacBook Pro M-series, macOS 26.6.2, arm64)

- [x] Giải nén `…-mac.zip` ra đúng 1 thư mục `Lucky Draw Studio/`. **Đạt.**
- [x] `npm run package` xong không lỗi, `codesign --verify --deep --strict` báo "valid on disk". **Đạt** —
      nhưng chữ ký ad-hoc KHÔNG đủ để AMFI cho chạy.
- [x] Mở app sau khi ký lại bằng chứng chỉ Apple Development → khởi động và **chạy ổn định** (`ps`: đủ 4
      tiến trình main/renderer/GPU/network sau ≥ 8 giây, không lỗi AMFI trong unified log). Với chữ ký
      ad-hoc mặc định: **KHÔNG ĐẠT** — tự thoát trong 1-2s (AMFI Code -423).
- [ ] Tạo session → có `data/<tên>__<mã>.db` cạnh `.app`; import, dựng landing, quay thử, Present
      Mode/Builder — **chưa test qua UI**.
- [ ] Thoát app → `data/` chỉ có file `.db` (không có `-wal`/`-journal`) — chưa test.
- [ ] Double-click app lần 2 khi đang mở → chỉ đưa cửa sổ cũ lên trước — chưa test.
- [ ] Copy nguyên thư mục sang USB exFAT → mở thấy đủ dữ liệu — chưa test.
- [ ] Copy 1 file session từ bản Windows vào `data/` → mở thấy đúng session đó — chưa test.
- [ ] Copy thêm 1 bản khác của cùng session (vd `… - Copy.db`) → hiện hộp thoại chọn bản — chưa test.

Đã loại trừ khi điều tra lỗi AMFI (không phải nguyên nhân): vị trí thư mục (`/tmp` bị chặn đúng thiết kế
"chạy từ thư mục tạm"; `~/Desktop` và thư mục thường trong `~/` vẫn lỗi), quyền ghi, single-instance lock
(không có `SingletonLock`), asar/entry point (`dist-electron/main.js` trong `app.asar` đúng bản build).

**Installer**

- [ ] **Windows**: cài "Only for me" không cần Admin; mở từ Start Menu và shortcut Desktop; dữ liệu ghi
      vào `%APPDATA%\lucky-draw-app\data\`; KHÔNG có `data\` trong thư mục cài.
- [ ] **Windows**: cài đè bản mới → dữ liệu còn; gỡ cài đặt → app mất khỏi Start Menu, dữ liệu vẫn còn.
- [ ] **macOS**: kéo `.app` vào `/Applications` rồi mở → dùng
      `~/Library/Application Support/lucky-draw-app/data/`, KHÔNG tạo `data/` trong Applications.

## 8. Phát cho người dùng

- **Portable** (khuyến nghị): copy sẵn NGUYÊN thư mục đã giải nén (kèm file session đã chuẩn bị trong
  `data/`) vào USB, hoặc gửi zip + `README.txt` kèm lời dặn "giải nén rồi mở app bên trong, luôn copy
  cả thư mục". Máy đã có app chỉ cần thêm 1 session: gửi đúng 1 file session, người nhận bấm nút
  **Open** ở thanh tab rồi chọn file đó (tự copy vào `data/`) — không cần tự tay đặt vào đúng thư mục.
- **Installer**: Windows gửi `…-Setup.exe` + `README.txt`; Mac gửi bản portable kèm hướng dẫn kéo `.app`
  vào Applications.
- **Cảnh báo lần đầu mở trên máy lạ** (app chưa ký số chính thức) là BÌNH THƯỜNG: Windows SmartScreen
  → **More info → Run anyway**; Mac Gatekeeper → **Open Anyway** trong Privacy & Security. Phần mềm
  diệt virus có thể báo nhầm vì cùng lý do.

## 9. Xử lý lỗi

### Lỗi khi build — chung

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| App đóng gói vừa mở đã tắt ngay, không báo lỗi | `better-sqlite3` chưa rebuild đúng bản Electron | Xoá `node_modules` + `release/`, `npm ci`, `npm run package` lại |
| App đóng gói lỗi `require is not defined` / `exports is not defined in ES module scope` | Thiếu `dist-electron/package.json`, do build bằng lệnh khác | Luôn build qua `npm run package` ([mục 5](#5-bên-trong-npm-run-package)) |
| `NODE_MODULE_VERSION mismatch` khi mở app đã đóng gói | Đóng gói 1 máy, test bằng `node_modules` máy khác | Luôn `npm run package` và test trên cùng 1 máy |
| Lỗi tải `electron`/`winCodeSign` prebuilt binary | Mạng chặn/timeout lúc tải cache lần đầu | Thử lại (tải dở vẫn tiếp tục được), kiểm tra proxy/firewall |
| `EPERM`/`EBUSY` / "being used by another process" khi xoá `release/` hoặc lúc nén | App đang chạy từ `release/`, hoặc Explorer/Finder đang mở thư mục đó | Tắt app, đóng cửa sổ, chạy lại |
| `make-portable-zip: … đang tồn tại` | Sót `release/Lucky Draw Studio` do lần nén trước bị ngắt | Xoá thư mục đó (hoặc cả `release/`) rồi build lại |

### Lỗi khi build — Windows

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Giải nén `winCodeSign`: `Cannot create symbolic link : A required privilege is not held by the client` | User Windows không có quyền tạo symlink (file nén có 2 symlink `.dylib` của macOS) | Bật **Developer Mode** (Settings → System → For developers) rồi build lại; hoặc giải nén tay 1 lần: `node_modules\7zip-bin\win\x64\7za.exe x <file>.7z -o%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0` (báo lỗi 2 symlink là bình thường), rồi xoá các thư mục/file số tạm (`123456789`, `123456789.7z`) trong cùng thư mục cache |
| Exe vừa build (hoặc `electron:dev`) mở từ terminal VS Code crash ngay / `Cannot read properties of undefined (reading 'getPath')` | VS Code đặt `ELECTRON_RUN_AS_NODE=1` | `Remove-Item Env:ELECTRON_RUN_AS_NODE`, hoặc dùng terminal ngoài VS Code / double-click exe |
| Icon app là icon mặc định của Electron | PNG convert sang `.ico` thất bại | Dùng file `.ico` riêng ([mục 2](#2-chuẩn-bị-máy-build)) |
| `make-portable-zip` lỗi gọi `tar.exe` | Windows cũ hơn Windows 10 (1803) | Build trên Windows 10/11 |

### Lỗi khi build — macOS

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `npm ci` lỗi build `better-sqlite3` | Thiếu Xcode Command Line Tools, hoặc sai major Node | `xcode-select --install`, dùng Node 20 |
| Lỗi ở bước gộp universal (`@electron/universal`, `lipo`) | Native module không gộp được 2 kiến trúc | Đổi `build.mac.target[0].arch` thành `["arm64"]` (chỉ chạy Mac chip M), build lại, ghi lỗi vào [portable.md → Việc còn lại](./portable.md#6-việc-còn-lại) |
| `codesign` báo lỗi trong `make-portable-zip` | Thiếu Xcode Command Line Tools | `xcode-select --install` |
| electron-builder đòi certificate/ký bằng identity lạ | Keychain có chứng chỉ Developer, hoặc `build.mac.identity` bị đổi khỏi `null` | Giữ `identity: null` (script tự ký ad-hoc, ký lại bằng Apple Development làm tay sau build) |
| Tạo xong chứng chỉ "Apple Development" trong Xcode nhưng `security find-identity -v -p codesigning` báo "0 valid identities found" | Thiếu/hết hạn chứng chỉ trung gian WWDR đúng thế hệ (cần G3, máy chỉ có G2 hết hạn 07/02/2023) — `security verify-cert` báo `CSSMERR_TP_NOT_TRUSTED` | Tải WWDR G3 (hoặc thế hệ lỗi báo) từ `https://www.apple.com/certificateauthority/`, double-click để cài — xem [portable.md → Ký số](./portable.md#cách-chạy-được-miễn-phí--ký-bằng-chứng-chỉ-apple-development-từng-máy) |
| `codesign --force --deep --sign "<identity thật>"` báo `errSecInternalComponent` tại `Squirrel.framework` | `--deep` xử lý sai thứ tự với symlink `Versions/Current -> A` của Squirrel.framework, dừng giữa chừng | Ký thủ công từng file từ trong ra ngoài, không `--deep` ở bước cuối — script mẫu ở portable.md → Ký số |
| Ký bằng identity thật mà macOS hỏi mật khẩu Keychain liên tục ("codesign wants to access key…") | Mỗi lệnh `codesign` xin quyền dùng private key 1 lần | Bấm **Always Allow** ở lần hỏi đầu |

### Lỗi khi chạy app đã phát — Windows

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| "The app is running from a temporary folder" | Mở exe ngay trong zip chưa giải nén | Chuột phải zip → **Extract All**, chạy exe trong thư mục đã giải nén |
| "Cannot write to the data folder" | Ổ chỉ-đọc, USB khoá write-protect, thư mục không có quyền ghi | Chuyển nguyên thư mục sang chỗ ghi được (Desktop, Documents, USB không khoá) |
| App mở ra thiếu tab / TRỐNG dù đã chuẩn bị dữ liệu | File session không nằm đúng thư mục `data` app đang đọc | Bấm **Open** (góc phải thanh tab, mặc định mở ngay thư mục `data` app đang đọc) để xem có đúng file không, hoặc chọn thẳng file session từ đó |
| Hộp thoại "Different copies of the same session" | ≥ 2 file của cùng 1 session (copy qua lại, mỗi bên sửa riêng) | Chọn bản muốn giữ (gợi ý bản mới nhất), bản còn lại vào `data\.trash\` |
| SmartScreen chặn hẳn, không có "Run anyway" | Policy công ty chặn app chưa ký số | Cần chứng chỉ code signing, ngoài phạm vi hiện tại |

### Lỗi khi chạy app đã phát — macOS

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| **App KHÔNG MỞ ĐƯỢC** — tự thoát trong 1-2s, không cửa sổ, không dialog, không crash report ở `~/Library/Logs/DiagnosticReports/` | AMFI chặn chữ ký ad-hoc: `log show --predicate 'eventMessage CONTAINS "AppleMobileFileIntegrity"'` thấy `Code=-423 "adhoc signed or signed by an unknown certificate chain"`; `spctl --assess --type execute` → "rejected". "Open Anyway" KHÔNG giúp được | Ký lại bằng chứng chỉ Apple Development trên chính máy đó — [portable.md → Ký số](./portable.md#cách-chạy-được-miễn-phí--ký-bằng-chứng-chỉ-apple-development-từng-máy); máy khác chưa có chứng chỉ: [Cách A/B](./portable.md#mở-trên-mac-khác-chưa-có-chứng-chỉ) |
| Tự test bằng Terminal (nhất là Terminal trong VS Code): chạy thẳng binary `.app` thì thoát ngay, không cửa sổ — giống hệt lỗi AMFI | Biến `ELECTRON_RUN_AS_NODE=1` (VS Code đặt cho tiến trình con) → Electron chạy như Node trần. Không liên quan chữ ký | `echo $ELECTRON_RUN_AS_NODE`; nếu ra `1` thì chạy `env -u ELECTRON_RUN_AS_NODE "<…>.app/Contents/MacOS/Lucky Draw Studio"`, hoặc mở bằng `open`/Finder |
| `spctl --assess --type execute` vẫn "rejected" dù đã ký bằng Apple Development và app chạy bình thường | Bình thường — `spctl` là đánh giá "đủ điều kiện phân phối công khai" của Gatekeeper (cần Developer ID + notarization), khác AMFI | Không cần xử lý, cứ mở bằng `open`/double-click |
| "Apple could not verify…" | Gatekeeper, app chưa ký Developer ID | macOS 15+: **Done** → System Settings → Privacy & Security → **Open Anyway**. macOS 14−: chuột phải app → **Open** → **Open** |
| "macOS is running the app from a protected temporary copy…" | App Translocation (app còn cờ quarantine) | Terminal: `xattr -dr com.apple.quarantine ` + kéo thư mục `Lucky Draw Studio` vào, Enter, mở lại |
| "Lucky Draw Studio is damaged and can't be opened" | Chữ ký hỏng/thiếu (không build qua `npm run package`, hoặc sửa file trong bundle sau khi ký) | Build lại bằng `npm run package`; tạm thời dùng lệnh `xattr` như trên |
| "Cannot write to the data folder" | USB NTFS (chỉ-đọc trên Mac) hoặc thư mục không có quyền ghi | Dùng USB exFAT, hoặc chuyển thư mục sang Desktop/Documents |
| Thiếu tab / hộp thoại chọn bản session | Như Windows | Như Windows |
| Đóng cửa sổ mà app không thoát | Đang chạy bản dev (`electron:dev`) | Bình thường, chỉ bản đóng gói thoát khi đóng cửa sổ |

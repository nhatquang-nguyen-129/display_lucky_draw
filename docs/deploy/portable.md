# Portable — 1 thư mục mang theo cả app lẫn dữ liệu

> **Trạng thái**
> - **Windows**: đã implement và test (`…-win.zip`).
> - **macOS**: code và cấu hình đã có (`…-mac.zip`), **chờ build + test trên Mac thật**. Làm theo mục
>   [macOS](#4-macos), ghi lại kết quả vào đây.

Bản portable là **định dạng phân phối chính** của app. Bản cài đặt (Installer) chỉ dành cho máy cố
định dùng lâu dài, xem [installer.md](./installer.md). Cách build cả hai: [build.md](./build.md).

## 1. Triết lý thiết kế

### Mục tiêu

Chuẩn bị xong mọi thứ ở nhà (participant, prize, landing page với đủ component/ảnh) → copy NGUYÊN 1
thư mục vào USB/ổ ngoài → tới venue chạy thẳng là có sẵn toàn bộ dữ liệu, trên Windows lẫn Mac. Không
cài đặt, không cần quyền Admin. Kết quả quay ghi ngược vào thư mục đó, cầm về là có đủ.

### Nguyên tắc

1. **"App" = 1 thư mục, dữ liệu nằm TRONG thư mục đó.** Người dùng chỉ cần nhớ 1 quy tắc: *luôn copy
   nguyên thư mục, không tách file ra*.
2. **Dữ liệu chỉ có ĐÚNG 1 bản** (các file session trong `data/`). Không có "bản mẫu" gói sẵn trong app
   để tự khôi phục. Nếu có, xoá/quên copy file db thì app lặng lẽ quay về bản mẫu: trông vẫn đủ
   participant/prize nhưng mất danh sách người đã trúng, và người đã trúng có thể trúng lại. Với app
   quay số, đây là lỗi công bằng.
3. **Không bao giờ âm thầm lưu dữ liệu sang chỗ khác.** Chạy sai chỗ (thư mục tạm, chỗ không ghi được)
   thì báo lỗi rõ ràng và thoát, không fallback về thư mục hồ sơ hệ điều hành. Fallback sẽ làm người
   dùng tưởng dữ liệu vẫn nằm trong thư mục app.
4. **Không ảnh hưởng bản dev.** Mọi logic riêng của bản đóng gói đều chặn bằng `app.isPackaged`.
5. **Trải nghiệm Windows và macOS giống nhau nhất có thể**: cùng cấu trúc thư mục, cùng hành vi khi
   đóng cửa sổ/mở lần 2/chạy sai chỗ. File session **dùng chung được** giữa 2 hệ điều hành (SQLite
   cùng định dạng).

### Vì sao làm được đơn giản

Toàn bộ dữ liệu của 1 session nằm trong **đúng 1 file SQLite** (mỗi session 1 file trong `data/`), không có
file ảnh rời:

| Dữ liệu | Nằm ở đâu trong DB |
|---|---|
| Session (tab quay số) | bảng `sessions` |
| Participant | bảng `participants` (cột file import nằm trong `extra_data`) |
| Prize, kể cả ảnh giải | bảng `prizes` (`display_image`, base64) |
| Landing page: component, ảnh nền, ảnh PNG | `sessions.landing_config` (JSON, ảnh nhúng base64) |
| Kết quả quay | bảng `draw_results` |

Nên "mang dữ liệu theo app" chỉ là **đặt thư mục `data/` cạnh app**, và mang 1 session riêng lẻ sang máy khác
chỉ là copy 1 file. Cơ chế lưu theo session, tên file, bản trùng: [`docs/architecture/database-schema.md`](../architecture/database-schema.md#lưu-trữ-theo-session--mỗi-session-là-1-file).

### Các phương án đã loại

| Phương án | Vì sao loại |
|---|---|
| File `.exe` portable 1-file (target `portable` của electron-builder) | Mỗi lần chạy tự giải nén toàn bộ app (~300 MB) ra `%TEMP%` và **xoá thư mục đó khi tắt** (`templates/nsis/portable.nsi`: `RMDir /r $INSTDIR`). Không để DB bên trong được: mọi thứ ghi lúc chạy mất khi tắt app. Mở chậm (~5s trên SSD, lâu hơn từ USB), cần chỗ trống ổ C: |
| `.exe` mang sẵn DB mẫu, lần đầu chạy copy ra cạnh exe | Vi phạm nguyên tắc 2: có 2 bản dữ liệu, xoá file db là âm thầm quay về bản mẫu |
| Ghi DB vào bên trong `.app` bundle (macOS) | Làm hỏng chữ ký của bundle, Gatekeeper coi app đã bị sửa và có thể chặn |
| Target `zip` có sẵn của electron-builder | Bung thẳng ~18 file lẻ ra chỗ giải nén (không có thư mục mẹ), dễ vương vãi ra Desktop |

## 2. Thực thi kỹ thuật

### Chọn thư mục `data/` — `electron/db.ts`

`folderBuildBaseDir()` xác định app có đang chạy ở "bản thư mục" không, từ đó ra `DATA_DIR` — thư mục
`data/` chứa các file session:

| Trường hợp | Nhận biết | Thư mục `data/` |
|---|---|---|
| Dev (`npm run electron:dev`) | `!app.isPackaged` | `<userData>/data/` |
| Windows: bản cài đặt | Có `Uninstall *.exe` cạnh exe | `<userData>/data/` (xem [installer.md](./installer.md)) |
| Windows: file exe portable (target cũ, nếu build lại) | Có biến `PORTABLE_EXECUTABLE_DIR` | `<userData>/data/` |
| macOS: app đã kéo vào Applications | Thư mục chứa `.app` là `/Applications` hoặc `~/Applications` | `<userData>/data/` (xem [installer.md](./installer.md)) |
| Linux | | `<userData>/data/` (chưa hỗ trợ bản thư mục) |
| **Windows: bản thư mục** | Còn lại | **`<thư mục chứa exe>\data\`** |
| **macOS: bản thư mục** | Còn lại | **`<thư mục chứa .app>/data/`** |

`userData` = `%APPDATA%\lucky-draw-app\` (Windows) / `~/Library/Application Support/lucky-draw-app/`
(macOS). Trên macOS, thư mục chứa bundle được lấy bằng cách lùi 3 cấp từ `process.execPath`
(`…/Lucky Draw Studio.app/Contents/MacOS/Lucky Draw Studio` → `…/Lucky Draw Studio.app` → cha của nó).

### Các lớp chặn — báo lỗi rồi thoát

Chỉ áp dụng cho bản thư mục, kiểm tra theo thứ tự trước khi mở DB:

| Tình huống | Nhận biết | Hộp thoại hướng dẫn |
|---|---|---|
| macOS App Translocation | `execPath` chứa `/AppTranslocation/` | Lệnh `xattr` gỡ cờ quarantine (xem [macOS](#mở-trên-mac-khác-gatekeeper-app-translocation)) |
| Chạy từ thư mục tạm (Windows: mở exe ngay trong zip chưa giải nén) | Thư mục app nằm dưới `os.tmpdir()` | "Extract All" rồi chạy từ thư mục đã giải nén |
| `data/` không ghi được | Ghi thử + xoá 1 file dò thất bại (đáng tin hơn `fs.accessSync` với USB/ổ mạng) | Chuyển thư mục sang chỗ ghi được; trên Mac nhắc USB NTFS là chỉ-đọc |

### Hành vi chung của bản đóng gói (`app.isPackaged`)

- **Chặn mở 2 app cùng lúc**: `app.requestSingleInstanceLock()` ở đầu `db.ts`, TRƯỚC khi mở DB (vì
  `main.ts` import `db.ts` trước mọi dòng code khác). Instance thứ 2 thoát ngay, cửa sổ đang chạy được
  đưa lên trước (`second-instance` trong `main.ts`). Không có 2 process cùng ghi 1 file DB.
- **Đóng mọi file session khi thoát** (`will-quit` trong `main.ts`). File session dùng
  `journal_mode = DELETE` nên ghi xong là đủ dữ liệu, không có file `-wal` đi kèm.
- **Đóng cửa sổ cuối cùng là thoát app**, trên cả macOS (`window-all-closed`). Mặc định trên Mac app
  vẫn chạy ngầm; bản đóng gói cố tình khác để DB được đóng ngay, người dùng tưởng đã tắt rồi rút USB
  cũng không hỏng dữ liệu. Bản dev trên Mac giữ hành vi mặc định.

### Đóng gói — `electron/make-portable-zip.mjs`

Chạy sau electron-builder trong `npm run package`, trên đúng hệ điều hành đang build. Không thêm
dependency nào:

1. Tạm dời `data/` (nếu có, do chạy thử bản build) ra ngoài, để **dữ liệu test không lọt vào bản phân
   phối**.
2. Tạm đổi tên thư mục output của electron-builder thành `Lucky Draw Studio`, để zip **có sẵn thư mục
   mẹ**.
3. Nén: Windows dùng `tar.exe` (bsdtar) có sẵn trong Windows 10/11; macOS dùng `ditto` (giữ đúng
   symlink/metadata của `.app` bundle, zip thường làm hỏng bundle).
4. LUÔN trả lại tên thư mục và `data/` như cũ, kể cả khi nén lỗi (electron-builder cần đúng tên cũ ở
   lần build sau).

Riêng macOS, trước khi nén script **ký ad-hoc** toàn bộ `.app` (`codesign --force --deep --sign -`)
rồi `codesign --verify`. Chi tiết ở mục [Ký số](#ký-số-code-signing).

## 3. Windows

### Cấu trúc

```
Lucky Draw Studio\               ← thư mục mẹ có sẵn trong Lucky Draw Studio-<version>-win.zip
├── Lucky Draw Studio.exe        ← double-click để chạy
├── data\
│   ├── Hoi-cho__3f9a1c2e.db     ← 1 file = 1 session (participant, prize, landing, lịch sử quay)
│   └── Minigame__8b20d7aa.db
└── resources\ locales\ *.dll …  ← file của app, không động vào
```

Chỉ copy riêng `Lucky Draw Studio.exe` thì app không mở được (thiếu dll): lỗi lộ ngay, không mất dữ
liệu âm thầm.

### Build

`npm run package` trên máy Windows → `release/Lucky Draw Studio-<version>-win.zip` (~120 MB). Chi tiết
và yêu cầu máy build: [build.md](./build.md).

`release/win-unpacked/` chính là thư mục app y hệt nội dung file zip. Dùng thẳng được để test, nhưng
lần `npm run package` sau sẽ ghi đè, nên đừng để dữ liệu thật ở đó.

### Chuẩn bị dữ liệu

**Cách sạch nhất: chuẩn bị luôn bằng bản thư mục.**

1. Giải nén `…-win.zip` (chuột phải → **Extract All**) ra máy mình hoặc thẳng lên USB.
2. Chạy `Lucky Draw Studio.exe`, tạo session (tab) → mỗi session tự có 1 file trong `data\`.
3. Nhập participant, prize, dựng landing, quay thử nếu cần (**Reset session** trước khi mang đi).
4. Tắt app (không bắt buộc với dữ liệu — file luôn đủ sau mỗi lần ghi — nhưng nên tắt trước khi copy).
5. Copy nguyên thư mục lên USB (nếu chưa làm ở bước 1).

**Mang 1 session từ máy khác / từ bản dev hoặc bản cài đặt:** copy đúng file session đó (nút **Data
folder** ở góc phải thanh tab mở thư mục `data` của bản đang chạy) vào `data\` của bản thư mục — tab
tự hiện khi mở app hoặc khi quay lại cửa sổ app. Bản dev/cài đặt dùng `%APPDATA%\lucky-draw-app\data\`.

### Mở trên máy khác

- **Phải giải nén trước.** Mở exe ngay trong zip (Windows hỏi "Extract all / Run") thì app báo lỗi
  "running from a temporary folder" rồi thoát. Đây là chủ đích: Windows chạy app từ `%TEMP%`, dữ liệu
  ghi ở đó sẽ mất.
- **SmartScreen** lần đầu (app chưa ký số): "Windows protected your PC" → **More info → Run anyway**.
  Một số phần mềm diệt virus có thể báo nhầm vì cùng lý do.
- Cách an toàn nhất khi gửi cho người vận hành: **copy sẵn thư mục đã giải nén** (kèm
  các file session trong `data\`) vào USB, họ không phải giải nén gì.

### Lỗi thường gặp (Windows)

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| "The app is running from a temporary folder" | Mở exe ngay trong file zip chưa giải nén | Chuột phải zip → Extract All, chạy exe trong thư mục đã giải nén |
| "Cannot write to the data folder" | Ổ chỉ-đọc, USB khoá write-protect, thư mục không có quyền ghi | Chuyển nguyên thư mục sang chỗ ghi được (Desktop, Documents, USB không khoá) |
| App mở ra thiếu tab / TRỐNG dù đã chuẩn bị dữ liệu | File session không nằm đúng `data\` cạnh exe | Bấm **Data folder** để xem app đang đọc thư mục nào, đặt file session vào đó |
| Hiện hộp thoại "Different copies of the same session" | Có ≥ 2 file của cùng 1 session (copy qua lại, mỗi bên sửa riêng) | Chọn bản muốn giữ (mặc định gợi ý bản mới nhất), bản còn lại vào `data\.trash\` |
| SmartScreen chặn hẳn, không có nút "Run anyway" | Policy công ty chặn app chưa ký số | Cần chứng chỉ code signing, ngoài phạm vi hiện tại |

## 4. macOS

### Cấu trúc

```
Lucky Draw Studio/                  ← thư mục mẹ có sẵn trong Lucky Draw Studio-<version>-mac.zip
├── Lucky Draw Studio.app           ← double-click để mở (Finder hiện như 1 file, thật ra là thư mục)
└── data/
    └── <tên-session>__<mã>.db       ← 1 file = 1 session
```

`data/` nằm **cạnh** `.app`, không nằm trong bundle.

### Khác biệt so với Windows

| | Windows | macOS |
|---|---|---|
| File phân phối | `…-win.zip` (x64) | `…-mac.zip` (universal: chạy cả Mac chip M lẫn Intel, file nặng hơn) |
| Máy lạ chặn lần đầu | SmartScreen | Gatekeeper, xem [bên dưới](#mở-trên-mac-khác-gatekeeper-app-translocation) |
| Chạy sai chỗ | Mở exe trong zip → báo lỗi | App Translocation → báo lỗi kèm lệnh sửa |
| USB | NTFS/exFAT đều được | **Phải exFAT** (hoặc APFS/Mac OS Extended). NTFS trên Mac là chỉ-đọc |
| Kéo riêng app vào Applications | | Thành "bản cài đặt", dữ liệu chuyển sang `userData` (xem [installer.md](./installer.md)) |

### Build trên Mac

Chỉ build được TRÊN MÁY MAC: `better-sqlite3` là native module, và script nén dùng `codesign`/`ditto`
của macOS.

1. Xcode Command Line Tools (codesign, lipo cho bản universal): `xcode-select --install`
2. Node.js 20 LTS (cùng major với máy Windows): tải từ nodejs.org, hoặc `nvm install 20 && nvm use 20`
3. Lấy code:

   ```bash
   git clone https://github.com/nhatquang-nguyen-129/display_lucky_draw.git
   cd display_lucky_draw
   git checkout branch_2x      # đã clone rồi thì: git pull
   ```

4. `npm ci` (cài đúng version trong `package-lock.json`)
5. `npm run package`: build renderer + main → electron-builder đóng gói `.app` universal (build x64 +
   arm64 rồi gộp; lần đầu tải Electron cho cả 2 kiến trúc nên lâu vài phút) → script ký ad-hoc rồi nén.

Kết quả trong `release/`:

| File | Ý nghĩa |
|---|---|
| `Lucky Draw Studio-<version>-mac.zip` | **Bản phân phối**, có thư mục mẹ `Lucky Draw Studio/` |
| `mac-universal/Lucky Draw Studio.app` | App chưa nén, test nhanh được, bị ghi đè ở lần build sau |
| `builder-debug.yml` | Log cấu hình electron-builder, bỏ qua |

Chạy dev trên Mac (không bắt buộc để build): thêm `npx electron-rebuild` sau `npm ci`, rồi
`npm run electron:dev`. Xem [`docs/local/run-dev.md`](../local/run-dev.md).

### Ký số (code signing)

- `build.mac.identity: null`: electron-builder KHÔNG ký bằng Developer ID (không cần tài khoản Apple
  Developer $99/năm).
- Script nén tự **ký ad-hoc** (`codesign --sign -`) toàn bộ bundle. Bắt buộc vì 2 lý do: binary arm64
  trên Mac chip M phải có chữ ký hợp lệ; và máy khác sẽ báo "chưa xác minh" (có nút mở) thay vì "is
  damaged" (không có nút mở).
- `hardenedRuntime: false`: hardened runtime chỉ cần cho notarization; bật nó với chữ ký ad-hoc dễ làm
  app không nạp được native module `better_sqlite3.node`.
- Muốn hết hẳn cảnh báo Gatekeeper trên mọi Mac: cần Apple Developer ID + notarization, ngoài phạm vi
  hiện tại.

### Mở trên Mac khác (Gatekeeper, App Translocation)

App tải về, AirDrop, hoặc giải nén từ zip tải về đều bị macOS gắn cờ **quarantine**. Hệ quả:

1. **Gatekeeper chặn lần mở đầu tiên.**
   - macOS 15 (Sequoia) trở lên: mở app → "Apple could not verify…" → **Done** → **System Settings →
     Privacy & Security** → kéo xuống, bấm **Open Anyway** cạnh tên app → xác nhận bằng mật khẩu máy.
     Chuột phải → Open không còn bỏ qua được như macOS cũ.
   - macOS 14 trở xuống: chuột phải (Control-click) vào app → **Open** → **Open**.
2. **App Translocation**: app còn cờ quarantine bị macOS âm thầm chạy từ một bản sao chỉ-đọc ở đường
   dẫn ngẫu nhiên, nên không thấy `data/` thật. App phát hiện và báo lỗi kèm lệnh sửa.

**Cách chắc chắn nhất** (1 lần cho mỗi bản copy, gỡ cờ cho mọi file trong thư mục): mở Terminal, gõ
`xattr -dr com.apple.quarantine ` (có dấu cách cuối), kéo thư mục `Lucky Draw Studio` vào cửa sổ
Terminal, Enter.

Copy qua USB bằng Finder từ máy build (file chưa từng bị gắn cờ) thường không bị hỏi gì.

### Chuẩn bị dữ liệu

Như Windows: giải nén zip (double-click trong Finder), mở app, nhập dữ liệu, **thoát app** (đóng cửa
sổ hoặc Cmd+Q), copy nguyên thư mục. Mang 1 session từ bản dev/cài đặt trên Mac
(`~/Library/Application Support/lucky-draw-app/data/`) hoặc từ bản Windows: copy đúng file session đó vào
`data/`.

### Checklist test trên Mac

- [ ] Giải nén `…-mac.zip` → ra đúng 1 thư mục `Lucky Draw Studio/`.
- [ ] Mở `Lucky Draw Studio.app`, tạo 1 session → app lên, không bật DevTools; có `data/<tên>__<mã>.db` cạnh `.app`.
- [ ] Import participant/prize, dựng landing, quay thử, mở Present Mode/Landing Builder: hiển thị và
      hiệu ứng như bản Windows.
- [ ] Đóng cửa sổ (nút đỏ) → app thoát hẳn (không còn chấm dưới icon Dock); `data/` chỉ có các file
      `.db` (không có `-wal`/`-journal`).
- [ ] Double-click app lần 2 khi đang mở → chỉ đưa cửa sổ cũ lên trước.
- [ ] Copy nguyên thư mục sang chỗ khác (USB exFAT) → mở thấy đủ dữ liệu.
- [ ] Copy 1 file session từ bản Windows vào `data/` → mở thấy đúng session đó.
- [ ] Copy thêm 1 bản khác của cùng session (vd `… - Copy.db`) → hiện hộp thoại chọn bản ngay khi mở app.
- [ ] Kéo riêng `.app` vào `/Applications` rồi mở → dùng `~/Library/Application Support/lucky-draw-app/`,
      KHÔNG tạo `data/` trong Applications.

### Lỗi thường gặp (macOS)

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| "macOS is running the app from a protected temporary copy…" | App Translocation (app còn cờ quarantine) | Lệnh `xattr -dr com.apple.quarantine <thư mục>` như trên, mở lại |
| "Lucky Draw Studio is damaged and can't be opened" | Chữ ký hỏng/thiếu (không build qua `npm run package`, hoặc sửa file trong bundle sau khi ký) | Build lại bằng `npm run package`; tạm thời dùng lệnh `xattr` |
| "Cannot write to the data folder" | USB NTFS (chỉ-đọc trên Mac) hoặc thư mục không có quyền ghi | Dùng USB exFAT, hoặc chuyển thư mục sang Desktop/Documents |
| Đóng cửa sổ mà app không thoát | Đang chạy bản dev (`electron:dev`), bản dev giữ hành vi Mac mặc định | Bình thường, chỉ bản đóng gói mới thoát khi đóng cửa sổ |

Lỗi lúc **build** trên Mac (gộp universal, `codesign`, `npm ci`): [troubleshooting.md](./troubleshooting.md).

## 5. Vận hành tại venue (cả 2 hệ điều hành)

- **Test trước ngày sự kiện (bắt buộc)**: mở từ đúng USB sẽ mang đi, trên máy khác nếu có, **tự mắt
  xác nhận** thấy đủ session/participant/prize/landing. Thiếu tab = file session không nằm đúng
  `data/`.
- **Không rút USB khi app đang chạy**, có thể hỏng file DB. Tắt app trước, rồi mới rút.
- **Luôn giữ 1 bản sao các file trong `data/`** ở nơi khác trước khi đi. USB hỏng/mất là mất cả dữ liệu
  lẫn kết quả.
- USB chậm (USB 2.0 cũ) có thể làm app mở chậm hơn. Test trước với đúng USB sẽ mang đi.
- **Chromium profile vẫn nằm ở máy venue**: chỉ dữ liệu session nằm trong `data/`, còn Local
  Storage/Cache của Chromium vẫn ghi vào `userData` của máy đang chạy. Hệ quả: app không nhớ tab mở
  cuối cùng khi sang máy khác (`localStorage` ở `SessionContext.tsx`, vô hại), và máy venue còn sót
  vài file cache nhỏ (không chứa participant/prize); muốn dọn sạch thì tự xoá thư mục đó.
- **Máy chạy cả bản dev lẫn bản thư mục**: dùng chung Chromium profile nhưng KHÁC file DB.

**Sau sự kiện**: tắt app → cầm USB về. File session trong `data/` đã có đủ kết quả quay (`draw_results`),
mở bằng chính bản thư mục đó để xem lại/xuất kết quả.

## 6. Việc còn lại

- **macOS**: build + chạy [checklist](#checklist-test-trên-mac) trên Mac thật, ghi kết quả vào đây.
  Nếu gộp universal lỗi, chuyển sang chỉ build arm64 (xem [troubleshooting.md](./troubleshooting.md)).
- **Tuỳ nhu cầu**: code signing Windows / Apple Developer ID + notarization để hết cảnh báo
  SmartScreen/Gatekeeper.
- **Linux**: chưa có bản thư mục (`db.ts` luôn dùng `~/.config/lucky-draw-app/data/`).
  electron-builder đóng gói được `AppImage`/`deb` nếu cần, build trên Linux.

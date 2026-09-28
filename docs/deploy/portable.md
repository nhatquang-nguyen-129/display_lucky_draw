# Portable — 1 thư mục mang theo cả app lẫn dữ liệu

> **Trạng thái**
> - **Windows**: đã implement và test (`…-win.zip`).
> - **macOS**: đã build + test trên Mac thật (MacBook Pro M-series, macOS 26.6.2, arm64,
>   2026-09-28). Ký **ad-hoc** (`identity: null`, mặc định hiện tại) bị `amfid` (AMFI) CHẶN HẲN lúc
>   chạy — không phải chỉ cảnh báo Gatekeeper như giả định ban đầu, xem
>   [Ký số](#ký-số-code-signing). Đã tìm được cách chạy được **miễn phí, không cần Developer ID
>   $99/năm**, bằng cách ký lại thủ công bằng 1 chứng chỉ "Apple Development" (Xcode + Apple ID
>   thường) — đã xác nhận app mở được, chạy đủ tiến trình, ổn định. **Giới hạn quan trọng: cách này
>   chỉ có tác dụng trên ĐÚNG máy Mac đã tạo chứng chỉ đó** (private key nằm trong Keychain của máy
>   đó) — mang sang máy Mac khác sẽ gặp lại lỗi AMFI y hệt, xem
>   [Mở trên Mac khác chưa có chứng chỉ](#mở-trên-mac-khác-chưa-có-chứng-chỉ---khắc-phục-tạm-thời).
>   Muốn 1 bản build chạy được trên MỌI Mac mà không cần cấu hình gì thêm vẫn cần Apple Developer ID +
>   notarization — xem [Việc còn lại](#6-việc-còn-lại). Checklist chức năng đầy đủ (import, quay, landing…)
>   **chưa được test bằng tay** sau khi sửa lỗi mở app — mới xác nhận app khởi động và giữ tiến trình ổn định.

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
- Script nén tự **ký ad-hoc** (`codesign --sign -`) toàn bộ bundle. Ban đầu tưởng đủ vì 2 lý do: binary
  arm64 trên Mac chip M phải có MỘT chữ ký nào đó mới nạp được (kể cả ad-hoc); và máy khác sẽ báo "chưa
  xác minh" (có nút mở) thay vì "is damaged" (không có nút mở).
- `hardenedRuntime: false`: hardened runtime chỉ cần cho notarization; bật nó với chữ ký ad-hoc dễ làm
  app không nạp được native module `better_sqlite3.node`.

**CẬP NHẬT sau khi test trên Mac thật (2026-09-28) — ký ad-hoc KHÔNG ĐỦ, không chỉ là "cảnh báo lúc mở
lần đầu" như giả định ban đầu:**

`spctl --assess --type execute` từ chối thẳng bundle đã ký ad-hoc, và app **không mở được, không có
cửa sổ nào cả** — không phải hiện cảnh báo rồi cho bấm tiếp như Gatekeeper thường làm. Unified log
(`log show`) lộ ra `amfid` chặn app lúc khởi động:

```
amfid[...] '.../Lucky Draw Studio' not valid: Error Domain=AppleMobileFileIntegrityError Code=-423
"The file is adhoc signed or signed by an unknown certificate chain"
```

Xảy ra với CẢ 2 kiểu build (universal đã qua `make-portable-zip.mjs`, lẫn bản `--dir` build tay ký lại
thủ công bằng đúng lệnh `codesign --sign -` — `codesign --verify` báo "valid on disk" nhưng `spctl
--assess`/thực tế chạy vẫn bị chặn, tức 2 công cụ đánh giá KHÁC NHAU). Máy test ở cấu hình Gatekeeper
MẶC ĐỊNH (`spctl --status` → "assessments enabled", `csrutil status` → SIP enabled, không tắt/chỉnh gì
thêm) — nên nhiều khả năng đây là hành vi chung của macOS hiện tại với ad-hoc signing, không phải lỗi
cấu hình riêng của 1 máy.

Muốn hết cảnh báo Gatekeeper (`spctl --assess`) VÀ vượt qua AMFI mà không tốn tiền: cần ký bằng 1
chứng chỉ có chuỗi tin cậy THẬT (không phải ad-hoc) — xem ngay bên dưới. Muốn 1 bản build chạy được
trên MỌI Mac không cần cấu hình gì thêm thì vẫn cần Apple Developer ID + notarization thật sự — xem
[Việc còn lại](#6-việc-còn-lại).

### CẬP NHẬT (2026-09-28, tiếp theo) — cách chạy được, MIỄN PHÍ, chỉ trên 1 máy cụ thể

Ký bằng chứng chỉ **"Apple Development"** (loại chứng chỉ miễn phí Xcode tự cấp cho bất kỳ Apple ID
nào qua "Personal Team", KHÔNG cần trả phí $99/năm) thay cho ad-hoc thì AMFI **chấp nhận** — đã xác
nhận app mở được, chạy đủ main/renderer/GPU/network process, không còn thấy lỗi
`AppleMobileFileIntegrityError` trong unified log.

**Cách tạo chứng chỉ** (làm 1 lần trên máy Mac muốn chạy app):

1. Cài Xcode đầy đủ từ Mac App Store (không phải chỉ Command Line Tools) — cần vì chỉ Xcode mới có
   UI "Manage Certificates" để tự tạo chứng chỉ ký, `security`/`codesign` dòng lệnh không tự tạo được.
2. Mở Xcode → **Settings → Accounts** → bấm **+** → đăng nhập bằng 1 Apple ID thường (không cần mua
   gì) → Xcode tự tạo 1 "Personal Team" miễn phí.
3. Vẫn trong tab Accounts, chọn team đó → **Manage Certificates…** → **+** → **Apple Development**.
   Bước này bắt buộc làm riêng — thêm tài khoản ở bước 2 KHÔNG tự sinh chứng chỉ.

**Vấn đề gặp phải #1 — chứng chỉ tạo xong nhưng không thấy khi ký:**

`security find-identity -v -p codesigning` báo **"0 valid identities found"** dù Xcode đã hiện rõ
chứng chỉ trong Manage Certificates. Nguyên nhân: máy thiếu chứng chỉ trung gian (Intermediate CA)
đúng thế hệ mà chứng chỉ mới cần để nối chuỗi lên `Apple Root CA`. Kiểm tra bằng
`security verify-cert -c <file cert đã export> -k <keychain>` sẽ thấy thẳng `CSSMERR_TP_NOT_TRUSTED`.
Cụ thể trên máy test: chứng chỉ mới có issuer là **WWDR — G3**, nhưng máy chỉ có sẵn bản **WWDR G2**
(đã hết hạn từ 07/02/2023) — bản G3 không hề tồn tại trong keychain.

**Cách xử lý**: tải chứng chỉ trung gian đúng thế hệ từ trang chính thức của Apple
(`https://www.apple.com/certificateauthority/`, tìm mục **"Worldwide Developer Relations — G3"** hoặc
thế hệ mới hơn tương ứng với lỗi báo), double-click file `.cer` tải về → Keychain Access tự mở, bấm
**Add**. Chạy lại `security find-identity -v -p codesigning` sẽ thấy hiện đúng 1 identity.

**Vấn đề gặp phải #2 — `codesign --force --deep --sign "<identity>"` báo lỗi `errSecInternalComponent`
ở `Squirrel.framework`:**

`--deep` (ký lồng tất cả file con tự động) bị vỡ cụ thể ở `Squirrel.framework` (framework auto-update
mặc định của electron-builder, có cấu trúc symlink `Versions/Current -> A` khiến `--deep` xử lý sai
thứ tự). Lệnh báo lỗi và DỪNG GIỮA CHỪNG — app vẫn còn chữ ký ad-hoc cũ, chưa được ký lại thật.

**Cách xử lý**: ký thủ công theo đúng thứ tự **từ trong ra ngoài** (không dùng `--deep` ở bước cuối):

```bash
IDENTITY="<SHA-1 hash từ security find-identity>"
APP="Lucky Draw Studio.app"

# 1. Mọi .dylib rời (trong Electron Framework.framework/Libraries, và better_sqlite3.node)
codesign --force --sign "$IDENTITY" "$APP/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libEGL.dylib"
# … lặp lại cho libvk_swiftshader.dylib, libGLESv2.dylib, libffmpeg.dylib, và
#   Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node

# 2. Executable NẰM SÂU NHẤT trong mỗi framework/helper (ShipIt, Squirrel, Mantle, ReactiveObjC,
#    chrome_crashpad_handler, rồi tới binary chính của Electron Framework)
codesign --force --sign "$IDENTITY" "$APP/Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt"
# … tương tự cho các executable còn lại, TỪNG FILE MỘT

# 3. Bản thân từng .framework bundle (Squirrel, Mantle, ReactiveObjC, Electron Framework)
codesign --force --sign "$IDENTITY" "$APP/Contents/Frameworks/Squirrel.framework"
# … tương tự cho 3 framework còn lại

# 4. Từng Helper .app (ký executable bên trong trước, rồi ký cái .app)
codesign --force --sign "$IDENTITY" "$APP/Contents/Frameworks/Lucky Draw Studio Helper.app/Contents/MacOS/Lucky Draw Studio Helper"
codesign --force --sign "$IDENTITY" "$APP/Contents/Frameworks/Lucky Draw Studio Helper.app"
# … tương tự cho Helper (Plugin)/(Renderer)/(GPU)

# 5. Cuối cùng app chính — KHÔNG --deep (mọi thứ bên trong đã ký xong)
codesign --force --sign "$IDENTITY" "$APP"

codesign --verify --deep --strict "$APP"   # phải ra "valid on disk" / không in gì kèm exit code 0
```

Ký nhiều file liên tiếp bằng 1 identity thật (khác ad-hoc) sẽ làm macOS hỏi mật khẩu Keychain **nhiều
lần liên tiếp** ("codesign wants to access key…") — bấm **Always Allow** (không phải "Allow") ở lần
hỏi đầu tiên để không bị hỏi lại ở các file sau.

**`spctl --assess --type execute` VẪN báo "rejected" sau khi ký xong bằng cách này — đây là BÌNH
THƯỜNG, không phải ký sai.** `spctl --assess` là câu hỏi riêng của Gatekeeper "app này có đủ điều kiện
PHÂN PHỐI công khai không" (chỉ chấp nhận Developer ID + notarization), khác hẳn với AMFI (cái thực sự
chặn app CHẠY). Cứ mở app bình thường (`open "Lucky Draw Studio.app"`) là chạy được dù `spctl` báo
rejected — đã xác nhận bằng cách kiểm tra toàn bộ process con (main, renderer, GPU, network) đều lên
và giữ chạy ổn định, không tự thoát.

### Mở trên Mac khác chưa có chứng chỉ — khắc phục tạm thời

Bản `.zip` phân phối (`make-portable-zip.mjs`) chỉ ký **ad-hoc** — mang sang bất kỳ Mac nào khác
(kể cả Mac của chính mình nhưng chưa làm bước ở trên) đều gặp lại NGUYÊN VẸN lỗi AMFI Code -423 (app
tự thoát trong 1-2s, không cửa sổ, không dialog). "Open Anyway" trong System Settings **không giúp
được** — đó là bypass cho Gatekeeper (quarantine), còn AMFI là 1 lớp chặn RIÊNG, thấp hơn, không có
nút bypass tương đương. Cần 1 trong 2 cách sau, làm TRÊN CHÍNH máy Mac muốn chạy:

**Cách A — nhanh, không cần cài lại Xcode (nếu là máy Mac của chính mình/đồng nghiệp tin cậy):**

Mang chính chứng chỉ đã tạo sang máy mới thay vì tạo chứng chỉ khác:

1. Trên máy GỐC (đã có chứng chỉ): Keychain Access → tìm chứng chỉ "Apple Development: …" → chuột
   phải → **Export…** → lưu file `.p12` (đặt mật khẩu bảo vệ file này).
2. Cũng export chứng chỉ **"Apple Worldwide Developer Relations Certification Authority — G3"** ra
   file `.cer` riêng (cùng cách, hoặc tải thẳng lại từ `https://www.apple.com/certificateauthority/`
   trên máy mới).
3. Copy 2 file này sang máy mới (USB/AirDrop) → double-click từng file → Keychain Access nhập vào,
   nhập đúng mật khẩu đã đặt cho `.p12`.
4. Trên máy mới, chạy `security find-identity -v -p codesigning` để lấy SHA-1 hash (giống hệt máy
   gốc vì là cùng 1 chứng chỉ), rồi chạy lại đúng quy trình ký thủ công ở mục
   [Ký số](#ký-số-code-signing) (từng file, từ trong ra ngoài) nhắm vào bản `.app` đang có trên máy
   mới.

Lưu ý: làm vậy nghĩa là private key của chứng chỉ giờ tồn tại trên ≥ 2 máy — chấp nhận được cho vài
máy cá nhân tự quản, nhưng không phải cách làm đúng chuẩn bảo mật cho chứng chỉ dùng lâu dài/nhiều máy.

**Cách B — làm lại từ đầu trên máy mới (chắc chắn hơn, không chia sẻ private key):**

Lặp lại nguyên bước "Cách tạo chứng chỉ" ở mục Ký số trên máy mới: cài Xcode, đăng nhập Apple ID
(dùng ID nào cũng được, không nhất thiết trùng máy gốc), tạo "Apple Development" certificate, cài
chứng chỉ trung gian WWDR G3, rồi ký lại `.app` bằng identity MỚI của máy đó.

**Dù chọn cách nào**: `spctl --assess` trên máy mới vẫn sẽ báo "rejected" như đã giải thích ở trên —
không phải lỗi, cứ mở app bình thường. Nếu bản `.zip` được truyền qua AirDrop/tải từ đâu đó (có cờ
quarantine), có thể còn cần thêm bước Control-click → Open hoặc System Settings → Privacy & Security
→ **Open Anyway** (xem mục ngay dưới) — bước này độc lập với việc ký lại, làm sau khi đã ký xong.

**Không thực tế cho nhiều máy venue lạ không kiểm soát được** (mỗi máy phải tự làm 1 trong 2 cách
trên) — nếu cần 1 bản build chạy thẳng trên MỌI Mac không cần cấu hình gì, đó là lúc cần đầu tư Apple
Developer ID + notarization thật, xem [Việc còn lại](#6-việc-còn-lại).

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

Test lần đầu (2026-09-28, MacBook Pro M-series/macOS 26.6.2/arm64):

- [x] Giải nén `…-mac.zip` → ra đúng 1 thư mục `Lucky Draw Studio/`. **Đạt.**
- [x] `npm run package` chạy xong không lỗi, `codesign --verify --deep --strict` báo "valid on disk".
      **Đạt** (nhưng chữ ký ad-hoc mặc định KHÔNG đủ để AMFI cho chạy — xem mục Ký số).
- [x] Mở `Lucky Draw Studio.app` sau khi ký lại bằng chứng chỉ Apple Development (miễn phí) theo đúng
      quy trình ở mục [Ký số](#ký-số-code-signing) → app khởi động và **giữ chạy ổn định** (xác nhận
      qua `ps`: đủ 4 tiến trình main/renderer/GPU/network sau ≥ 8 giây, không tự thoát, không lỗi AMFI
      trong unified log). Với chữ ký ad-hoc mặc định (chưa làm bước ở mục Ký số): **KHÔNG ĐẠT** — tự
      thoát trong 1-2s, không cửa sổ, không log, không crash report (AMFI Code -423).
- [ ] Tạo 1 session, có `data/<tên>__<mã>.db` cạnh `.app`; import participant/prize, dựng landing, quay
      thử, mở Present Mode/Landing Builder — **chưa test bằng tay qua UI**, mới xác nhận app khởi động
      và giữ tiến trình ổn định ở bước trên.
- [ ] Đóng cửa sổ (nút đỏ) → app thoát hẳn — **chưa test được**.
- [ ] Double-click app lần 2 khi đang mở → chỉ đưa cửa sổ cũ lên trước — **chưa test được**.
- [ ] Copy nguyên thư mục sang chỗ khác (USB exFAT) → mở thấy đủ dữ liệu — **chưa test được**.
- [ ] Copy 1 file session từ bản Windows vào `data/` → mở thấy đúng session đó — **chưa test được**.
- [ ] Copy thêm 1 bản khác của cùng session (vd `… - Copy.db`) → hiện hộp thoại chọn bản — **chưa test được**.
- [ ] Kéo riêng `.app` vào `/Applications` rồi mở → dùng `~/Library/Application Support/lucky-draw-app/` — **chưa test được**.

**Đã loại trừ được** (không phải nguyên nhân của lỗi AMFI ban đầu) trong lúc điều tra: vị trí thư mục
(thử cả `/tmp` — đúng là bị chặn bởi check "chạy từ thư mục tạm" như thiết kế, cả `~/Desktop` lẫn thư
mục thường trong `~/`), quyền ghi (thư mục test hoàn toàn ghi được), single-instance lock (không có
file `SingletonLock` nào tồn tại lúc đó), asar/entry point (đọc lại `app.asar` xác nhận
`dist-electron/main.js` đúng nội dung đã build).

**Lưu ý khi tự test lại bằng Terminal của máy dev** (không ảnh hưởng người dùng cuối, chỉ ảnh hưởng lúc
tự debug): nếu Terminal/công cụ đang dùng để chạy thử app (vd Terminal mở từ trong 1 IDE nền Electron
như VSCode) có sẵn biến môi trường `ELECTRON_RUN_AS_NODE=1` (thường do chính công cụ đó set cho tiến
trình con của nó), thì chạy thẳng binary `.app` từ Terminal đó sẽ khiến Electron chạy như Node trần —
KHÔNG mở cửa sổ, thoát ngay lập tức, giống hệt triệu chứng bị AMFI chặn nhưng không liên quan gì đến
chữ ký. Kiểm tra bằng `echo $ELECTRON_RUN_AS_NODE`; nếu ra `1`, chạy lại với
`env -u ELECTRON_RUN_AS_NODE "<đường dẫn>/Lucky Draw Studio.app/Contents/MacOS/Lucky Draw Studio"`
hoặc đơn giản nhất là mở app bằng `open` từ Finder thay vì Terminal.

### Lỗi thường gặp (macOS)

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| "macOS is running the app from a protected temporary copy…" | App Translocation (app còn cờ quarantine) | Lệnh `xattr -dr com.apple.quarantine <thư mục>` như trên, mở lại |
| "Lucky Draw Studio is damaged and can't be opened" | Chữ ký hỏng/thiếu (không build qua `npm run package`, hoặc sửa file trong bundle sau khi ký) | Build lại bằng `npm run package`; tạm thời dùng lệnh `xattr` |
| "Cannot write to the data folder" | USB NTFS (chỉ-đọc trên Mac) hoặc thư mục không có quyền ghi | Dùng USB exFAT, hoặc chuyển thư mục sang Desktop/Documents |
| Đóng cửa sổ mà app không thoát | Đang chạy bản dev (`electron:dev`), bản dev giữ hành vi Mac mặc định | Bình thường, chỉ bản đóng gói mới thoát khi đóng cửa sổ |
| **App KHÔNG MỞ ĐƯỢC** — double-click (hoặc chạy thẳng binary) rồi tự thoát trong 1-2s, KHÔNG có cửa sổ, KHÔNG có dialog, KHÔNG có crash report ở `~/Library/Logs/DiagnosticReports/` | AMFI chặn chữ ký ad-hoc — `log show --predicate 'eventMessage CONTAINS "AppleMobileFileIntegrity"'` sẽ thấy `Code=-423 "adhoc signed or signed by an unknown certificate chain"`. Xác nhận bằng `spctl --assess --type execute "Lucky Draw Studio.app"` → "rejected" | Ký lại bằng chứng chỉ Apple Development (miễn phí) theo quy trình ở [Ký số](#ký-số-code-signing) — đã xác nhận hết lỗi trên máy đã làm bước này. Máy khác chưa làm bước này xem [Mở trên Mac khác chưa có chứng chỉ](#mở-trên-mac-khác-chưa-có-chứng-chỉ---khắc-phục-tạm-thời) |
| Tạo xong chứng chỉ "Apple Development" trong Xcode nhưng `security find-identity -v -p codesigning` báo "0 valid identities found" | Thiếu/hết hạn chứng chỉ trung gian WWDR đúng thế hệ (chứng chỉ mới cần "G3" nhưng máy chỉ có "G2" đã hết hạn 07/02/2023) — `security verify-cert` báo `CSSMERR_TP_NOT_TRUSTED` | Tải đúng bản WWDR (G3 hoặc mới hơn theo lỗi báo) từ `https://www.apple.com/certificateauthority/`, double-click để cài vào Keychain — xem [Ký số](#ký-số-code-signing) |
| `codesign --force --deep --sign "<identity thật>"` báo lỗi `errSecInternalComponent` tại `Squirrel.framework` | `--deep` xử lý sai thứ tự với cấu trúc symlink `Versions/Current -> A` của Squirrel.framework — lệnh dừng giữa chừng, app vẫn còn chữ ký ad-hoc cũ | Ký thủ công từng file từ trong ra ngoài, KHÔNG dùng `--deep` ở bước cuối — xem script mẫu ở [Ký số](#ký-số-code-signing) |
| Lúc ký bằng identity thật, macOS liên tục hỏi mật khẩu Keychain ("codesign wants to access key…") | Mỗi lệnh `codesign` là 1 lần xin quyền dùng private key riêng — ký nhiều file thì hỏi nhiều lần | Bấm **Always Allow** (không phải "Allow") ở lần hỏi đầu tiên |
| `spctl --assess --type execute` vẫn báo "rejected" dù đã ký bằng identity thật (không phải ad-hoc) và app mở chạy bình thường | Bình thường — `spctl --assess` là đánh giá riêng của Gatekeeper cho "đủ điều kiện phân phối công khai" (cần Developer ID + notarization), KHÁC với AMFI (cái thực sự quyết định app có CHẠY được hay không) | Không cần xử lý gì — cứ mở app bằng `open`/double-click là chạy được |

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

- **macOS — đã có cách chạy MIỄN PHÍ nhưng chỉ áp dụng từng máy 1**: ký ad-hoc mặc định bị AMFI từ
  chối thẳng (xem banner đầu file + mục [Ký số](#ký-số-code-signing)), nhưng ký lại bằng chứng chỉ
  "Apple Development" (Xcode + Apple ID thường, không tốn tiền) thì AMFI chấp nhận — đã xác nhận chạy
  ổn định trên máy test. Việc còn lại tuỳ mục tiêu:
  1. **Nếu chỉ cần chạy trên 1-2 máy cụ thể tự quản lý được** (vd máy cá nhân, máy công ty cố định):
     cách miễn phí ở mục Ký số là đủ — làm 1 lần/máy (hoặc export/import chứng chỉ sang máy khác theo
     [Cách A](#mở-trên-mac-khác-chưa-có-chứng-chỉ---khắc-phục-tạm-thời)), không cần đầu tư gì thêm.
  2. **Nếu cần 1 bản build chạy thẳng trên MỌI Mac tại venue mà không cấu hình gì trước** (use-case
     "cắm USB vào máy lạ"): bắt buộc cần **Apple Developer ID ($99/năm) + notarization thật sự** —
     đây là cách DUY NHẤT tạo ra 1 chữ ký mà mọi Mac đều tin sẵn (không cần cài thêm chứng chỉ trung
     gian hay Xcode trên từng máy), đồng thời AMFI lẫn Gatekeeper (`spctl`) đều chấp nhận ngay không
     cảnh báo. Cần viết lại đáng kể phần "Ký số"/`make-portable-zip.mjs` (bỏ bước tự ký ad-hoc, thêm
     bước ký bằng Developer ID + gọi Apple notary service).
  3. ~~`sudo spctl --add`~~ — đã thử, **KHÔNG còn dùng được**: macOS hiện tại trả về "This operation is
     no longer supported" (exit code 4) khi chạy lệnh này, coi như bị Apple khai tử. Loại khỏi danh
     sách lựa chọn.
  4. Test lại trên 1 Mac hoàn toàn khác (đời máy/macOS khác, KHÔNG dùng chung chứng chỉ với máy đã
     test) để xác nhận quy trình ở mục Ký số áp dụng được rộng rãi, không phải chỉ đúng trên máy test
     ban đầu — chưa làm.
- **Tuỳ nhu cầu**: code signing Windows (Developer ID) để hết cảnh báo SmartScreen — vẫn chỉ là cảnh
  báo, KHÔNG chặn chạy như macOS (đã test xác nhận Windows portable chạy được dù chưa ký).
- **Linux**: chưa có bản thư mục (`db.ts` luôn dùng `~/.config/lucky-draw-app/data/`).
  electron-builder đóng gói được `AppImage`/`deb` nếu cần, build trên Linux.

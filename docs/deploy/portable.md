# Portable — 1 thư mục mang theo cả app lẫn dữ liệu

> **Trạng thái**
> - **Windows**: đã implement và test (`…-win.zip`).
> - **macOS**: đã build + test trên Mac thật (MacBook Pro M-series, macOS 26.6.2, arm64, 2026-09-28).
>   Chữ ký **ad-hoc** mặc định bị AMFI **CHẶN HẲN** lúc chạy (không chỉ cảnh báo Gatekeeper), xem
>   [Ký số](#ký-số-code-signing). Chạy được **miễn phí** bằng cách ký lại bằng chứng chỉ "Apple
>   Development" (Xcode + Apple ID thường), nhưng **chỉ trên đúng máy có chứng chỉ đó**. Chạy thẳng trên
>   MỌI Mac vẫn cần Apple Developer ID + notarization ([mục 6](#6-việc-còn-lại)). Checklist chức năng
>   qua UI **chưa test** — mới xác nhận app khởi động và chạy ổn định
>   ([release.md → Test](./release.md#7-test-trước-khi-phát)).

Bản portable là **định dạng phân phối chính** của app. Bản cài đặt dành cho máy cố định:
[installer.md](./installer.md). Build, test, phát hành, xử lý lỗi: [release.md](./release.md).

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

Toàn bộ dữ liệu của 1 session nằm trong **đúng 1 file SQLite** (mỗi session 1 file trong `data/`), không
có file ảnh rời:

| Dữ liệu | Nằm ở đâu trong DB |
|---|---|
| Session (tab quay số) | bảng `sessions` |
| Participant | bảng `participants` (cột file import nằm trong `extra_data`) |
| Prize, kể cả ảnh giải | bảng `prizes` (`display_image`, base64) |
| Landing page: component, ảnh nền, ảnh PNG | `sessions.landing_config` (JSON, ảnh nhúng base64) |
| Kết quả quay | bảng `draw_results` |

Nên "mang dữ liệu theo app" chỉ là **đặt thư mục `data/` cạnh app**, và mang 1 session sang máy khác chỉ
là copy 1 file. Cơ chế lưu theo session, tên file, bản trùng:
[`docs/architecture/database-schema.md`](../architecture/database-schema.md#lưu-trữ-theo-session--mỗi-session-là-1-file).

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
| macOS App Translocation | `execPath` chứa `/AppTranslocation/` | Lệnh `xattr` gỡ cờ quarantine (xem [mục 3](#gatekeeper-app-translocation-macos)) |
| Chạy từ thư mục tạm (Windows: mở exe ngay trong zip chưa giải nén) | Thư mục app nằm dưới `os.tmpdir()` | "Extract All" rồi chạy từ thư mục đã giải nén |
| `data/` không ghi được | Ghi thử + xoá 1 file dò thất bại (đáng tin hơn `fs.accessSync` với USB/ổ mạng) | Chuyển thư mục sang chỗ ghi được; trên Mac nhắc USB NTFS là chỉ-đọc |

### Hành vi chung của bản đóng gói (`app.isPackaged`)

Áp dụng cho cả portable lẫn installer:

- **Chặn mở 2 app cùng lúc**: `app.requestSingleInstanceLock()` ở đầu `db.ts`, TRƯỚC khi mở DB (vì
  `main.ts` import `db.ts` trước mọi dòng code khác). Instance thứ 2 thoát ngay, cửa sổ đang chạy được
  đưa lên trước (`second-instance` trong `main.ts`). Không có 2 process cùng ghi 1 file DB.
- **Đóng mọi file session khi thoát** (`will-quit` trong `main.ts`). File session dùng
  `journal_mode = DELETE` nên ghi xong là đủ dữ liệu, không có file `-wal` đi kèm.
- **Đóng cửa sổ cuối cùng là thoát app**, trên cả macOS (`window-all-closed`). Mặc định trên Mac app
  vẫn chạy ngầm; bản đóng gói cố tình khác để DB được đóng ngay, người dùng tưởng đã tắt rồi rút USB
  cũng không hỏng dữ liệu. Bản dev trên Mac giữ hành vi mặc định.

### Đóng gói — `electron/make-portable-zip.mjs`

Bản portable **không dùng target có sẵn** của electron-builder: electron-builder chỉ xuất thư mục app
(`win-unpacked/`; target `dir` trên Mac), rồi script này tự nén. Chạy sau electron-builder trong
`npm run package`, trên đúng hệ điều hành đang build, không thêm dependency:

1. Tạm dời `data/` (nếu có, do chạy thử bản build) ra ngoài, để **dữ liệu test không lọt vào bản phân
   phối**.
2. Tạm đổi tên thư mục output của electron-builder thành `Lucky Draw Studio`, để zip **có sẵn thư mục
   mẹ**.
3. Nén (khác nhau theo hệ điều hành, xem [mục 3](#3-khác-biệt-windows--macos)).
4. LUÔN trả lại tên thư mục và `data/` như cũ, kể cả khi nén lỗi (electron-builder cần đúng tên cũ ở
   lần build sau).
5. Copy `assets/distribution/README.txt` (điền `{{version}}`, CRLF + BOM) ra `release/README.txt`.

## 3. Khác biệt Windows / macOS

| | Windows | macOS |
|---|---|---|
| File phân phối | `…-win.zip` (x64, ~120 MB) | `…-mac.zip` (universal: Mac chip M lẫn Intel, nặng hơn) |
| Thư mục output electron-builder | `release/win-unpacked/` | `release/mac-universal/` (target `dir`) |
| Công cụ nén | `System32\tar.exe` (bsdtar, có sẵn Windows 10/11) — gọi đích danh vì `tar` của Git Bash là GNU tar, không nén được zip | `ditto -c -k --keepParent` — giữ đúng symlink/metadata của `.app` bundle (zip thường làm hỏng bundle) |
| Ký số | Không ký — vẫn chạy được | Script ký **ad-hoc** trước khi nén, nhưng AMFI chặn ad-hoc → phải ký lại bằng chứng chỉ Apple Development trên từng máy (xem dưới) |
| `data/` nằm ở | Cạnh `Lucky Draw Studio.exe` | Cạnh `Lucky Draw Studio.app` (KHÔNG trong bundle) |
| Máy lạ chặn lần đầu | SmartScreen (cảnh báo, có "Run anyway") | AMFI (chặn hẳn, không có nút bypass) + Gatekeeper (xem dưới) |
| Chạy sai chỗ | Mở exe trong zip → chạy từ `%TEMP%` → báo lỗi | App Translocation → báo lỗi kèm lệnh sửa |
| USB | NTFS/exFAT đều được | **Phải exFAT** (hoặc APFS/Mac OS Extended). NTFS trên Mac là chỉ-đọc |
| Kéo riêng app vào Applications | — | Thành "bản cài đặt", dữ liệu chuyển sang `userData` ([installer.md](./installer.md)) |

### Cấu trúc thư mục

```
Windows                                   macOS
Lucky Draw Studio\                        Lucky Draw Studio/
├── Lucky Draw Studio.exe  ← chạy         ├── Lucky Draw Studio.app  ← chạy (Finder hiện như 1 file)
├── data\                                 └── data/
│   ├── Hoi-cho__3f9a1c2e.db                  └── <tên-session>__<mã>.db
│   └── Minigame__8b20d7aa.db
└── resources\ locales\ *.dll …  ← file của app, không động vào
```

1 file `.db` = 1 session (participant, prize, landing, lịch sử quay). Windows: chỉ copy riêng
`Lucky Draw Studio.exe` thì app không mở được (thiếu dll) — lỗi lộ ngay, không mất dữ liệu âm thầm.

### Ký số (code signing)

- **Windows**: không ký. SmartScreen lần đầu: "Windows protected your PC" → **More info → Run anyway**.
  Hết hẳn cảnh báo cần chứng chỉ code signing.
- **macOS**, cấu hình `package.json` → `build.mac`:
  - `target: dir`, `arch: universal`; `identity: null`: electron-builder KHÔNG ký bằng Developer ID
    (không cần tài khoản Apple Developer $99/năm).
  - Script nén tự **ký ad-hoc** toàn bộ bundle (`codesign --force --deep --sign -`, rồi
    `codesign --verify --deep --strict`). Ban đầu tưởng đủ vì: binary arm64 trên Mac chip M phải có MỘT
    chữ ký nào đó mới nạp được; và máy khác sẽ báo "chưa xác minh" (có nút mở) thay vì "is damaged".
    **Test thật cho thấy KHÔNG đủ** — xem ngay dưới.
  - `hardenedRuntime: false`: hardened runtime chỉ cần cho notarization; bật nó với chữ ký ad-hoc dễ làm
    app không nạp được native module `better_sqlite3.node`.

#### Ad-hoc bị AMFI chặn (đã xác nhận trên Mac thật, 2026-09-28)

App đã ký ad-hoc **không mở được, không có cửa sổ nào** — tự thoát trong 1-2s, không dialog, không crash
report. Không phải cảnh báo Gatekeeper rồi cho bấm tiếp. Unified log (`log show`) cho thấy `amfid` chặn
lúc khởi động:

```
amfid[...] '.../Lucky Draw Studio' not valid: Error Domain=AppleMobileFileIntegrityError Code=-423
"The file is adhoc signed or signed by an unknown certificate chain"
```

- `codesign --verify` báo "valid on disk" nhưng `spctl --assess --type execute` báo "rejected": 2 công cụ
  đánh giá KHÁC nhau — `--verify` chỉ kiểm tra chữ ký còn toàn vẹn, không kiểm tra macOS có CHẤP NHẬN
  chữ ký đó để chạy hay không.
- Máy test để Gatekeeper/SIP ở cấu hình mặc định, nên nhiều khả năng đây là hành vi chung của macOS hiện
  tại với ad-hoc, không phải lỗi riêng 1 máy.
- **"Open Anyway" trong System Settings KHÔNG giúp được**: đó là bypass cho Gatekeeper (quarantine), còn
  AMFI là lớp chặn riêng, thấp hơn, không có nút bypass.
- `sudo spctl --add` đã thử: macOS hiện tại báo "This operation is no longer supported" — không dùng được.

#### Cách chạy được miễn phí — ký bằng chứng chỉ "Apple Development" (từng máy)

Ký bằng chứng chỉ **Apple Development** (Xcode tự cấp miễn phí cho mọi Apple ID qua "Personal Team",
không cần $99/năm) thay ad-hoc thì AMFI **chấp nhận** — đã xác nhận app mở được, đủ tiến trình
main/renderer/GPU/network, chạy ổn định. **Giới hạn: chỉ có tác dụng trên máy có private key của chứng
chỉ đó** (nằm trong Keychain).

**Tạo chứng chỉ** (1 lần trên máy Mac muốn chạy app):

1. Cài **Xcode đầy đủ** từ Mac App Store (Command Line Tools không có UI tạo chứng chỉ).
2. Xcode → **Settings → Accounts** → **+** → đăng nhập Apple ID thường → Xcode tạo "Personal Team".
3. Chọn team đó → **Manage Certificates…** → **+** → **Apple Development** (bước 2 KHÔNG tự sinh chứng
   chỉ, phải làm bước này).
4. Kiểm tra: `security find-identity -v -p codesigning` phải ra 1 identity. Nếu ra **"0 valid identities
   found"**: máy thiếu chứng chỉ trung gian đúng thế hệ (`security verify-cert` báo
   `CSSMERR_TP_NOT_TRUSTED`; máy test cần **WWDR G3** nhưng chỉ có G2 đã hết hạn 07/02/2023). Tải
   **"Worldwide Developer Relations — G3"** (hoặc thế hệ lỗi báo) từ
   `https://www.apple.com/certificateauthority/`, double-click → Keychain Access → **Add**, kiểm tra lại.

**Ký lại `.app`** — thủ công **từ trong ra ngoài**, KHÔNG dùng `--deep`: `codesign --deep` với identity
thật báo `errSecInternalComponent` ở `Squirrel.framework` (symlink `Versions/Current -> A` làm `--deep` xử
lý sai thứ tự) và dừng giữa chừng, app vẫn còn chữ ký ad-hoc cũ.

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

codesign --verify --deep --strict "$APP"   # không in gì + exit code 0 là đạt
```

- macOS hỏi mật khẩu Keychain ở mỗi lệnh ("codesign wants to access key…") → bấm **Always Allow** ở lần
  đầu.
- Ký xong, `spctl --assess` **vẫn báo "rejected" — BÌNH THƯỜNG**: đó là đánh giá "đủ điều kiện phân phối
  công khai" của Gatekeeper (chỉ nhận Developer ID + notarization), khác AMFI (cái quyết định app có
  CHẠY được không). Cứ mở bằng `open`/double-click.

#### Mở trên Mac khác chưa có chứng chỉ

Bản `.zip` phân phối vẫn chỉ ký ad-hoc → mọi Mac chưa làm bước trên đều gặp lại nguyên lỗi AMFI. Phải
làm TRÊN CHÍNH máy muốn chạy, 1 trong 2 cách:

- **Cách A — mang chứng chỉ sang** (máy của mình/đồng nghiệp tin cậy, không cần Xcode):
  1. Máy gốc: Keychain Access → chứng chỉ "Apple Development: …" → chuột phải → **Export…** → file
     `.p12` (đặt mật khẩu).
  2. Export thêm "Apple Worldwide Developer Relations Certification Authority — G3" ra `.cer` (hoặc tải
     lại từ trang Apple trên máy mới).
  3. Copy 2 file sang máy mới → double-click từng file để nhập vào Keychain.
  4. Máy mới: `security find-identity -v -p codesigning` lấy SHA-1 (giống máy gốc), ký lại `.app` theo
     quy trình ở trên.

  Private key khi đó nằm trên ≥ 2 máy — chấp nhận được cho vài máy tự quản, không phải chuẩn bảo mật cho
  dùng lâu dài/nhiều máy.
- **Cách B — tạo chứng chỉ mới trên máy đó**: làm lại toàn bộ "Tạo chứng chỉ" (Apple ID nào cũng được) rồi
  ký lại bằng identity của máy đó. Chắc hơn, không chia sẻ private key.

Dù cách nào, nếu zip có cờ quarantine (AirDrop/tải về) có thể vẫn cần thêm bước Gatekeeper ở mục dưới —
độc lập với việc ký, làm sau khi ký xong. **Không thực tế cho máy venue lạ** — khi đó cần Developer ID +
notarization ([mục 6](#6-việc-còn-lại)).

### Gatekeeper, App Translocation (macOS)

Mục này nói về cờ quarantine, **độc lập** với lỗi AMFI ở trên: app phải được ký bằng chứng chỉ Apple
Development trước thì mới tới được bước này.

App tải về, AirDrop, hoặc giải nén từ zip tải về đều bị macOS gắn cờ **quarantine**. Hệ quả:

1. **Gatekeeper chặn lần mở đầu tiên.**
   - macOS 15 (Sequoia) trở lên: "Apple could not verify…" → **Done** → **System Settings → Privacy &
     Security** → **Open Anyway** cạnh tên app → xác nhận mật khẩu. Chuột phải → Open không còn bỏ qua
     được như macOS cũ.
   - macOS 14 trở xuống: chuột phải (Control-click) app → **Open** → **Open**.
2. **App Translocation**: app còn cờ quarantine bị macOS âm thầm chạy từ một bản sao chỉ-đọc ở đường
   dẫn ngẫu nhiên, nên không thấy `data/` thật. App phát hiện và báo lỗi kèm lệnh sửa.

**Cách chắc chắn nhất** (1 lần cho mỗi bản copy): Terminal, gõ `xattr -dr com.apple.quarantine ` (có
dấu cách cuối), kéo thư mục `Lucky Draw Studio` vào cửa sổ Terminal, Enter. Copy qua USB bằng Finder từ
máy build (file chưa từng bị gắn cờ) thường không bị hỏi gì.

## 4. Chuẩn bị dữ liệu

**Cách sạch nhất: chuẩn bị luôn bằng bản thư mục.**

1. Giải nén zip (Windows: chuột phải → **Extract All**; Mac: double-click trong Finder) ra máy mình hoặc
   thẳng lên USB.
2. Mở app, tạo session (tab) → mỗi session tự có 1 file trong `data/`.
3. Nhập participant, prize, dựng landing, quay thử nếu cần (**Reset session** trước khi mang đi).
4. Thoát app (Windows: đóng cửa sổ; Mac: đóng cửa sổ hoặc Cmd+Q). Không bắt buộc với dữ liệu — file luôn
   đủ sau mỗi lần ghi — nhưng nên thoát trước khi copy.
5. Copy nguyên thư mục lên USB (nếu chưa làm ở bước 1).

**Mang 1 session từ máy khác / bản dev / bản cài đặt**: copy đúng file session đó vào `data/` của bản thư
mục (nút **Data folder** ở góc phải thanh tab mở thư mục `data` của bản đang chạy) — tab tự hiện khi mở
app hoặc khi quay lại cửa sổ app. Bản dev/cài đặt dùng `%APPDATA%\lucky-draw-app\data\` (Windows) /
`~/Library/Application Support/lucky-draw-app/data/` (Mac). File session dùng chung được giữa 2 hệ điều
hành.

`release/win-unpacked/` (hay `release/mac-universal/`) chính là thư mục app, dùng thẳng được để test,
nhưng lần build sau sẽ ghi đè — đừng để dữ liệu thật ở đó.

## 5. Vận hành tại venue

- **Test trước ngày sự kiện (bắt buộc)**: mở từ đúng USB sẽ mang đi, trên máy khác nếu có, **tự mắt
  xác nhận** thấy đủ session/participant/prize/landing. Thiếu tab = file session không nằm đúng `data/`.
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

- **macOS — chạy được miễn phí nhưng từng máy một** (ad-hoc bị AMFI chặn, chứng chỉ Apple Development
  thì được, xem [Ký số](#ký-số-code-signing)). Việc tiếp theo tuỳ mục tiêu:
  1. **Chỉ 1-2 máy tự quản** (máy cá nhân, máy công ty cố định): cách miễn phí là đủ — làm 1 lần/máy,
     hoặc mang chứng chỉ sang theo [Cách A](#mở-trên-mac-khác-chưa-có-chứng-chỉ).
  2. **Chạy thẳng trên MỌI Mac tại venue, không cấu hình trước** ("cắm USB vào máy lạ"): bắt buộc
     **Apple Developer ID ($99/năm) + notarization** — cách DUY NHẤT để mọi Mac tin sẵn chữ ký, AMFI
     lẫn Gatekeeper chấp nhận ngay. Cần viết lại phần ký trong `make-portable-zip.mjs` (bỏ ký ad-hoc,
     ký bằng Developer ID + gọi Apple notary service).
  3. Test quy trình ký miễn phí trên 1 Mac hoàn toàn khác (đời máy/macOS khác, không dùng chung chứng
     chỉ) — chưa làm.
  4. Chạy hết checklist chức năng qua UI trên Mac ([release.md → Test](./release.md#7-test-trước-khi-phát)).
- **Tuỳ nhu cầu**: code signing Windows để hết cảnh báo SmartScreen — chỉ là cảnh báo, KHÔNG chặn chạy
  như macOS (đã xác nhận bản Windows chưa ký vẫn chạy).
- **Linux**: chưa có bản thư mục (`db.ts` luôn dùng `~/.config/lucky-draw-app/data/`).
  electron-builder đóng gói được `AppImage`/`deb` nếu cần, build trên Linux.

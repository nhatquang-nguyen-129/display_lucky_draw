# Portable App — 1 gói mang theo cả app lẫn dữ liệu (Windows & macOS)

> **Trạng thái: KẾ HOẠCH, CHƯA IMPLEMENT** (cả 2 nền tảng). Hiện tại bản đóng gói (Windows lẫn macOS,
> xem [other-platforms.md](./other-platforms.md) — macOS còn CHƯA có target build nào cấu hình sẵn
> trong `package.json`) vẫn lưu dữ liệu ở thư mục hồ sơ riêng của hệ điều hành
> (`%APPDATA%\Lucky Draw Studio\lucky-draw.db` trên Windows, `~/Library/Application Support/Lucky
> Draw Studio/lucky-draw.db` trên macOS — xem [`electron/db.ts`](../../electron/db.ts)), KHÔNG nằm
> cạnh file app — copy riêng app sang máy khác sẽ mở ra app TRỐNG. Tài liệu này mô tả mục tiêu và
> thiết kế đã chốt để implement sau, cho CẢ 2 nền tảng.

## Mục tiêu

Chuẩn bị xong mọi thứ ở nhà (participant, prize, landing page với đủ component/ảnh) → copy vào 1
USB/ổ ngoài → tới venue cắm vào máy Windows HOẶC Mac bất kỳ, chạy thẳng là có sẵn toàn bộ dữ liệu.
Không cài đặt, không cần quyền Admin/quyền root, không phải biết thư mục ẩn nào. Kết quả quay cũng ghi
ngược vào USB, cầm về là có đủ.

## Vì sao làm được dễ

Toàn bộ dữ liệu của app nằm trong **đúng 1 file SQLite** — không có file ảnh rời nào bên ngoài, và
không phụ thuộc hệ điều hành nào (đã grep toàn bộ `electron/*.ts`: không có chỗ nào khác ghi file ra
đĩa ngoài `db.ts`):

| Dữ liệu | Nằm ở đâu trong DB |
|---|---|
| Session (tab quay số) | bảng `sessions` |
| Participant | bảng `participants` (cột file import nằm trong `extra_data`) |
| Prize, kể cả ảnh giải | bảng `prizes` (`display_image` — base64) |
| Landing page: component, ảnh nền, ảnh PNG | `sessions.landing_config` (JSON, ảnh nhúng base64) |
| Kết quả quay | bảng `draw_results` |

Chi tiết schema: [`docs/architecture/database-schema.md`](../architecture/database-schema.md).

## Cấu trúc gói mang theo — khác nhau theo hệ điều hành

### Windows

```
USB:\LuckyDraw\
├── Lucky Draw Studio-<version>-portable.exe
└── lucky-draw.db          ← toàn bộ dữ liệu (tự tạo nếu chưa có)
```

### macOS

```
USB:/LuckyDraw/
├── Lucky Draw Studio.app/   ← CẢ THƯ MỤC (app bundle thật ra là 1 folder), kéo-thả NGUYÊN CỤM
└── lucky-draw.db
```

Khác biệt quan trọng: trên Windows, "app" là ĐÚNG 1 file `.exe`. Trên macOS, `.app` **là 1 thư mục**
(Finder chỉ HIỂN THỊ như 1 file duy nhất) — copy/kéo-thả phải lấy nguyên cụm `Lucky Draw Studio.app`,
không tách lẻ file bên trong `Contents/` ra khỏi bundle.

Lúc app đang chạy (cả 2 nền tảng) sẽ có thêm `lucky-draw.db-wal`/`lucky-draw.db-shm` cạnh
`lucky-draw.db` (file tạm của SQLite ở chế độ WAL, `db.pragma("journal_mode = WAL")` trong `db.ts`) —
bình thường, tự gộp vào `lucky-draw.db` khi tắt app hẳn.

## Thiết kế (để implement)

Ý tưởng chung: xác định app đang chạy ở "chế độ portable" hay không, nếu có thì trỏ đường dẫn DB tới
1 thư mục CẠNH app (thay vì thư mục hồ sơ hệ điều hành) — CHỈ đổi tại đúng 1 chỗ (`db.ts`), không đổi
schema, không cần migration (các hàm `migrate...()` trong `db.ts` vẫn tự chạy như bình thường trên
file `.db` copy từ máy khác sang).

**Bắt buộc chặn ngay từ đầu bằng `app.isPackaged`** — cả 2 nhánh dò-đường-dẫn bên dưới (Windows lẫn
macOS) đều CHỈ chạy khi app đã đóng gói thật sự, không chạy lúc `npm run electron:dev` (`app.isPackaged
=== false` lúc đó) — thiếu bước này, nhánh macOS (dò theo `process.execPath`) có thể vô tình khớp phải
1 thư mục nào đó BÊN TRONG `node_modules/electron/` (nơi Electron binary thật sự nằm lúc dev), tưởng
nhầm là "portable" dù không hề đóng gói gì cả.

### Windows — `PORTABLE_EXECUTABLE_DIR`

electron-builder tự đặt biến môi trường `PORTABLE_EXECUTABLE_DIR` (thư mục CHỨA file exe portable —
không phải thư mục app đang thật sự chạy TỪ đó) khi chạy bản portable. Bắt buộc phải dùng biến này chứ
KHÔNG tự suy từ `process.execPath`/`__dirname`, vì:

> File exe portable thực chất **tự giải nén ra 1 thư mục tạm** (`%TEMP%\...`) mỗi lần chạy — lúc app
> đang chạy, `process.execPath` trỏ vào thư mục tạm đó, KHÔNG phải vị trí file exe thật trên USB. App
> cũng **không ghi ngược được vào trong chính file exe** — đây cũng là lý do đã loại phương án "nhúng
> DB vào bên trong exe" (xem mục bên dưới).

`electron/db.ts` dùng `PORTABLE_EXECUTABLE_DIR` thay cho `app.getPath("userData")` khi biến này có
giá trị. Bản Setup (NSIS) và `npm run electron:dev` giữ nguyên `app.getPath("userData")` như cũ —
2 trường hợp này không có biến `PORTABLE_EXECUTABLE_DIR`.

### macOS — không có cơ chế build-in tương đương, phải tự dò + tự test quyền ghi

electron-builder KHÔNG cung cấp biến môi trường nào tương đương `PORTABLE_EXECUTABLE_DIR` cho macOS —
khái niệm "portable target" là đặc thù Windows/NSIS. Nhưng macOS có 1 lợi thế khác: `.app` bundle
**không tự giải nén ra thư mục tạm** như NSIS portable (chạy thẳng tại chỗ nó đang nằm), nên
`process.execPath` LUÔN đáng tin cậy — chỉ cần lùi lên đúng 4 cấp thư mục cha là ra thư mục CHỨA
bundle:

```
process.execPath thường có dạng:
  .../Lucky Draw Studio.app/Contents/MacOS/Lucky Draw Studio

path.dirname() × 4 lần:
  1) .../Lucky Draw Studio.app/Contents/MacOS
  2) .../Lucky Draw Studio.app/Contents
  3) .../Lucky Draw Studio.app
  4) ...                                        ← thư mục CHỨA bundle, dùng cho lucky-draw.db
```

Vấn đề còn lại: macOS không tự biết `.app` đang nằm ở USB (portable) hay đã được kéo vào
`/Applications` (cài đặt thông thường) — và **tự ghi BÊN TRONG chính bundle của mình là điều KHÔNG
NÊN làm** (dễ vỡ chữ ký số nếu sau này có ký app, và Gatekeeper có thể coi bundle đã bị chỉnh sửa).
Giải pháp: **test quyền ghi vào thư mục CHỨA bundle** (thư mục ở bước 4 trên, KHÔNG phải bên trong
bundle) — ghi thử 1 file dò đường rồi xoá ngay:

- Ghi thử thành công (USB, Desktop, thư mục do người dùng tự tạo...) → coi là "portable", dùng thư
  mục đó cho `lucky-draw.db`.
- Ghi thất bại (vd `/Applications` không có quyền ghi thường trực, tuỳ máy) → fallback về
  `app.getPath("userData")` như cũ.

`fs.accessSync(dir, fs.constants.W_OK)` chỉ kiểm tra bit quyền, có thể sai lệch với vài loại ổ đĩa
mount đặc biệt — ghi thử + xoá 1 file tạm đáng tin cậy hơn.

### Hàm dùng chung trong `db.ts` (kết hợp cả 2 nền tảng)

```ts
function resolveDbDir(): string {
  if (!app.isPackaged) return app.getPath("userData");

  if (process.platform === "win32" && process.env.PORTABLE_EXECUTABLE_DIR) {
    return process.env.PORTABLE_EXECUTABLE_DIR;
  }

  if (process.platform === "darwin") {
    const bundleParentDir = path.dirname(path.dirname(path.dirname(path.dirname(process.execPath))));
    if (canWrite(bundleParentDir)) return bundleParentDir;
  }

  return app.getPath("userData");
}
```

(`canWrite()` = thử ghi + xoá 1 file tạm, bắt `try/catch` — xem mục macOS ở trên.)

### Vì sao KHÔNG nhúng DB vào bên trong app (cả 2 nền tảng)

Đã cân nhắc phương án "1 gói duy nhất, DB nhúng sẵn bên trong" (qua `extraResources`) và loại bỏ:

- Windows: file exe portable tự giải nén ra thư mục tạm mỗi lần chạy — app không ghi ngược được vào
  trong exe. Kết quả quay sẽ nằm ở `%APPDATA%` của máy venue, không theo USB về.
- macOS: ghi vào bên trong `.app` bundle làm hỏng cấu trúc bundle đã đóng gói (và invalidate chữ ký số
  nếu sau này có ký app) — về nguyên tắc macOS không khuyến khích app tự sửa nội dung bundle của chính
  nó lúc runtime.
- Cả 2: dữ liệu bị "đóng băng" lúc build — sửa 1 participant hay 1 component cũng phải build lại.

Để 2 thứ (app + db) CẠNH NHAU trong cùng 1 thư mục trên USB vẫn đúng tinh thần "cầm 1 USB là xong", mà
dữ liệu sửa/đọc/ghi thẳng được.

## electron-builder config cần thêm cho macOS

`package.json`'s `build` hiện CHỈ có khối `win` — chưa có `mac` nào cả. Cần thêm:

```json
"mac": {
  "target": [{ "target": "zip", "arch": ["universal"] }]
}
```

- **`target: "zip"`** thay vì `"dmg"` — `dmg` là 1 kiểu "installer nhẹ" (mount ổ ảo → kéo vào
  Applications), thêm 1 bước thao tác không cần thiết cho use-case "portable, chạy thẳng từ USB". Giải
  nén file `.zip` 1 lần trên máy chuẩn bị, được thư mục chứa `Lucky Draw Studio.app` — copy cả bundle
  đó + `lucky-draw.db` lên USB.
- **`arch: ["universal"]`** — build 1 bundle DUY NHẤT chạy được cả Mac Intel (x64) lẫn Apple Silicon
  (arm64), thay vì phải build/phân phối riêng 2 file theo từng loại CPU. Đổi lại: file to hơn (gộp cả
  2 kiến trúc) và cần Xcode Command Line Tools (`lipo`) có sẵn trên máy build để gộp — electron-builder
  tự lo phần này, chỉ cần đã cài Xcode Command Line Tools bình thường (`xcode-select --install`).
  `better-sqlite3` (native module) cũng cần biên dịch được cho cả 2 kiến trúc — electron-builder tự
  rebuild lại đúng bản Electron dùng để đóng gói (giống cách đã làm cho Windows, xem
  [build.md](./build.md)), nhưng universal build cho native module đôi khi cần thử build 1 lần thật để
  chắc chắn không gặp lỗi gộp kiến trúc trước khi tin tưởng hoàn toàn.
- Build TRÊN ĐÚNG hệ điều hành đích (`docs/deploy/README.md` mục Prerequisites) — muốn ra bản macOS
  phải build TRÊN MÁY MAC, không cross-build từ Windows/Linux.

## Cơ chế runtime — vì sao "có sẵn dữ liệu hay không" chỉ phụ thuộc ĐÚNG 1 điều

`new Database(dbPath)` (better-sqlite3) không có khái niệm "import/restore" nào cả — chỉ đơn giản:

- File tại `dbPath` **đã tồn tại** (có data thật) → MỞ nguyên file đó, participant/prize/landing đã
  có sẵn ngay, không cần làm gì thêm.
- File tại `dbPath` **chưa tồn tại** → tự tạo 1 file RỖNG mới, các hàm `migrate...()` chỉ tạo bảng
  trống — app y hệt lần đầu mở, phải nhập lại từ đầu.

Vậy toàn bộ câu hỏi "mang qua máy mới có sẵn dữ liệu không" quy về ĐÚNG 1 điều: **lúc app khởi động
lần đầu ở máy đó, file `lucky-draw.db` đã nằm SẴN trong đúng thư mục mà `resolveDbDir()` trỏ tới
chưa**. Không có bước nào khác quyết định việc này.

## Quy trình chuẩn bị (sau khi implement)

### Cách SẠCH nhất — chuẩn bị luôn bằng chính bản portable, ngay từ đầu (khuyến nghị)

1. Copy app portable (file `.exe` ở Windows, hoặc nguyên cụm thư mục `.app` ở macOS) vào ĐÚNG 1 thư
   mục — có thể là 1 thư mục trên máy mình trước, hoặc thẳng lên USB luôn cũng được.
2. Mở app TỪ ĐÚNG thư mục đó (không phải bản cài đặt/dev) — `lucky-draw.db` sẽ tự sinh ra NGAY CẠNH
   app, trong chính thư mục đó (vì `PORTABLE_EXECUTABLE_DIR`/logic dò `.app` bundle trỏ đúng vào đây).
3. Nhập participant, prize, dựng landing page, test quay thử nếu cần (Reset session trước khi mang đi
   để không lẫn kết quả thử) — mọi thứ ghi THẲNG vào file `lucky-draw.db` đó, không ghi vào thư mục hồ
   sơ hệ điều hành nữa.
4. **Tắt hẳn app** — bắt buộc, để SQLite gộp hết dữ liệu từ `-wal` vào đúng file `lucky-draw.db`. Tắt
   app lúc còn đang chạy rồi mới copy có thể mất phần dữ liệu mới nhất.
5. Thư mục đó giờ đã là 1 gói TRỌN VẸN (app + db đầy đủ dữ liệu) — copy/kéo cả thư mục sang USB nếu
   chưa làm ở bước 1, hoặc không cần làm gì thêm nếu đã chuẩn bị thẳng trên USB.

### Nếu đã có dữ liệu từ TRƯỚC bằng bản dev/Setup (không phải portable)

Cần thêm ĐÚNG 1 bước thủ công 1 lần: build app portable (`npm run package` trên đúng hệ điều hành
đích — Windows: file `…-portable.exe`; macOS: giải nén `…-mac.zip`, lấy thư mục chứa
`Lucky Draw Studio.app`) → đặt vào 1 thư mục → lấy file `lucky-draw.db` đang nằm ở thư mục hồ sơ hệ
điều hành (`%APPDATA%\Lucky Draw Studio\` trên Windows, `~/Library/Application Support/Lucky Draw
Studio/` trên macOS) → copy đè vào CẠNH app portable đó. Sau bước copy 1 lần này, mọi thứ y hệt cách
"Sạch nhất" ở trên — từ lần chạy kế tiếp trở đi luôn đọc đúng file vừa copy.

### Test trước ngày sự kiện (bắt buộc, cho cả 2 cách trên)

Test lại trên 1 máy khác (đúng hệ điều hành sẽ dùng ở venue) trước ngày sự kiện: mở từ USB, **tự mắt
xác nhận** thấy đủ session/participant/prize/landing hiện ra — không chỉ tin là "chắc đã copy đúng".

**Bẫy dễ mắc nhất**: nếu quên copy `lucky-draw.db` theo, hoặc chỉ copy app mà bỏ sót file db, app
KHÔNG báo lỗi gì cả — nó chỉ lặng lẽ tạo 1 file db rỗng mới ngay tại đó, nhìn y hệt "bị mất dữ liệu"
dù thực ra chưa từng có file nào ở đó để mất. Bước test tự mắt kiểm tra ở trên chính là để bắt được
lỗi này TRƯỚC ngày sự kiện, không phải phát hiện ra tại venue.

**Gợi ý cải thiện thêm (chưa quyết định làm hay không)**: lúc implement, có thể thêm 1 cảnh báo trong
app — phát hiện đang chạy ở chế độ portable VÀ database vừa tạo mới/đang rỗng (0 session) → hiện popup
kiểu "Database này đang trống — bạn có chắc đây đúng là USB/thư mục đã chuẩn bị dữ liệu không?" để bắt
đúng cái bẫy trên ngay từ trong app, không phải tự nhớ test bằng tay.

## Lưu ý khi vận hành tại venue

- **USB phải cho phép ghi** — app ghi kết quả quay và cấu hình vào `lucky-draw.db`. Không để thư mục
  trên ổ chỉ-đọc (CD, ổ mạng read-only, USB có khoá write-protect).
- **Không rút USB khi app đang chạy** — có thể hỏng file DB. Tắt app trước, rồi mới rút.
- **Luôn giữ 1 bản sao `lucky-draw.db`** ở nơi khác (máy mình/cloud) trước khi đi — USB hỏng/mất là
  mất cả dữ liệu lẫn kết quả.
- **Chỉ mở 1 cửa sổ app** từ cùng 1 thư mục USB tại 1 thời điểm — **lưu ý: app hiện CHƯA có
  `requestSingleInstanceLock()`** (đã kiểm tra `electron/main.ts`, không có), nên double-click nhầm
  file/app 2 lần sẽ mở 2 process độc lập cùng ghi vào 1 file DB — không có gì chặn kỹ thuật, chỉ là
  lưu ý vận hành. Nên cân nhắc thêm lock này (việc riêng, không phụ thuộc portable-app) trước khi tin
  tưởng hoàn toàn vào quy trình này cho sự kiện thật.
- USB chậm (USB 2.0 cũ) có thể làm app mở chậm hơn chạy từ ổ cứng — nên test trước với đúng USB sẽ
  mang đi.
- **Cảnh báo lần đầu mở trên máy lạ (app chưa ký số/notarize)**:
  - Windows: SmartScreen "Windows protected your PC" — bấm **More info → Run anyway** (xem
    [release-checklist.md](./release-checklist.md)).
  - macOS: Gatekeeper chặn "cannot be opened because the developer cannot be verified" — lần ĐẦU
    TIÊN phải **chuột phải (Control-click) vào app → Open** (không double-click bình thường), xác
    nhận thêm 1 lần nữa trong hộp thoại hiện ra; hoặc vào System Settings → Privacy & Security → bấm
    "Open Anyway" cạnh tên app. Từ lần thứ 2 trở đi mở bình thường được. Đây là hành vi BÌNH THƯỜNG
    với app chưa qua Apple notarization, không phải app lỗi.
- **Chromium profile (không phải dữ liệu app) vẫn nằm ở máy venue, không theo USB**: `app.getPath
  ("userData")` không chỉ chứa `lucky-draw.db` — Chromium (nền tảng của Electron) còn tự ghi Local
  Storage/Cache/Cookies vào cùng thư mục đó. `src/context/SessionContext.tsx` dùng `localStorage` để
  nhớ tab cuối cùng mở — cái này KHÔNG theo USB (chỉ đổi mỗi path của riêng `lucky-draw.db`, không đổi
  toàn bộ `userData`) nên mở lại ở máy khác sẽ không nhớ đúng tab cũ (vô hại, chỉ là 1 tiện ích UI nhỏ,
  không mất dữ liệu thật) — và máy venue sẽ còn sót lại vài file cache/profile nhỏ của Chromium sau khi
  dùng xong (không chứa dữ liệu participant/prize thật, nhưng nếu cần "dọn sạch dấu vết" trên máy mượn
  thì phải tự xoá thư mục `userData` đó thủ công, app không tự làm).

## Sau sự kiện

Tắt app → cầm USB về. `lucky-draw.db` trên USB đã có đầy đủ kết quả quay (`draw_results`) — mở bằng
chính app (bản portable trên USB, hoặc copy file vào đúng thư mục hồ sơ hệ điều hành để xem bằng bản
dev/Setup) để xem lại/xuất kết quả.

# Portable App — 1 thư mục mang theo cả app lẫn dữ liệu

> **Trạng thái**: Windows **ĐÃ IMPLEMENT** (bản thư mục, build ra file `…-win.zip`). macOS **CHƯA
> implement** — thiết kế ở mục [macOS (kế hoạch)](#macos-kế-hoạch-chưa-implement).

## Mục tiêu

Chuẩn bị xong mọi thứ ở nhà (participant, prize, landing page với đủ component/ảnh) → copy NGUYÊN 1
thư mục vào USB/ổ ngoài → tới venue chạy thẳng là có sẵn toàn bộ dữ liệu. Không cài đặt, không cần
quyền Admin. Kết quả quay cũng ghi ngược vào thư mục đó, cầm về là có đủ.

## Cấu trúc thư mục (Windows)

```
Lucky Draw Studio\               ← thư mục mẹ có sẵn trong Lucky Draw Studio-<version>-win.zip
├── Lucky Draw Studio.exe        ← double-click để chạy
├── data\
│   └── lucky-draw.db            ← TOÀN BỘ dữ liệu (tự tạo lần chạy đầu nếu chưa có)
├── resources\ locales\ *.dll …  ← file của app, không động vào
```

**Quy tắc duy nhất cho người dùng: luôn copy NGUYÊN thư mục, không tách file ra.** Chỉ copy riêng
`Lucky Draw Studio.exe` thì app không mở được (thiếu dll) — lỗi lộ ngay, không mất dữ liệu âm thầm.

Lúc app đang chạy có thêm `lucky-draw.db-wal`/`-shm` trong `data\` (SQLite chế độ WAL) — bình thường,
tự gộp vào `lucky-draw.db` khi tắt app (main.ts đóng DB ở `will-quit`).

Toàn bộ dữ liệu app nằm trong **đúng 1 file SQLite** — không có file ảnh rời:

| Dữ liệu | Nằm ở đâu trong DB |
|---|---|
| Session (tab quay số) | bảng `sessions` |
| Participant | bảng `participants` (cột file import nằm trong `extra_data`) |
| Prize, kể cả ảnh giải | bảng `prizes` (`display_image` — base64) |
| Landing page: component, ảnh nền, ảnh PNG | `sessions.landing_config` (JSON, ảnh nhúng base64) |
| Kết quả quay | bảng `draw_results` |

Chi tiết schema: [`docs/architecture/database-schema.md`](../architecture/database-schema.md).

## Vì sao là "thư mục", không phải 1 file `.exe` portable

Đã từng build target `portable` (1 file `.exe`) và loại bỏ vì target này **tự giải nén toàn bộ app
(~300 MB) ra `%TEMP%` mỗi lần chạy và XOÁ thư mục đó khi tắt** (`templates/nsis/portable.nsi` của
electron-builder: `RMDir /r $INSTDIR`). Hệ quả:

- Không thể để DB "bên trong exe" — mọi thứ ghi trong lúc chạy (kết quả quay, sửa participant) mất
  khi tắt app. Với app quay số, mất `draw_results` = người đã trúng có thể trúng lại.
- Phương án "exe mang sẵn DB mẫu, lần đầu chạy copy ra cạnh exe" có bẫy nguy hiểm: xoá/quên copy file
  db thì app lặng lẽ lấy lại bản mẫu — trông vẫn đủ participant/prize nhưng mất danh sách người đã trúng.
- Mở chậm (giải nén 300 MB mỗi lần, ~5s trên SSD, lâu hơn nhiều từ USB), cần chỗ trống ổ C:.

Bản thư mục chạy thẳng tại chỗ, DB chỉ có đúng 1 bản duy nhất, sửa dữ liệu không cần build lại (chỉ
cần thay file `data\lucky-draw.db`).

## Cơ chế trong code (`electron/db.ts`)

`resolveDbDir()` chọn thư mục chứa `lucky-draw.db`:

| Trường hợp | Nhận biết | Thư mục DB |
|---|---|---|
| Dev (`npm run electron:dev`) | `!app.isPackaged` | `userData` = `%APPDATA%\lucky-draw-app\` (không đổi) |
| Bản Setup (NSIS) | Có `Uninstall *.exe` cạnh exe | `userData` (không đổi — `Program Files` không ghi được) |
| File exe portable (nếu build lại target cũ) | Có biến `PORTABLE_EXECUTABLE_DIR` | `userData` |
| macOS | `process.platform !== "win32"` | `userData` (chưa implement) |
| **Bản thư mục** | Còn lại | **`<thư mục chứa exe>\data\`** |

Bản thư mục còn 2 lớp chặn — hiện hộp thoại lỗi rồi **thoát**, KHÔNG âm thầm fallback về `userData`
(fallback sẽ làm người dùng tưởng dữ liệu vẫn nằm trong thư mục app):

- **Chạy từ thư mục tạm** (exe nằm dưới `os.tmpdir()`): thường do mở exe ngay trong file `.zip` chưa
  giải nén — Windows tự bung ra `%TEMP%`, dữ liệu sẽ mất. Hộp thoại hướng dẫn "Extract All".
- **`data\` không ghi được** (ổ chỉ-đọc, USB khoá write-protect, thư mục không có quyền): ghi thử + xoá
  1 file dò (đáng tin hơn `fs.accessSync` với USB/ổ mạng).

Ngoài ra (chỉ bản đóng gói, dev giữ nguyên):

- **Single-instance lock** (`app.requestSingleInstanceLock()` ở đầu `db.ts`, TRƯỚC khi mở DB): mở app
  lần 2 thì instance mới thoát ngay, cửa sổ đang chạy được đưa lên trước (`second-instance` trong
  `main.ts`) — không có 2 process cùng ghi 1 file DB.
- **Đóng DB khi thoát** (`will-quit` trong `main.ts`) để `-wal` gộp hết vào `lucky-draw.db`.

## Quy trình chuẩn bị

### Cách sạch nhất — chuẩn bị luôn bằng bản thư mục

1. `npm run package` → lấy `release/Lucky Draw Studio-<version>-win.zip`, **giải nén** vào 1 thư mục
   (trên máy mình hoặc thẳng lên USB).
2. Chạy `Lucky Draw Studio.exe` trong thư mục đó → `data\lucky-draw.db` tự sinh ra.
3. Nhập participant, prize, dựng landing, quay thử nếu cần (**Reset session** trước khi mang đi).
4. **Tắt hẳn app** để dữ liệu gộp hết vào `lucky-draw.db`.
5. Copy nguyên thư mục lên USB (nếu chưa làm ở bước 1).

File zip có sẵn thư mục mẹ `Lucky Draw Studio\` bên trong — "Extract All"/"Extract Here" đều ra
đúng 1 thư mục, không bung file lẻ. Zip do `electron/make-portable-zip.mjs` tạo (target `zip` của
electron-builder không có tuỳ chọn thư mục mẹ), nén từ `release/win-unpacked/` và **bỏ qua
`data\`** nếu có — dữ liệu lúc chạy thử `win-unpacked` không lọt vào bản phân phối.

`release/win-unpacked/` chính là thư mục app y hệt nội dung file zip — dùng thẳng được, nhưng lần
`npm run package` sau sẽ ghi đè, nên đừng để dữ liệu thật ở đó.

### Nếu đã có dữ liệu từ trước bằng bản dev/Setup

1. **Tắt hẳn** app dev/Setup.
2. Vào `%APPDATA%\lucky-draw-app\` (gõ vào thanh địa chỉ Explorer), copy `lucky-draw.db` — **kèm cả
   `lucky-draw.db-wal` nếu có** (bản dev không đóng DB khi thoát, phần dữ liệu mới nhất có thể còn
   nằm trong file `-wal`; copy thiếu sẽ mất dữ liệu đó).
3. Dán vào `data\` của bản thư mục (tạo thư mục `data` nếu chưa có). Mở app 1 lần rồi tắt — `-wal`
   được gộp vào `lucky-draw.db`.

### Test trước ngày sự kiện (bắt buộc)

Mở từ đúng USB sẽ mang đi, trên 1 máy khác nếu có: **tự mắt xác nhận** thấy đủ
session/participant/prize/landing. Nếu thấy app trống → `data\lucky-draw.db` không nằm đúng chỗ (app
tạo 1 file rỗng mới, không báo lỗi).

## Lưu ý khi vận hành tại venue

- **Không rút USB khi app đang chạy** — có thể hỏng file DB. Tắt app trước, rồi mới rút.
- **Luôn giữ 1 bản sao `data\lucky-draw.db`** ở nơi khác trước khi đi — USB hỏng/mất là mất cả dữ
  liệu lẫn kết quả.
- USB chậm (USB 2.0 cũ) có thể làm app mở chậm hơn — test trước với đúng USB sẽ mang đi.
- **SmartScreen** lần đầu mở trên máy lạ (app chưa ký số): bấm **More info → Run anyway** (xem
  [release-checklist.md](./release-checklist.md)).
- **Chromium profile vẫn nằm ở máy venue**: chỉ `lucky-draw.db` được chuyển vào `data\` — Local
  Storage/Cache của Chromium vẫn ghi vào `%APPDATA%\lucky-draw-app\` của máy đang chạy. Hệ quả: app
  không nhớ tab mở cuối cùng khi sang máy khác (`localStorage` ở `SessionContext.tsx` — vô hại), và
  máy venue còn sót vài file cache nhỏ (không chứa participant/prize) — muốn dọn sạch thì tự xoá thư
  mục đó.
- **Máy chạy cả bản dev lẫn bản thư mục**: 2 bản dùng chung thư mục Chromium profile nói trên nhưng
  KHÁC file DB (dev: `%APPDATA%\lucky-draw-app\lucky-draw.db`, bản thư mục: `data\lucky-draw.db`).

## Sau sự kiện

Tắt app → cầm USB về. `data\lucky-draw.db` đã có đủ kết quả quay (`draw_results`) — mở bằng chính
bản thư mục đó để xem lại/xuất kết quả.

## macOS (kế hoạch, chưa implement)

`resolveDbDir()` hiện luôn trả `userData` trên macOS
(`~/Library/Application Support/lucky-draw-app/`). Thiết kế đã chốt để làm sau:

- `.app` bundle chạy thẳng tại chỗ (không giải nén ra thư mục tạm), nên thư mục CHỨA bundle =
  `path.dirname()` × 4 lần từ `process.execPath` (`…/Lucky Draw Studio.app/Contents/MacOS/Lucky Draw
  Studio` → `…/`).
- KHÔNG ghi vào bên trong bundle (vỡ chữ ký số, Gatekeeper coi bundle bị sửa) — ghi vào thư mục CHỨA
  bundle, test quyền ghi bằng file dò giống Windows; không ghi được (vd `/Applications`) → `userData`.
- Cấu trúc: `LuckyDraw/Lucky Draw Studio.app/` (bundle là 1 thư mục, kéo-thả nguyên cụm) + `data/`.
- Config cần thêm vào `package.json`'s `build`, build TRÊN MÁY MAC:

  ```json
  "mac": {
    "target": [{ "target": "zip", "arch": ["universal"] }]
  }
  ```

  `zip` thay vì `dmg` (không cần bước mount/kéo vào Applications); `universal` = 1 bundle chạy cả Intel
  lẫn Apple Silicon (cần Xcode Command Line Tools; native module `better-sqlite3` nên build thử 1 lần
  thật trước khi tin tưởng).
- Gatekeeper lần đầu (app chưa notarize): chuột phải vào app → **Open**, hoặc System Settings →
  Privacy & Security → **Open Anyway**.

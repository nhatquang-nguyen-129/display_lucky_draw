# Installer — cài app vào máy, dữ liệu gắn với máy

> **Trạng thái**
> - **Windows**: `…-Setup.exe` (NSIS) build được cùng lúc với bản portable. **Chưa chạy thử cài đặt**
>   trên máy thật.
> - **macOS**: không có file cài đặt riêng. "Cài đặt" = kéo `Lucky Draw Studio.app` từ bản portable
>   vào Applications. Chờ test trên Mac cùng bản portable.

Định dạng phân phối chính là bản portable ([portable.md](./portable.md)). Installer chỉ dành cho máy
cố định dùng lâu dài. Build, test, phát hành, xử lý lỗi: [release.md](./release.md).

## 1. Triết lý thiết kế

### Khi nào dùng Installer

| | Portable | Installer |
|---|---|---|
| Phù hợp | Máy mượn/thuê tại venue, cầm USB đi, không rõ quyền Admin | Máy cố định của mình, dùng lại nhiều lần |
| Dữ liệu nằm ở | `data/` TRONG thư mục app, đi theo app | Thư mục hồ sơ người dùng của hệ điều hành, **gắn với máy**, tách khỏi app |
| Mang sang máy khác | Copy thư mục là đủ | Phải cài lại, và tự copy file session |
| Có trong Start Menu/Launchpad | Không | Có |
| Gỡ bỏ | Xoá thư mục | Gỡ cài đặt (dữ liệu vẫn giữ lại) |

### Nguyên tắc

1. **Dữ liệu tách khỏi app.** App nằm ở thư mục cài đặt, dữ liệu nằm trong `userData` của người dùng.
   Cài lại, cập nhật lên bản mới, hay gỡ cài đặt đều **không đụng tới dữ liệu**.
2. **Dữ liệu ở đúng chỗ bản dev đang dùng** (`<userData>/data/`, `userData` = `…/lucky-draw-app/`),
   không thêm vị trí thứ ba. Hệ quả: trên máy dev, bản cài đặt và bản dev **dùng CHUNG các file
   session**. Mỗi session là 1 file, cách lưu y hệt bản portable — xem
   [`docs/architecture/database-schema.md`](../architecture/database-schema.md#lưu-trữ-theo-session--mỗi-session-là-1-file).
3. **Không cần quyền Admin theo mặc định** (Windows cài cho riêng người dùng hiện tại).
4. Hành vi lúc chạy giống hệt bản portable: chặn mở 2 app, đóng DB khi thoát, đóng cửa sổ cuối là
   thoát (cả trên Mac). Xem [portable.md](./portable.md#hành-vi-chung-của-bản-đóng-gói-appispackaged).

## 2. Thực thi kỹ thuật

### Nhận biết "đang chạy bản cài đặt" — `electron/db.ts`

`folderBuildBaseDir()` trả `null` (tức dùng `<userData>/data/`) khi:

| Hệ điều hành | Nhận biết |
|---|---|
| Windows | Thư mục chứa exe có file `Uninstall *.exe`. NSIS luôn ghi uninstaller `Uninstall ${productName}.exe` vào thư mục cài (`templates/nsis/common.nsh`); bản portable không bao giờ có file này |
| macOS | Thư mục chứa `.app` là `/Applications` hoặc `~/Applications` |

Bảng đầy đủ mọi trường hợp: [portable.md](./portable.md#chọn-thư-mục-data--electrondbts).

### Vì sao thư mục dữ liệu tên `lucky-draw-app`, không phải `Lucky Draw Studio`

`userData` của Electron lấy theo tên app lúc được đọc lần đầu. `db.ts` đọc nó ngay khi main process
nạp module, TRƯỚC `app.setName("Lucky Draw Studio")` trong `main.ts`, và `package.json` không có
`productName` ở cấp gốc, nên tên là `name` = `lucky-draw-app`. Đổi tên thư mục này sẽ làm người dùng
cũ "mất" dữ liệu (app đọc thư mục `data/` rỗng ở chỗ mới), nên nếu muốn đổi phải kèm migration copy các
file session cũ sang.

### `appId` — đừng đổi sau khi đã phát Setup.exe

`package.json` → `build.appId` (hiện là giá trị mẫu `com.yourcompany.luckydraw`) được NSIS dùng để nhận
ra bản đã cài. Đổi `appId` sau khi người dùng đã cài thì bản Setup mới bị coi là app khác: không cài đè,
ra 2 mục trong Settings → Apps. Muốn đổi thì đổi trước lần phát Setup.exe đầu tiên. (Không ảnh hưởng
thư mục dữ liệu — xem mục trên.)

### Cấu hình NSIS (`package.json` → `build.nsis`)

```json
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "artifactName": "${productName}-${version}-Setup.exe"
}
```

- `oneClick: false`: trình cài đặt có giao diện từng bước, không cài âm thầm 1-click, người dùng biết
  rõ đang cài gì vào đâu.
- `perMachine` không đặt (mặc định `false`): có màn hình chọn **Only for me** (mặc định) hoặc
  **Anyone who uses this computer**.
- `allowToChangeInstallationDirectory: true`: có màn hình chọn thư mục cài.
- `createDesktopShortcut: true`: tạo shortcut ngoài Desktop, ngoài Start Menu.
- Không bật `deleteAppDataOnUninstall`: gỡ cài đặt KHÔNG xoá dữ liệu.

## 3. Khác biệt Windows / macOS

| | Windows | macOS |
|---|---|---|
| File phân phối | `…-Setup.exe` (NSIS, x64, ~85 MB) | Không có file riêng — dùng `…-mac.zip` của bản portable |
| Cách cài | Chạy Setup.exe, trình cài đặt từng bước | Kéo riêng `Lucky Draw Studio.app` vào Applications |
| App nằm ở | `%LOCALAPPDATA%\Programs\Lucky Draw Studio` (Only for me) hoặc `C:\Program Files\Lucky Draw Studio` (Anyone) | `/Applications` hoặc `~/Applications` |
| Nhận biết là bản cài đặt | Có `Uninstall *.exe` cạnh exe | Thư mục chứa `.app` là Applications |
| Cần Admin | Chỉ khi chọn "Anyone who uses this computer" | Tuỳ quyền ghi vào `/Applications` |
| Dữ liệu | `%APPDATA%\lucky-draw-app\data\` | `~/Library/Application Support/lucky-draw-app/data/` |
| Mở app | Start Menu, shortcut Desktop | Launchpad, Applications |
| Cảnh báo lần đầu | SmartScreen: **More info → Run anyway** | AMFI chặn hẳn chữ ký ad-hoc → ký lại bằng Apple Development; sau đó Gatekeeper như bản portable ([portable.md](./portable.md#gatekeeper-app-translocation-macos)) |
| Cập nhật | Chạy Setup bản mới, cài đè | Kéo `.app` bản mới vào Applications → **Replace** |
| Gỡ | Settings → Apps → Lucky Draw Studio → Uninstall | Kéo app từ Applications vào Trash |

Chung cả 2: dữ liệu **mỗi user hệ điều hành một bản riêng**, mỗi session 1 file `<tên>__<mã>.db`. Nút
**Open** ở góc phải thanh tab mặc định mở ngay thư mục này (chọn file để nạp session, hoặc chỉ để xem
có gì trong đó). Cập nhật hay gỡ đều **giữ nguyên dữ liệu**; muốn dọn
sạch thì tự xoá thư mục `lucky-draw-app` (mất toàn bộ dữ liệu, không hoàn tác được).

### Windows — các bước cài

1. Chạy `Lucky Draw Studio-<version>-Setup.exe`. SmartScreen lần đầu (app chưa ký số): **More info →
   Run anyway**.
2. Chọn chế độ cài:

   | Lựa chọn | Thư mục cài mặc định | Cần Admin |
   |---|---|---|
   | **Only for me** (mặc định) | `%LOCALAPPDATA%\Programs\Lucky Draw Studio` | Không |
   | Anyone who uses this computer | `C:\Program Files\Lucky Draw Studio` | Có |

3. Chọn thư mục cài (hoặc giữ mặc định) → Install → Finish.
4. Mở app từ Start Menu hoặc shortcut ngoài Desktop.

Dù cài ở chế độ nào, dữ liệu vẫn ở `%APPDATA%\lucky-draw-app\data\` của user đang chạy app.

### macOS — các bước cài

Không build `.dmg`: `.dmg` chỉ là 1 ổ đĩa ảo để người dùng kéo app vào Applications, cho ra kết quả y hệt
cách dưới mà thêm 1 bước build/phân phối. Có thể thêm target `dmg` sau nếu cần.

1. Giải nén `Lucky Draw Studio-<version>-mac.zip` (bản portable).
2. Kéo **riêng** `Lucky Draw Studio.app` (không kéo cả thư mục) vào **Applications**.
3. Mở từ Launchpad/Applications. Lần đầu trên Mac không phải máy build: Gatekeeper.

`.app` này vẫn là bản ký ad-hoc của bản portable, nên cũng bị **AMFI chặn** y hệt — phải ký lại bằng
chứng chỉ Apple Development trên chính máy đó trước (xem
[portable.md → Ký số](./portable.md#cách-chạy-được-miễn-phí--ký-bằng-chứng-chỉ-apple-development-từng-máy)).

App trong Applications KHÔNG tạo `data/` cạnh nó; dữ liệu ở
`~/Library/Application Support/lucky-draw-app/data/` (Finder → Go → Go to Folder).

## 4. Chuyển dữ liệu giữa bản cài đặt và bản portable

Copy file session cần chuyển giữa thư mục dữ liệu của bản cài đặt (bảng mục 3) và `data/` của bản
portable, hoặc dùng thẳng nút **Open** ở thanh tab (mặc định mở đúng thư mục của bản đang chạy) để
chọn file mà không cần tự tay copy. Tab tự hiện khi mở app hoặc quay lại cửa sổ app. File session dùng
chung được giữa Windows và macOS.

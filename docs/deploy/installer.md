# Installer — cài app vào máy, dữ liệu gắn với máy

> **Trạng thái**
> - **Windows**: `…-Setup.exe` (NSIS) build được cùng lúc với bản portable. **Chưa chạy thử cài đặt**
>   trên máy thật.
> - **macOS**: không có file cài đặt riêng. "Cài đặt" = kéo `Lucky Draw Studio.app` từ bản portable
>   vào Applications. Chờ test trên Mac cùng bản portable.

Định dạng phân phối chính là bản portable ([portable.md](./portable.md)). Installer chỉ dành cho máy
cố định dùng lâu dài. Cách build: [build.md](./build.md).

## 1. Triết lý thiết kế

### Khi nào dùng Installer

| | Portable | Installer |
|---|---|---|
| Phù hợp | Máy mượn/thuê tại venue, cầm USB đi, không rõ quyền Admin | Máy cố định của mình, dùng lại nhiều lần |
| Dữ liệu nằm ở | `data/` TRONG thư mục app, đi theo app | Thư mục hồ sơ người dùng của hệ điều hành, **gắn với máy**, tách khỏi app |
| Mang sang máy khác | Copy thư mục là đủ | Phải cài lại, và tự copy file DB |
| Có trong Start Menu/Launchpad | Không | Có |
| Gỡ bỏ | Xoá thư mục | Gỡ cài đặt (dữ liệu vẫn giữ lại) |

### Nguyên tắc

1. **Dữ liệu tách khỏi app.** App nằm ở thư mục cài đặt, dữ liệu nằm trong `userData` của người dùng.
   Cài lại, cập nhật lên bản mới, hay gỡ cài đặt đều **không đụng tới dữ liệu**.
2. **Dữ liệu ở đúng chỗ bản dev đang dùng** (`userData` = `…/lucky-draw-app/`), không thêm vị trí thứ
   ba. Hệ quả cần biết: trên máy dev, bản cài đặt và bản dev **dùng CHUNG 1 file DB**.
3. **Không cần quyền Admin theo mặc định** (Windows cài cho riêng người dùng hiện tại).
4. Hành vi lúc chạy giống hệt bản portable: chặn mở 2 app, đóng DB khi thoát, đóng cửa sổ cuối là
   thoát (cả trên Mac). Xem [portable.md](./portable.md#hành-vi-chung-của-bản-đóng-gói-appispackaged).

## 2. Thực thi kỹ thuật

### Nhận biết "đang chạy bản cài đặt" — `electron/db.ts`

`folderBuildBaseDir()` trả `null` (tức dùng `userData`) khi:

| Hệ điều hành | Nhận biết |
|---|---|
| Windows | Thư mục chứa exe có file `Uninstall *.exe`. NSIS luôn ghi uninstaller `Uninstall ${productName}.exe` vào thư mục cài (`templates/nsis/common.nsh`); bản portable không bao giờ có file này |
| macOS | Thư mục chứa `.app` là `/Applications` hoặc `~/Applications` |

Bảng đầy đủ mọi trường hợp: [portable.md](./portable.md#chọn-thư-mục-db--resolvedbdir-electrondbts).

### Vì sao thư mục dữ liệu tên `lucky-draw-app`, không phải `Lucky Draw Studio`

`userData` của Electron lấy theo tên app lúc được đọc lần đầu. `db.ts` đọc nó ngay khi main process
nạp module, TRƯỚC `app.setName("Lucky Draw Studio")` trong `main.ts`, và `package.json` không có
`productName` ở cấp gốc, nên tên là `name` = `lucky-draw-app`. Đổi tên thư mục này sẽ làm người dùng
cũ "mất" dữ liệu (app mở file DB rỗng ở thư mục mới), nên nếu muốn đổi phải kèm migration copy DB cũ
sang.

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

## 3. Windows

### Cài đặt

1. Chạy `Lucky Draw Studio-<version>-Setup.exe`. SmartScreen lần đầu (app chưa ký số): **More info →
   Run anyway**.
2. Chọn chế độ cài:

   | Lựa chọn | Thư mục cài mặc định | Cần Admin |
   |---|---|---|
   | **Only for me** (mặc định) | `%LOCALAPPDATA%\Programs\Lucky Draw Studio` | Không |
   | Anyone who uses this computer | `C:\Program Files\Lucky Draw Studio` | Có |

3. Chọn thư mục cài (hoặc giữ mặc định) → Install → Finish.
4. Mở app từ Start Menu hoặc shortcut ngoài Desktop.

### Vị trí dữ liệu

`%APPDATA%\lucky-draw-app\lucky-draw.db` (gõ `%APPDATA%\lucky-draw-app` vào thanh địa chỉ Explorer),
dù cài ở chế độ nào. Mỗi user Windows có dữ liệu riêng.

### Cập nhật, gỡ cài đặt

- **Cập nhật lên bản mới**: chạy file Setup bản mới, cài đè. Dữ liệu giữ nguyên.
- **Gỡ cài đặt**: Settings → Apps → Lucky Draw Studio → Uninstall. Dữ liệu trong
  `%APPDATA%\lucky-draw-app\` VẪN CÒN; muốn dọn sạch thì tự xoá thư mục đó (mất toàn bộ dữ liệu, không
  hoàn tác được).

### Chuyển dữ liệu giữa bản cài đặt và bản portable

Tắt app, rồi copy `lucky-draw.db` (kèm `lucky-draw.db-wal` nếu có) giữa `%APPDATA%\lucky-draw-app\` và
`data\` của bản portable.

## 4. macOS

### Cài đặt

Không build file cài đặt riêng (`.dmg`). `.dmg` thực chất chỉ là 1 ổ đĩa ảo để người dùng kéo app vào
Applications, cho ra kết quả y hệt cách dưới, mà thêm 1 bước build/phân phối. Có thể thêm target
`dmg` sau nếu cần.

1. Giải nén `Lucky Draw Studio-<version>-mac.zip` (bản portable).
2. Kéo **riêng** `Lucky Draw Studio.app` (không kéo cả thư mục) vào **Applications**.
3. Mở từ Launchpad/Applications. Lần đầu trên Mac không phải máy build: Gatekeeper, xem
   [portable.md](./portable.md#mở-trên-mac-khác-gatekeeper-app-translocation).

### Vị trí dữ liệu

`~/Library/Application Support/lucky-draw-app/lucky-draw.db` (Finder → Go → Go to Folder, dán đường
dẫn). App trong Applications KHÔNG tạo `data/` cạnh nó.

### Cập nhật, gỡ cài đặt

- **Cập nhật**: kéo `.app` bản mới vào Applications, chọn Replace. Dữ liệu giữ nguyên.
- **Gỡ**: kéo app từ Applications vào Trash. Dữ liệu trong `~/Library/Application Support/lucky-draw-app/`
  VẪN CÒN; muốn dọn sạch thì tự xoá thư mục đó.

### Chuyển dữ liệu giữa bản cài đặt và bản portable

Thoát app, copy `lucky-draw.db` (kèm `-wal` nếu có) giữa
`~/Library/Application Support/lucky-draw-app/` và `data/` của bản portable. File DB dùng chung được
với bản Windows.

## 5. Checklist test

- [ ] **Windows**: cài chế độ "Only for me" không cần Admin; app mở từ Start Menu và shortcut Desktop;
      dữ liệu ghi vào `%APPDATA%\lucky-draw-app\`; KHÔNG có thư mục `data\` trong thư mục cài.
- [ ] **Windows**: cài đè bản mới → dữ liệu còn; gỡ cài đặt → app mất khỏi Start Menu, dữ liệu vẫn còn.
- [ ] **macOS**: app trong Applications dùng `~/Library/Application Support/lucky-draw-app/`, không
      tạo `data/` trong Applications.
- [ ] Cả 2: mở app lần 2 chỉ đưa cửa sổ cũ lên trước; đóng cửa sổ là app thoát.

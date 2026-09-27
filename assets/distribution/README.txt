LUCKY DRAW STUDIO {{version}}
===============================================

App quay số trúng thưởng chạy hoàn toàn Offline không cần Internet.

--------------------------

Lucky Draw Studio-{{version}}-win.zip     BẢN PORTABLE không cần cài đặt và khuyên dùng
Lucky Draw Studio-{{version}}-Setup.exe   BẢN CÀI ĐẶT dùng cho máy cố định dùng lâu dài
Lucky Draw Studio-{{version}}-mac.zip     Bản portable cho macOS

Các File/Folder còn lại (win-unpacked, mac-universal, latest.yml, *.blockmap,
builder-debug.yml, .icon-ico) là File phụ của quá trình Build Electron từ Chromium 
và không ảnh hưởng đến thực thi.


1. BẢN PORTABLE CHO WINDOWS (File .zip)
---------------------------------------------------------------------

- Chuột phải File .zip chọn Extract All để giải nén và KHÔNG mở App ngay bên trong file zip.
- Mở thư mục "Lucky Draw Studio" vừa giải nén rồi chạy "Lucky Draw Studio.exe".
- Dữ liệu nằm trong thư mục "data" trong đó mỗi Session Tab là 1 File .db.
- NẾU mang sang máy khác, Copy NGUYÊN thư mục "Lucky Draw Studio" kèm thư mục "data".
- NẾU chỉ cần chuyển 1 Session, Copy ĐÚNG 1 File .db của Session đó vào thư mục "data"
  của máy kia.
- NẾU chạy trực tiếp trên External Drive và dùng cho cả Windows lẫn MacOS thì sử dụng định 
  dạng thiết bị là exFAT và tắt App trước khi rút thiết bị.


2. BẢN CÀI ĐẶT CHO WINDOWS (Setup.exe)
--------------------------------------------

- Chạy File Setup.exe, chọn "Only for me" không cần quyền Admin rồi chọn Install.
- Mở App từ Start Menu hoặc Shortcut ngoài Desktop.
- Dữ liệu lưu ở "%APPDATA%\lucky-draw-app\data\"
- Gỡ cài đặt qua Settings/Apps trong đó dữ liệu VẪN CÒN và không bị xoá.


3. BẢN DÀNH CHO MACOS (File -mac.zip)
------------------------

- Giải nén và mở "Lucky Draw Studio.app" trong thư mục "Lucky Draw Studio".
- Lần đầu nếu MacOS chặn App thì mở "System Settings", chọn "Privacy & Security" rồi chọn 
  "Open Anyway".
- Nếu App báo "protected temporary copy" thì mở Terminal, gõ "xattr -dr com.apple.quarantine"
  có dấu cách ở cuối rồi kéo thư mục "Lucky Draw Studio" vào Terminal sau đó nhấn Enter.


LƯU Ý CHUNG
-----------

- Lần đầu mở trên thiết bị mới, Windows có thể hiện "Windows protected your PC", điều này
  có nghĩa là Windows đang chặn các App thiếu chữ ký số "Code Signing Certificate" từ nhà 
  phát triển chưa đăng ký "Unknown Publisher", bấm "More info" rồi chọn "Run anyway".
- Nếu App hiển thị Popup báo đang có 2 Versions của cùng 1 Session thì chọn bản muốn giữ
  trong đó App sẽ tự động gợi ý Version mới nhất, bản còn lại được chuyển vào data\.trash và
  có thể khôi phục lại sau này.
- Nếu xoá 1 Session Tab, App sẽ chỉ chuyển File .db vào data\.trash và có thể lấy lại được.
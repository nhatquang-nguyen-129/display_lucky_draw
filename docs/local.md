# Local Setup for Lucky Draw Studio

## Purpose

App desktop Electron + React + SQLite, chạy hoàn toàn offline. Tài liệu này hướng dẫn cài đặt môi trường từ đầu đến lúc chạy được `npm run electron:dev`, kèm các lỗi thường gặp.

---

## Prequisites

### Git

- Download and install Git:

```bash
https://git-scm.com/downloads
```

- Verify the installation:

```bash
git --version
```

### NodeJS NVM

- Using **NVM Node Version Manager** is strongly recommended

- Instal NodeJS NVM for MacOS

```bash
brew install nvm

mkdir -p ~/.nvm

echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshrc

source ~/.zshrc

nvm install 20
nvm use 20
```

#### Windows

Download **nvm-windows**:

https://github.com/coreybutler/nvm-windows/releases

After installation:

```powershell
nvm install 20
nvm use 20
```

#### Linux

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

source ~/.bashrc

nvm install 20
nvm use 20
```

- Node.js 20.x LTS

- npm 10.x (bundled with Node.js)

- Python 3.11.x

### Windows 

- Visual Studio Build Tools with Desktop development with C+

### MacOS

- Xcode Command Line Tools native build tools

### Linux

- build-essential for Linux

## Cài đặt

```bash
npm install
```

## Chạy ở chế độ dev

```bash
npm run electron:dev
```

Lệnh này chạy song song Vite dev server (renderer) và Electron (main process),
tự động mở cửa sổ chính. SQLite database được tạo tự động tại thư mục
`userData` của hệ điều hành (VD trên macOS: `~/Library/Application Support/lucky-draw-app/lucky-draw.db`).

## Đóng gói thành file cài đặt

```bash
npm run package
```

Kết quả nằm trong thư mục `release/`.

## Lưu ý về `better-sqlite3`

Đây là native module, cần biên dịch theo đúng phiên bản Electron đang dùng.
Nếu gặp lỗi `NODE_MODULE_VERSION` khi chạy, cài thêm và rebuild:

```bash
npm install --save-dev electron-rebuild
npx electron-rebuild
```

## Việc cần làm tiếp theo

1. Nối OAuth2 Google Sheets thật (trang Settings đang là placeholder).
2. Xây engine kéo thả cho Present mode (hiện là màn hình tĩnh hiển thị kết quả mới nhất).
3. Thêm animation quay số (spin effect) trước khi hiện kết quả.
4. Thêm xác thực/khoá màn hình cấu hình trong lúc trình chiếu để tránh bấm nhầm.


## 1. Yêu cầu hệ thống

| Thành phần         | Phiên bản khuyến nghị    | Ghi chú                                                                                                                                         |
| ------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js            | **20.x LTS**             | Tránh dùng bản mới nhất (VD 24.x) — native module như `better-sqlite3` thường chưa có prebuilt binary cho bản Node quá mới, dễ gây lỗi compile |
| npm                | đi kèm Node 20           | npm 10.x trở lên không còn hỗ trợ `npm config set python`                                                                                       |
| Python             | **3.11.x (khuyến nghị)** | Cài từ Python.org. Không dùng Python 3.12+ nếu project còn dùng `node-gyp` cũ vì `distutils` đã bị xoá                                         |
| Git                | bất kỳ bản mới           |                                                                                                                                                 |
| Build tools native | xem theo OS bên dưới     | Cần để compile native module như `better-sqlite3`                                                                                               |

---

## 2. Cài đặt theo hệ điều hành

### macOS

### 2.1 Cài Xcode Command Line Tools

```bash
xcode-select --install
```

Đây là bước bắt buộc để compile các native module.

---

### 2.2 Cài nvm

```bash
brew install nvm

mkdir -p ~/.nvm

echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshrc

source ~/.zshrc
```

---

### 2.3 Cài Node.js 20 LTS

```bash
nvm install 20
nvm use 20

node -v
npm -v
```

Kết quả mong muốn:

```text
v20.x.x
10.x.x
```

---

### 2.4 Cài Python 3.11

Khuyến nghị cài bằng installer chính thức của Python.org:

https://www.python.org/downloads/release/python-311/

Sau khi cài xong, kiểm tra:

```bash
python3.11 --version
```

Kết quả mong muốn:

```text
Python 3.11.x
```

---

### Windows

```powershell
# Cài Node 20 LTS qua nvm-windows
# https://github.com/coreybutler/nvm-windows/releases

nvm install 20
nvm use 20

node -v
```

Cài Visual Studio Build Tools:

- Mở Visual Studio Installer
- Chọn **Desktop development with C++**

---

### Linux (Ubuntu/Debian)

```bash
sudo apt update

sudo apt install -y \
build-essential \
python3 \
python3-pip \
git

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

source ~/.bashrc

nvm install 20
nvm use 20
```

---

## 3. Clone project và cài dependencies

```bash
cd đường-dẫn-tới-project/lucky-draw-app
```

Nếu từng cài lỗi trước đó:

```bash
rm -rf node_modules
rm package-lock.json
```

---

### Kiểm tra môi trường

```bash
node -v
npm -v
python3.11 --version
```

Ví dụ:

```text
Node v20.x.x
npm 10.x.x
Python 3.11.x
```

---

### Nếu máy có nhiều phiên bản Python

Export Python 3.11 trước khi cài:

```bash
export PYTHON=$(which python3.11)
```

Kiểm tra:

```bash
echo $PYTHON
```

Ví dụ:

```text
/usr/local/bin/python3.11
```

hoặc

```text
/Library/Frameworks/Python.framework/Versions/3.11/bin/python3.11
```

---

### Cài dependencies

```bash
npm install
```

Nếu `npm install` báo lỗi liên quan `better-sqlite3`, `node-gyp` hoặc `distutils`, xem mục **Xử lý lỗi thường gặp**.

---

## 4. Rebuild native module cho Electron

Đây là bước **bắt buộc**.

Sau khi `npm install`, native module được build theo Node.js của hệ thống.

Electron sử dụng Node runtime riêng nên cần rebuild lại.

```bash
npx electron-rebuild
```

Nếu bỏ qua bước này, app sẽ báo lỗi:

```text
NODE_MODULE_VERSION mismatch
```

---

## 5. Chạy chế độ Development

```bash
npm run electron:dev
```

Lệnh này sẽ:

- chạy Vite Dev Server (`localhost:5173`)
- build Electron Main Process
- mở Electron
- mở DevTools

---

### Kiểm tra nhanh

- App mở bình thường
- Không bị màn hình trắng
- Import được CSV Participants
- Tạo Prize
- Tạo Session
- Quay thử
- Present Mode hoạt động

---

### Database SQLite

Lần chạy đầu tiên sẽ tự tạo database.

| OS | Đường dẫn |
|----|-----------|
| macOS | `~/Library/Application Support/lucky-draw-app/lucky-draw.db` |
| Windows | `%APPDATA%/lucky-draw-app/lucky-draw.db` |
| Linux | `~/.config/lucky-draw-app/lucky-draw.db` |

Muốn reset dữ liệu:

- Đóng app
- Xoá file `.db`
- Chạy lại app

---

## 6. Xử lý lỗi thường gặp

---

### Lỗi

```text
ModuleNotFoundError: No module named 'distutils'
```

Nguyên nhân:

- Đang dùng Python 3.12 hoặc 3.13
- `node-gyp` cũ vẫn cần module `distutils`

Khắc phục:

Đảm bảo đang dùng Python 3.11

```bash
python3.11 --version
```

Export Python:

```bash
export PYTHON=$(which python3.11)
```

Xoá cache:

```bash
rm -rf node_modules
rm package-lock.json
```

Cài lại:

```bash
npm install
```

Nếu vẫn lỗi:

```bash
npm install -g node-gyp@latest
```

rồi chạy lại:

```bash
npm install
```

---

### Lỗi

```text
python is not a valid npm option
```

Nguyên nhân:

npm 10 trở lên đã bỏ hỗ trợ:

```bash
npm config set python ...
```

Giải pháp:

Không dùng `npm config`.

Thay bằng:

```bash
export PYTHON=$(which python3.11)
```

rồi chạy:

```bash
npm install
```

---

### Lỗi

```text
NODE_MODULE_VERSION mismatch
```

Nguyên nhân:

Native module chưa rebuild cho Electron.

Khắc phục:

```bash
npx electron-rebuild
```

---

### Lỗi

```text
No prebuilt binaries found
```

Nguyên nhân:

Node.js quá mới nên `better-sqlite3` chưa có binary tương thích.

Khắc phục:

Dùng Node 20 LTS.

```bash
nvm use 20
```

---

### Electron mở màn hình trắng

Thông thường do Vite Dev Server chưa kịp khởi động.

Thử:

```bash
npm run electron:dev
```

lần nữa.

---

## 7. Sau khi setup xong

Nếu `npm run electron:dev` chạy ổn định thì môi trường đã sẵn sàng.

Tiếp theo có thể:

- Build production
- Đóng gói `.app`
- Đóng gói `.exe`
- Ký ứng dụng (code signing)
- Tạo installer
- Phát hành phiên bản mới


Giải phóng Localhost trước khi chạy: 
```bash
lsof -ti:5173 | xargs kill -9
npm run electron:dev
```
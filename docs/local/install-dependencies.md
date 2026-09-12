# Cài đặt môi trường local

Thứ tự bắt buộc: **Node.js (qua NVM) → `npm install` → Python 3.11 + Native Build Tools → `electron-rebuild`**. 3 mục cuối tồn tại vì `better-sqlite3` là **native module** — cần biên dịch/rebuild đúng theo runtime của Electron, không phải Node.js thường.

## 1. Node.js 20 LTS (qua NVM)

- Dùng **Node.js 20 LTS** để dev và test.
- Khuyến nghị dùng **NVM (Node Version Manager)** thay vì cài Node.js trực tiếp — dễ chuyển đổi giữa nhiều version Node.js đã cài.

### macOS

```bash
brew install nvm

mkdir -p ~/.nvm

echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshrc

source ~/.zshrc

nvm install 20
nvm use 20
```

### Windows

Download the NodeJS NVM installer `nvm-setup.exe`:

```bash
https://github.com/coreybutler/nvm-windows/releases
```

Close all Command Prompt, PowerShell, VS Code windows and open a new terminal.

```powershell
nvm version
```

```powershell
nvm install 20
nvm use 20
```

```powershell
node -v
npm -v
```

### Linux

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

source ~/.bashrc
```

```bash
nvm install 20
nvm use 20
```

```bash
node -v
npm -v
```

## 2. Project dependencies (`npm install`)

`nvm install`/`nvm use` chỉ cài **Node.js** và **npm**. Chạy `npm install` để tải mọi dependency khai báo trong `package.json` (Electron, React, Vite, TypeScript...) vào `node_modules/`:

```bash
npm install
```

Kiểm tra đã cài xong:

```bash
npm list --depth=0
```

`node_modules/` phải tồn tại sau bước này.

### Cài lại sạch khi gặp xung đột dependency

Cần làm khi: vừa đổi version Node.js, vừa update dependency, hoặc gặp lỗi lạ sau `npm install`.

**macOS / Linux**:

```bash
rm -rf node_modules
rm package-lock.json

npm install
```

**Windows PowerShell**:

```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json

npm install
```

Hoặc dùng alias PowerShell:

```powershell
rm -Recurse -Force node_modules
rm -Force package-lock.json

npm install
```

> **Lưu ý (chỉ Windows)**
>
> Đóng app Electron không phải lúc nào cũng dừng hết tiến trình nền. `electron.exe`, `node.exe`, hoặc `npm.exe` có thể vẫn chạy và khoá file trong `node_modules`, gây lỗi:
>
> - `Access is denied`
> - `EBUSY: resource busy or locked`
> - `The process cannot access the file because it is being used by another process`
>
> Trước khi cài lại sạch, tắt hết tiến trình dev còn sót:
>
> ```powershell
> taskkill /F /IM electron.exe
> taskkill /F /IM node.exe
> taskkill /F /IM npm.exe
> ```
>
> Nếu đang mở Visual Studio Code, nên đóng hẳn app (không chỉ đóng cửa sổ project) trước khi xoá `node_modules`.

Sau khi cài lại dependency, rebuild native module (xem mục 4).

## 3. Python 3.11

`node-gyp` (dùng để build native module) cần đúng Python 3.11 — bản mới hơn/cũ hơn có thể gây lỗi build.

- Download the official installer:

```bash
https://www.python.org/downloads/release/python-311/
```

### Windows

Enable **`Add Python to PATH`** during the installation.

```bash
python --version
```

Nếu máy có nhiều version Python, chỉ định tạm thời Python 3.11 trước khi cài dependency:

```powershell
$env:PYTHON="C:\Users\ADMIN\AppData\Local\Programs\Python\Python311\python.exe"
```

```powershell
echo $env:PYTHON
Test-Path $env:PYTHON
```

Kết quả mong đợi: `True`.

### macOS

Dùng installer chính thức từ Python.org.

```bash
python3.11 --version
```

Nếu máy có nhiều version Python, export Python 3.11 trước khi install:

```bash
export PYTHON=$(which python3.11)
```

```bash
echo $PYTHON
```

Kết quả mong đợi (1 trong 2 dạng tuỳ cách cài):

```text
/usr/local/bin/python3.11
```

```text
/Library/Frameworks/Python.framework/Versions/3.11/bin/python3.11
```

### Linux

Cài qua package manager nếu có sẵn Python 3.11.

## 4. Native Build Tools

Cần thiết để biên dịch native Node.js module như `better-sqlite3`.

- **macOS**: cài Xcode Command Line Tools

```bash
xcode-select --install
```

- **Windows**: cài Visual Studio Build Tools, chọn feature **Desktop development with C++**

```bash
https://visualstudio.microsoft.com/downloads/
```

- **Ubuntu/Debian**: cài `build-essential`

```bash
sudo apt update

sudo apt install -y \
build-essential \
python3 \
python3-pip \
git
```

## 5. Rebuild native module cho Electron

Sau khi cài/cài lại dependency, rebuild toàn bộ native module theo đúng runtime Node.js đóng gói sẵn trong Electron (khác Node.js hệ thống):

```bash
npx electron-rebuild
```

Bắt buộc chạy lại mỗi khi: `npm install` xong, đổi version Electron, hoặc vừa cài lại sạch
`node_modules`. Bỏ qua bước này sẽ gây lỗi:

```text
NODE_MODULE_VERSION mismatch
```

hoặc:

```text
The module was compiled against a different Node.js version.
```

Bước tiếp theo: [run-dev.md](./run-dev.md) — chạy `npm run electron:dev`.

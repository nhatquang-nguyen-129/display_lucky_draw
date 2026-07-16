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

- Clone the repository:

```bash
git clone https://github.com/nhatquang-nguyen-129/display_lucky_draw.git
cd display_lucky_draw
```

### NodeJS 20 LTS

- Using **Node.js 20 LTS** for development and testing

- Using **NVM Node Version Manager** is strongly recommended instead of installing Node.js directly

- Using **NVM** to easily switch between multiple Node.js versions installed

- **MacOS**: Install NodeJS NVM with Homebrew

```bash
brew install nvm

mkdir -p ~/.nvm

echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshrc

source ~/.zshrc

nvm install 20
nvm use 20
```

- **Windows**: Download the NodeJS NVM installer

```bash
https://github.com/coreybutler/nvm-windows/releases
```

- **Windows**: Install NodeJS NVM

```bash
nvm install 20
nvm use 20
```

- **Linux**: Install NodeJS NVM

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

source ~/.bashrc

nvm install 20
nvm use 20
```
- Verify NodeJS versions

```bash
node -v
npm -v
```

---

### Project dependencies

- Running `nvm install` or `nvm use` only installs **Node.js** and **npm**

- Run `npm install` to download all dependencies defined in `package.json` to create the `node_modules` directory and install Electron, React, Vite, TypeScript

```bash
npm install
```

- Check that the following directory `node_modules/` exists or verify installation:

```bash
npm list --depth=0
```

- If you encounter dependency conflicts after switching Node.js versions or update dependencies, perform a clean installation:

```bash
rm -rf node_modules
rm package-lock.json

npm install
```

---

### Python 3.11

- Download the official installer:
```bash
https://www.python.org/downloads/release/python-311/
```

- **Windows:** Enable `Add Python to PATH`

- **macOS:** Use the official installer from Python.org

- **Linux:** Install using your package manager if Python 3.11 is available

- Verify Python 3.11.x versions
```bash
python3.11 --version
```
- Export Python 3.11 before install if your computer has multiple Python versions:

```bash
export PYTHON=$(which python3.11)
```

- Verify Python 3.11 environment variable

```bash
echo $PYTHON
```

- Expected Python 3.11 environment variable results:

```text
/usr/local/bin/python3.11
```


```text
/Library/Frameworks/Python.framework/Versions/3.11/bin/python3.11
```



---

### Native Build Tools

--- These tools are required to compile native Node.js modules such as `better-sqlite3`.

--- **MacOS**: Install `XCode

```bash
xcode-select --install
```

--- **Windows**: Download the offilicate Visual Studio Build Tools installer with Desktop development with C++ feature

```bash
https://visualstudio.microsoft.com/downloads/
```

--- **Ubuntu/Debian**: Install Linux build-essential

```bash
sudo apt update

sudo apt install -y \
build-essential \
python3 \
python3-pip \
git
```

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



---


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

## Troubleshooting

---

### ModuleNotFoundError: No module named 'distutils'

- Python 3.12+ removed the `distutils` module but older versions of `node-gyp` still depend on it.

```text
ModuleNotFoundError: No module named 'distutils'
```

- Verify that Python 3.11 is being used:

```bash
python3.11 --version
```

- Export Python before installing dependencies:

```bash
export PYTHON=$(which python3.11)
```

- Remove previous installation artifacts:

```bash
rm -rf node_modules
rm package-lock.json
```

- Install dependencies again:

```bash
npm install
```

- If the issue persists:

```bash
npm install -g node-gyp@latest
npm install
```

---

## python is not a valid npm option

### Error

```text
python is not a valid npm option
```

### Cause

npm 10+ removed support for:

```bash
npm config set python ...
```

### Solution

Do not configure Python through npm.

Instead:

```bash
export PYTHON=$(which python3.11)
npm install
```

---

## NODE_MODULE_VERSION mismatch

### Error

```text
Error: NODE_MODULE_VERSION mismatch
```

### Cause

Native modules (such as `better-sqlite3`) were compiled against a different Node.js or Electron runtime.

### Solution

Rebuild native modules:

```bash
npx electron-rebuild
```

If the problem remains:

```bash
rm -rf node_modules
rm package-lock.json

npm install
npx electron-rebuild
```

---

## No prebuilt binaries found

### Error

```text
No prebuilt binaries found
```

### Cause

The installed Node.js version is newer than the version currently supported by `better-sqlite3`.

### Solution

Use Node.js 20 LTS:

```bash
nvm use 20
```

Verify:

```bash
node -v
```

Expected:

```text
v20.x.x
```

Then reinstall:

```bash
rm -rf node_modules
npm install
```

---

## gyp ERR! build error

### Error

```text
gyp ERR! build error
```

### Cause

Native build tools are missing or incorrectly installed.

### Solution

**macOS**

```bash
xcode-select --install
```

**Windows**

Install **Visual Studio Build Tools** with:

- Desktop development with C++

**Ubuntu / Debian**

```bash
sudo apt install build-essential
```

---

## Electron shows a blank window

### Cause

The Vite development server was not fully started before Electron attempted to load it.

### Solution

Restart the development server:

```bash
npm run electron:dev
```

If the issue continues, ensure port **5173** is available:

```bash
lsof -ti:5173 | xargs kill -9
```

Start again:

```bash
npm run electron:dev
```

---

## Port 5173 is already in use

### Error

```text
EADDRINUSE
```

### Cause

Another Vite instance is already running.

### Solution

Terminate the process using port 5173.

**macOS / Linux**

```bash
lsof -ti:5173 | xargs kill -9
```

**Windows**

```cmd
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

---

## Electron command not found

### Error

```text
electron: command not found
```

### Cause

Project dependencies have not been installed.

### Solution

Install dependencies:

```bash
npm install
```

Then run:

```bash
npm run electron:dev
```

---

## Cannot find module 'better-sqlite3'

### Error

```text
Cannot find module 'better-sqlite3'
```

### Cause

The package was not installed successfully or the installation was interrupted.

### Solution

Remove existing dependencies:

```bash
rm -rf node_modules
rm package-lock.json
```

Install again:

```bash
npm install
```

---

## npm install hangs or fails

### Cause

Possible reasons include:

- Network issues
- Corrupted npm cache
- Interrupted installation

### Solution

Clear the npm cache:

```bash
npm cache clean --force
```

Then reinstall:

```bash
rm -rf node_modules
rm package-lock.json

npm install
```

---

## Permission denied

### Error

```text
EACCES
Permission denied
```

### Cause

Insufficient file permissions.

### Solution

Avoid using `sudo` with npm whenever possible.

Ensure your project directory is writable by your current user.

---

## Database is locked

### Error

```text
SQLITE_BUSY
database is locked
```

### Cause

Another instance of the application is currently accessing the SQLite database.

### Solution

- Close all running instances of Lucky Draw Studio.
- Restart the application.

If necessary, remove the database file and allow it to be recreated.

---

## Changes are not reflected

### Cause

Old build artifacts or cached files are being used.

### Solution

Remove build artifacts:

```bash
rm -rf dist
rm -rf dist-electron
```

Then rebuild:

```bash
npm run build
```

or restart development:

```bash
npm run electron:dev
```

---

## Still having issues?

Please include the following information when reporting a problem:

- Operating System
- Node.js version (`node -v`)
- npm version (`npm -v`)
- Python version (`python3.11 --version`)
- Electron version
- Complete error message
- Steps to reproduce the issue


Giải phóng Localhost trước khi chạy: 
```bash
lsof -ti:5173 | xargs kill -9
npm run electron:dev
```
# Local Setup for Lucky Draw Studio

## 1. Purpose

App desktop Electron + React + SQLite, chạy hoàn toàn offline. Tài liệu này hướng dẫn cài đặt môi trường từ đầu đến lúc chạy được `npm run electron:dev`, kèm các lỗi thường gặp.

## 2. Prequisites

### 2.1. Git

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

### 2.2. NodeJS 20 LTS

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

- **Windows**: Download the NodeJS NVM installer `nvm-setup.exe`

```bash
https://github.com/coreybutler/nvm-windows/releases
```

- Close all Command Prompt, PowerShell, VS Code windows and open a new terminal.

- Verify NVM:

```powershell
nvm version
```

- Install Node.js 20 LTS:

```powershell
nvm install 20
nvm use 20
```

- Verify:

```powershell
node -v
npm -v
```

- **Linux**: Install NodeJS NVM

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

source ~/.bashrc
```

- Install Node.js 20 LTS:

```bash
nvm install 20
nvm use 20
```

- Verify:

```bash
node -v
npm -v
```

### 2.3. Project Dependencies

- Running `nvm install` or `nvm use` only installs **Node.js** and **npm**.

- Run `npm install` to download all project dependencies defined in `package.json`, including Electron, React, Vite, TypeScript, and all required packages into the `node_modules` directory.

```bash
npm install
```

- Verify that all dependencies were installed successfully:

```bash
npm list --depth=0
```

- The `node_modules/` directory should now exist.

- If you encounter dependency conflicts after switching Node.js versions or updating dependencies, perform a clean installation on **macOS / Linux**:

```bash
rm -rf node_modules
rm package-lock.json

npm install
```

- If you encounter dependency conflicts after switching Node.js versions or updating dependencies, perform a clean installation on **Windows PowerShell**:

```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json

npm install
```

- Or using PowerShell aliases:

```powershell
rm -Recurse -Force node_modules
rm -Force package-lock.json

npm install
```

> **Note**
>
> On Windows, simply closing the Electron application does **not** always terminate all background processes. `electron.exe`, `node.exe`, or `npm.exe` may continue running and lock files inside `node_modules`, causing errors such as:
>
> - `Access is denied`
> - `EBUSY: resource busy or locked`
> - `The process cannot access the file because it is being used by another process`
>
> Before performing a clean installation, terminate any remaining development processes:
>
> ```powershell
> taskkill /F /IM electron.exe
> taskkill /F /IM node.exe
> taskkill /F /IM npm.exe
> ```
>
> If Visual Studio Code is running, it is also recommended to completely close the application (not just the project window) before deleting `node_modules`.

- After reinstalling dependencies, rebuild all native Electron modules:

```bash
npx electron-rebuild
```

- This step is required because native modules (such as `better-sqlite3`) must be rebuilt against Electron's bundled Node.js runtime. Skipping this step may result in errors such as:

```text
NODE_MODULE_VERSION mismatch
```

or

```text
The module was compiled against a different Node.js version.
```

### 2.3. Python 3.11

- Download the official installer:
```bash
https://www.python.org/downloads/release/python-311/
```

- **Windows:** Enable `Add Python to PATH` during the installation

- Verify Python 3.11.x installation

```bash
python --version
```
- If multiple Python versions are installed, temporarily specify Python 3.11 before installing dependencies:

```bash
$env:PYTHON="C:\Users\ADMIN\AppData\Local\Programs\Python\Python311\python.exe"
```

- Verify environment variable

```bash
echo $env:PYTHON
```

- Verify Python 3.11.x existence

```bash
Test-Path $env:PYTHON
```

- Expected results:

```text
True
```

- **macOS:** Use the official installer from Python.org

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

- **Linux:** Install using your package manager if Python 3.11 is available


### 2.5. Native Build Tools

- These tools are required to compile native Node.js modules such as `better-sqlite3`.

- **MacOS**: Install `XCode

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

## 3. Run Application on Local

### 3.1. Windows

- The Vite development server uses port **5173** by default. If port **5173** is already in use, Vite may fail to start or Electron may connect to an old development server. Free it first:

```powershell
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

- This project uses native Node.js modules such as `better-sqlite3`. After installing dependencies, switching Node.js versions, updating Electron, or performing a clean installation, rebuild all native modules:

```powershell
npx electron-rebuild
```

- Skipping the rebuild step may result in errors such as `NODE_MODULE_VERSION mismatch` or `The module was compiled against a different Node.js version.`

- Start the development environment — builds the Electron main process, starts the Vite dev server (`http://localhost:5173`), and opens Developer Tools (development mode):

```powershell
npm run electron:dev
```

- If the app exits immediately on launch with `TypeError: Cannot read properties of undefined (reading 'getPath')` (thrown at `dist-electron/db.js`), the shell has `ELECTRON_RUN_AS_NODE=1` set — this is the default inside the **VS Code integrated terminal** and any terminal spawned by a VS Code extension. Clear the variable, then start again:

```powershell
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm run electron:dev
```

- Alternatively, run `npm run electron:dev` from a standalone **Windows Terminal / PowerShell** window instead of the VS Code integrated terminal.

- Editing files in `electron/` requires stopping and restarting `npm run electron:dev` — the main process is not hot-reloaded (only the renderer is). On Windows, `Ctrl+C` does not always terminate every child process; leftover `electron.exe` / `node.exe` may keep holding port **5173** or lock files under `dist-electron/`. Terminate them before restarting:

```powershell
taskkill /F /IM electron.exe 2>$null
taskkill /F /IM node.exe 2>$null
```

- The SQLite database is created automatically on the first launch at `%APPDATA%\lucky-draw-app\lucky-draw.db`. Open its folder with:

```powershell
explorer $env:APPDATA\lucky-draw-app
```

- To reset all application data, close the application, delete the database file, then start the application again.

### 3.2. macOS

- The Vite development server uses port **5173** by default. If port **5173** is already in use, Vite may fail to start or Electron may connect to an old development server. Free it first (macOS / Linux):

```bash
lsof -ti:5173 | xargs kill -9
```

- This project uses native Node.js modules such as `better-sqlite3`. After installing dependencies, switching Node.js versions, updating Electron, or performing a clean installation, rebuild all native modules:

```bash
npx electron-rebuild
```

- Skipping the rebuild step may result in errors such as `NODE_MODULE_VERSION mismatch` or `The module was compiled against a different Node.js version.`

- Start the development environment — builds the Electron main process, starts the Vite dev server (`http://localhost:5173`), and opens Developer Tools (development mode):

```bash
npm run electron:dev
```

- Editing files in `electron/` requires stopping and restarting `npm run electron:dev` — the main process is not hot-reloaded (only the renderer is). Stopping with `Ctrl+C` normally tears down the Vite and Electron child processes together (`concurrently -k`).

- The SQLite database is created automatically on the first launch:

| Operating System | Database Location |
|-----------------|-------------------|
| macOS | `~/Library/Application Support/lucky-draw-app/lucky-draw.db` |
| Linux | `~/.config/lucky-draw-app/lucky-draw.db` |

- To reset all application data, close the application, delete the database file, then start the application again.
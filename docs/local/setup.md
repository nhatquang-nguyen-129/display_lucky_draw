# Setup — cài môi trường dev

Từ máy trống tới lúc chạy được `npm run electron:dev`. Bước tiếp theo: [run-dev.md](./run-dev.md).
Kiểm tra thay đổi + vị trí DB: [testing.md](./testing.md). Build bản phát hành:
[`docs/deploy/build.md`](../deploy/build.md). Kiến trúc code (đọc SAU khi đã chạy được app):
[`docs/architecture/ipc-and-windows.md`](../architecture/ipc-and-windows.md).

## Tổng quan

| Bước | Việc | Khi nào cần làm lại |
|---|---|---|
| 1 | Cài Git, clone repo | Máy mới |
| 2 | Node.js 20 LTS (qua NVM) | Máy mới / đổi version Node |
| 3 | `npm install` | Sau khi pull có đổi `package.json`/`package-lock.json` |
| 4 | Python 3.11 + Native Build Tools | Máy mới — chỉ cần khi `better-sqlite3` phải tự biên dịch (mục 4) |
| 5 | `npx electron-rebuild` | Sau mọi lần `npm install`, đổi version Electron/Node |

Lý do có bước 4–5: `better-sqlite3` là **native module** (C++), phải khớp đúng runtime Node đóng gói
sẵn trong Electron — khác Node.js hệ thống.

## 1. Git & clone

Cài Git từ <https://git-scm.com/downloads>, kiểm tra `git --version`, rồi:

```bash
git clone https://github.com/nhatquang-nguyen-129/display_lucky_draw.git
cd display_lucky_draw
```

## 2. Node.js 20 LTS qua NVM

Dùng NVM để chuyển version Node dễ dàng. Luôn dùng **Node 20** (khớp máy build Windows/Mac).

**Windows** — tải `nvm-setup.exe` từ <https://github.com/coreybutler/nvm-windows/releases>, cài xong
**đóng hết** Command Prompt/PowerShell/VS Code rồi mở terminal mới:

```powershell
nvm version
nvm install 20
nvm use 20
node -v; npm -v
```

**macOS**:

```bash
brew install nvm
mkdir -p ~/.nvm
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshrc
source ~/.zshrc
nvm install 20 && nvm use 20
node -v && npm -v
```

**Linux**:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20 && nvm use 20
```

## 3. Cài dependencies

```bash
npm install
```

Tải mọi dependency trong `package.json` (Electron, React, Vite, TypeScript…) vào `node_modules/`.
Muốn cài ĐÚNG version đã khoá trong `package-lock.json` (máy mới, CI, máy build) thì dùng `npm ci`.

### Cài lại sạch khi gặp lỗi lạ

Xoá `node_modules/` rồi cài lại theo lock file. **Không xoá `package-lock.json`** — xoá sẽ làm npm
tự chọn lại version mới, có thể lệch với máy khác.

```bash
# macOS / Linux
rm -rf node_modules && npm ci
```

```powershell
# Windows PowerShell
Remove-Item -Recurse -Force node_modules; npm ci
```

**Windows — lỗi `Access is denied` / `EBUSY` / `being used by another process` khi xoá**:
`electron.exe`/`node.exe` còn chạy ngầm đang khoá file. Tắt hết rồi xoá lại (đóng hẳn VS Code nếu
vẫn lỗi):

```powershell
taskkill /F /IM electron.exe
taskkill /F /IM node.exe
```

Cài lại xong nhớ làm bước 5.

## 4. Python 3.11 + Native Build Tools (dự phòng)

Script cài của `better-sqlite3` là `prebuild-install || node-gyp rebuild`: **thường tải được bản dựng
sẵn** khớp Electron nên không biên dịch gì. Chỉ khi không tải được (mạng chặn, tổ hợp version chưa có
bản dựng sẵn) mới tự biên dịch bằng `node-gyp` — lúc đó cần 2 thứ dưới. Nên cài sẵn trên máy dev để
không bị kẹt.

| | Windows | macOS | Ubuntu/Debian |
|---|---|---|---|
| Python 3.11 | Installer từ python.org, bật **Add Python to PATH** | Installer từ python.org (`python3.11 --version`) | Package manager |
| Build tools | Visual Studio Build Tools, feature **Desktop development with C++** | `xcode-select --install` | `sudo apt install -y build-essential python3 python3-pip git` |

Python 3.11: <https://www.python.org/downloads/release/python-311/> — bản mới hơn/cũ hơn có thể làm
`node-gyp` lỗi. Máy có nhiều bản Python thì trỏ riêng 3.11 trước khi `npm install`/`electron-rebuild`:

```powershell
# Windows — kiểm tra đường dẫn đúng: Test-Path $env:PYTHON phải ra True
$env:PYTHON = "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe"
```

```bash
# macOS
export PYTHON=$(which python3.11)
```

## 5. Rebuild native module cho Electron

```bash
npx electron-rebuild
```

(`electron-rebuild` có sẵn trong `node_modules/.bin`, đến từ `@electron/rebuild` mà electron-builder kéo
theo.) Bắt buộc sau MỌI lần `npm install`/`npm ci`, đổi version Electron, hoặc cài lại sạch. Bỏ qua sẽ
gặp `NODE_MODULE_VERSION mismatch` / `The module was compiled against a different Node.js version`.

Không cần chạy tay trước `npm run package` — electron-builder tự rebuild lúc đóng gói.

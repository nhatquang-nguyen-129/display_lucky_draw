# Khác biệt Windows / macOS / Linux — bảng tra nhanh

Dùng file này khi chỉ cần tra đúng 1 lệnh cho đúng OS, không cần đọc lại toàn bộ hướng dẫn. Chi tiết
đầy đủ từng bước nằm ở [install-dependencies.md](./install-dependencies.md) và
[run-dev.md](./run-dev.md).

| Việc | Windows | macOS | Linux |
|---|---|---|---|
| Cài NVM | Installer `nvm-setup.exe` ([nvm-windows](https://github.com/coreybutler/nvm-windows/releases)) | `brew install nvm` | `curl ... nvm-sh/nvm/.../install.sh \| bash` |
| Verify NVM | `nvm version` | `nvm --version` (qua `brew`) | `nvm --version` |
| Cài Python 3.11 | Bật **Add Python to PATH** lúc cài | Installer chính thức Python.org | Package manager hệ thống |
| Trỏ Python 3.11 (nếu có nhiều bản) | `$env:PYTHON="C:\...\Python311\python.exe"` | `export PYTHON=$(which python3.11)` | Theo package manager |
| Native build tools | Visual Studio Build Tools (feature **Desktop development with C++**) | `xcode-select --install` | `sudo apt install build-essential python3 python3-pip git` |
| Cài lại sạch `node_modules` | `Remove-Item -Recurse -Force node_modules; Remove-Item -Force package-lock.json` (PowerShell) | `rm -rf node_modules; rm package-lock.json` | như macOS |
| Giải phóng port 5173 | `Get-NetTCPConnection -LocalPort 5173 ... \| Stop-Process` | `lsof -ti:5173 \| xargs kill -9` | như macOS |
| Tắt tiến trình dev còn sót | `taskkill /F /IM electron.exe` / `node.exe` / `npm.exe` | `Ctrl+C` dọn sạch cả 2 tiến trình (`concurrently -k`), hiếm khi cần kill thủ công | như macOS |
| Mở thư mục chứa DB | `explorer $env:APPDATA\lucky-draw-app` | Finder → `~/Library/Application Support/lucky-draw-app` | File manager → `~/.config/lucky-draw-app` |
| Vị trí file DB | `%APPDATA%\lucky-draw-app\lucky-draw.db` | `~/Library/Application Support/lucky-draw-app/lucky-draw.db` | `~/.config/lucky-draw-app/lucky-draw.db` |
| Gotcha riêng | `ELECTRON_RUN_AS_NODE=1` mặc định trong VS Code integrated terminal → app crash lúc mở, phải `Remove-Item Env:\ELECTRON_RUN_AS_NODE` hoặc chạy từ terminal ngoài | Không gặp gotcha này | Không tài liệu hoá riêng, xem theo macOS |

## Vì sao có nhiều khác biệt đến vậy

- **NVM/Python/Native build tools**: khác công cụ quản lý gói hệ điều hành (Homebrew vs installer
  `.exe` vs `apt`) — bản chất việc cần làm giống nhau (cài đúng version), chỉ khác cách gọi lệnh.
- **Port/tiến trình**: PowerShell không có lệnh tương đương `lsof`/`kill` 1 dòng gọn như Unix, cần
  `Get-NetTCPConnection` + `Stop-Process`; Windows cũng không đảm bảo `Ctrl+C` dọn sạch tiến trình
  con như `concurrently -k` làm được trên macOS/Linux.
- **`ELECTRON_RUN_AS_NODE`**: đặc thù cách VS Code khởi tạo integrated terminal trên Windows, không
  phải bug của project — xem chi tiết ở [run-dev.md](./run-dev.md) mục Windows bước 4.
- **Vị trí DB**: theo đúng convention `app.getPath("userData")` của Electron trên từng OS, không tự
  quyết định — xem `electron/db.ts`.

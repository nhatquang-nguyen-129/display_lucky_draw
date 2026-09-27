# Run dev — chạy app ở chế độ phát triển

Yêu cầu: đã làm xong [setup.md](./setup.md).

```bash
npm run electron:dev
```

Lệnh này: build main process (`build:electron` → `dist-electron/`) → khởi động Vite dev server
(`http://localhost:5173`) → mở Electron với `NODE_ENV=development` (tự bật DevTools, tiêu đề cửa sổ có
tiền tố `[dev]`). Dữ liệu dev lưu ở `<userData>/data/` (mỗi session 1 file) — vị trí: [testing.md](./testing.md#vị-trí-dữ-liệu).

## Quy tắc quan trọng

- **Sửa file trong `electron/` phải tắt rồi chạy lại** `npm run electron:dev` — main process không
  hot-reload, chỉ renderer (`src/`) mới có. Quên bước này thì app vẫn chạy nhưng dùng bản `main.js`/
  `preload.js` CŨ → lỗi kiểu `window.api.xxx is not a function` dù code nguồn đã đúng.
- Sau `npm install` hoặc đổi version Electron/Node → `npx electron-rebuild` trước khi chạy
  ([setup.md mục 5](./setup.md#5-rebuild-native-module-cho-electron)).

## Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| App thoát ngay, lỗi `TypeError: Cannot read properties of undefined (reading 'getPath')` tại `dist-electron/db.js` | Shell có biến `ELECTRON_RUN_AS_NODE=1` → Electron chạy như Node thường, `require("electron").app` là `undefined`. Hay gặp ở terminal/tiến trình do extension VS Code mở ra | Xoá biến rồi chạy lại (lệnh bên dưới), hoặc chạy từ Windows Terminal/PowerShell/Terminal độc lập ngoài VS Code |
| `NODE_MODULE_VERSION mismatch` / `compiled against a different Node.js version` | Chưa rebuild `better-sqlite3` sau khi cài | `npx electron-rebuild` |
| Vite báo port 5173 đang bận, hoặc Electron nối nhầm dev server cũ | Tiến trình dev lần trước còn sót | Giải phóng port (bên dưới) |
| Windows: `Ctrl+C` xong vẫn còn `electron.exe`/`node.exe` giữ port hoặc khoá `dist-electron/` | Windows không đảm bảo `Ctrl+C` dọn tiến trình con như `concurrently -k` làm được trên macOS/Linux | Tắt tay (bên dưới) |

**Xoá `ELECTRON_RUN_AS_NODE`**:

```powershell
# Windows PowerShell
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm run electron:dev
```

```bash
# macOS / Linux / Git Bash
unset ELECTRON_RUN_AS_NODE && npm run electron:dev
```

**Giải phóng port 5173 / tắt tiến trình còn sót**:

```powershell
# Windows PowerShell
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
taskkill /F /IM electron.exe 2>$null
taskkill /F /IM node.exe 2>$null
```

```bash
# macOS / Linux
lsof -ti:5173 | xargs kill -9
```

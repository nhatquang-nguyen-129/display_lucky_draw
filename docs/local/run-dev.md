# Chạy môi trường dev

`npm run electron:dev` build main process Electron, khởi động Vite dev server
(`http://localhost:5173`), rồi mở app kèm DevTools (chế độ development).

## Windows

1. **Giải phóng port 5173** nếu đang bị chiếm (Vite có thể chạy fail, hoặc Electron nối nhầm vào dev
   server cũ):

```powershell
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

2. **Rebuild native module** nếu vừa cài dependency, đổi version Node.js, đổi Electron, hoặc vừa cài
   lại sạch `node_modules` (xem [install-dependencies.md](./install-dependencies.md) mục 5):

```powershell
npx electron-rebuild
```

Bỏ qua bước này có thể gây lỗi `NODE_MODULE_VERSION mismatch` hoặc `The module was compiled against
a different Node.js version.`

3. **Chạy dev**:

```powershell
npm run electron:dev
```

4. **Nếu app thoát ngay lúc mở** với lỗi `TypeError: Cannot read properties of undefined (reading
   'getPath')` (ném ra tại `dist-electron/db.js`) — shell đang có biến `ELECTRON_RUN_AS_NODE=1`. Đây
   là mặc định trong **VS Code integrated terminal** và mọi terminal do 1 extension VS Code mở ra.
   Xoá biến rồi chạy lại:

```powershell
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm run electron:dev
```

   Hoặc đơn giản hơn: chạy `npm run electron:dev` từ 1 cửa sổ **Windows Terminal / PowerShell** độc
   lập thay vì terminal tích hợp của VS Code.

5. **Sửa file trong `electron/` phải tắt bật lại** `npm run electron:dev` — main process KHÔNG
   hot-reload (chỉ renderer mới có). Trên Windows, `Ctrl+C` không phải lúc nào cũng dừng hết tiến
   trình con — `electron.exe`/`node.exe` còn sót có thể giữ port 5173 hoặc khoá file trong
   `dist-electron/`. Tắt chúng trước khi chạy lại:

```powershell
taskkill /F /IM electron.exe 2>$null
taskkill /F /IM node.exe 2>$null
```

Vị trí file SQLite + cách reset dữ liệu: [database-and-testing.md](./database-and-testing.md).

## macOS

1. **Giải phóng port 5173** nếu đang bị chiếm:

```bash
lsof -ti:5173 | xargs kill -9
```

2. **Rebuild native module** nếu vừa cài dependency, đổi version Node.js, đổi Electron, hoặc vừa cài
   lại sạch `node_modules`:

```bash
npx electron-rebuild
```

Bỏ qua bước này có thể gây lỗi `NODE_MODULE_VERSION mismatch` hoặc `The module was compiled against
a different Node.js version.`

3. **Chạy dev**:

```bash
npm run electron:dev
```

4. **Sửa file trong `electron/` phải tắt bật lại** `npm run electron:dev` — main process KHÔNG
   hot-reload (chỉ renderer mới có). Dừng bằng `Ctrl+C` trên macOS thường dọn sạch cả tiến trình Vite
   lẫn Electron cùng lúc (`concurrently -k`) — không cần `taskkill` thủ công như Windows.

Vị trí file SQLite + cách reset dữ liệu: [database-and-testing.md](./database-and-testing.md). Xem
thêm [platform-differences.md](./platform-differences.md) để tra nhanh mọi khác biệt Windows/macOS
trong 1 bảng.

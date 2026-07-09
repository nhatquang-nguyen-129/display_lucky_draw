# Lucky Draw Studio

App desktop quay số trúng thưởng, chạy hoàn toàn local (Electron + React + SQLite).

## Đã có trong bản này

- **Module 1 — Dữ liệu**: nhập người chơi thủ công hoặc import CSV/Excel (`src/pages/Participants.tsx`).
  Kết nối Google Sheets mới có placeholder UI ở trang Cài đặt, chưa nối OAuth thật.
- **Module 2 — Engine quay số**: cấu hình trọng số giải, tạo phiên với 2 tuỳ chọn
  (cho phép trùng giải / loại người đã trúng), thuật toán weighted random ở
  `electron/drawEngine.ts`, ghi log seed để sau này đối chiếu.
- **Module 3 — Present mode**: cửa sổ trình chiếu riêng biệt (không phải drag-drop builder,
  đang là placeholder tĩnh — sẽ thay bằng canvas kéo thả ở giai đoạn sau như đã thống nhất).

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

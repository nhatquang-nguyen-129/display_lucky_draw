# Architecture — kiến trúc lõi Lucky Draw Studio

Tài liệu kiến trúc cross-cutting, áp dụng cho toàn bộ app (không riêng 1 tính năng). Tính năng cụ thể
xem [`docs/participants/`](../participants/README.md) (Data Editor/Import) và
[`docs/landing/`](../landing/README.md) (Landing Builder/Lucky Wheel/Effect). Setup máy + build xem
[`docs/local/`](../local/README.md) và [`docs/deploy/`](../deploy/README.md).

| File | Nội dung |
|---|---|
| [ipc-and-windows.md](./ipc-and-windows.md) | IPC 3 lớp bắt buộc đồng bộ, mô hình Session/Tab, kiến trúc đa cửa sổ (multi-window) |
| [database-schema.md](./database-schema.md) | Schema SQLite đầy đủ (4 bảng) + chiến lược migration |
| [draw-engine.md](./draw-engine.md) | Thuật toán chọn người trúng (`pickWinner`/`commitDraw`/`drawOne`), luật trùng lặp |
| [roadmap.md](./roadmap.md) | Hướng mở rộng đã đề cập nhưng chưa làm |

## Mục tiêu & ý tưởng sản phẩm

Lucky Draw Studio là app **desktop offline hoàn toàn** dùng để quay số trúng thưởng cho sự kiện (hội chợ, minigame Facebook, sự kiện nội bộ công ty...). Không có backend, không có cloud, không cần Internet lúc vận hành — mọi dữ liệu (participants, prizes, kết quả quay) nằm trong 1 file SQLite cục bộ trên máy người tổ chức.

Ý tưởng kiến trúc cốt lõi, xuất phát từ chính nhu cầu vận hành thực tế:

- **1 "phiên quay số" = 1 tab kiểu Chrome**, độc lập hoàn toàn về participants/prizes với các phiên khác. Lý do: 1 người tổ chức sự kiện thường chạy nhiều minigame/đợt quay khác nhau trong cùng 1 ngày (vd sáng quay khách hàng cũ, chiều quay khách hàng mới), không muốn dữ liệu 2 đợt lẫn vào nhau, và không muốn phải mở nhiều lần app.
- **Draw Engine tách biệt hoàn toàn khỏi Presentation Layer**. Việc "chọn ai trúng" (thuật toán random có trọng số, loại trừ theo luật) và việc "hiển thị lên màn hình cho khán giả xem" là 2 việc độc lập — Draw Engine không biết gì về UI, UI (Landing Page) chỉ đọc kết quả Draw Engine trả về, không bao giờ tự tính toán ai trúng.
- **Landing Page Builder kiểu "trình chiếu tuỳ biến"**: người tổ chức tự thiết kế màn hình trình chiếu (kéo-thả component, chỉnh màu/font/hiệu ứng) thay vì dùng 1 giao diện quay số cố định — vì mỗi sự kiện có branding/không khí khác nhau.
- **Data Editor như 1 trình soạn thảo bảng tính rút gọn** (giống Excel/Google Sheets thu nhỏ) ngay trong app, để người tổ chức không phải rời khỏi app để dọn dữ liệu participant trước khi quay.

Tech stack + lý do chọn từng công nghệ: xem `CLAUDE.md` mục "Định hướng công nghệ".

## Cấu trúc thư mục

```
electron/
  main.ts            # Main process — tạo BrowserWindow, đăng ký MỌI ipcMain.handle
  preload.ts          # contextBridge — "cửa" duy nhất renderer được phép gọi ra main process
  db.ts               # Kết nối SQLite + TOÀN BỘ migration (chạy tuần tự mỗi lần app khởi động)
  drawEngine.ts       # Thuật toán chọn người trúng (pickWinner/commitDraw/drawOne)

src/
  types.ts            # Participant/Prize/Session/DrawResultRow + khai báo type window.api
  context/SessionContext.tsx   # State "tab nào đang active" cho cửa sổ chính
  pages/              # 1 file = 1 route (Dashboard, Participants, Prizes, LandingPage...)
  components/
    DataEditorModal.tsx         # Component chính của Data Editor (rất lớn, xem docs/participants/data-editor.md)
    landing/
      componentRegistry.ts      # Nơi DUY NHẤT "nối dây" 1 loại component Landing vào Palette + Canvas
      LandingCanvas.tsx          # Bề mặt kéo-thả trong Builder (select/hand tool, zoom, resize, snap)
      LandingRenderer.tsx        # Painter thuần — dùng chung bởi Builder preview VÀ Present Mode
      LandingRulers.tsx          # Thước ngang/dọc kiểu Photoshop
      PropertiesPanel.tsx        # Panel bên phải Builder — switch theo type để render đúng form con
      useLandingData.ts          # Nguồn fetch/poll DUY NHẤT cho participants/prizes/kết quả quay
      useDrawSequence.ts          # Hook luồng Draw/Confirm/Redo (candidate đang chờ, chưa commit)
      useActiveReactions.ts       # Tính reaction (dim/scale/glow) nào đang active tại 1 thời điểm
      views/*.tsx                 # 1 file = cách VẼ 1 loại component (chỉ đọc props + data)
      panels/*.tsx                 # 1 file = form cấu hình của đúng loại component đó
      luckyWheelTemplates/*.tsx     # 2 "cách quay" của component luckyWheel (Wheel/Digit Roller)
  lib/
    landing/types.ts    # Kiểu dữ liệu trung tâm của Landing Page (LandingComponent union, v.v.)
    dataEditor/          # Kiểu dữ liệu + logic thuần (không JSX) của Data Editor — xem docs/participants/data-editor.md
      types.ts, commands.ts, validate.ts, transforms.ts, history.ts
```

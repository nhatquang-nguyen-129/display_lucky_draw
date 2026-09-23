# Landing Builder — tài liệu chi tiết

Đọc trước khi sửa bất kỳ gì trong `src/pages/LandingBuilderWindow.tsx`, `src/components/landing/`,
hoặc `src/lib/landing/types.ts`. Nội dung tách theo từng tính năng lớn để không phải load 1 file
khổng lồ khi chỉ cần sửa 1 phần:

| File | Nội dung |
|---|---|
| [canvas.md](./canvas.md) | Artboard 1920×1080, bàn nháp, zoom/pan, lưới, smart guide, toolbar & phím tắt |
| [properties-panel.md](./properties-panel.md) | `PropertiesPanel`/`SharedFields`, danh sách panel theo type, nhóm component trong Palette |
| [button-actions.md](./button-actions.md) | Button — action cố định (Draw/Confirm/Reset/Scoreboard/Open Link), 3 chế độ Draw (Single/Multiple/Quick) |
| [lucky-wheel.md](./lucky-wheel.md) | 2 template Lucky Wheel (Wheel Circular/Digit Roller), field validation cho Digit Roll |
| [prize.md](./prize.md) | Prize Image — click-to-select theo pixel alpha, 4 giai đoạn tương tác (Focus/Highlight/Motion), Spotlight (nón đáy elip + bóng đổ, 1 lựa chọn Highlight dùng được ở cả 4 giai đoạn) |
| [reactions.md](./reactions.md) | `EffectReaction` — hệ effect generic gắn theo trigger Draw/Confirm/Redo |
| [present-mode.md](./present-mode.md) | Pipeline render + Present Mode khác Builder canvas ở prop `interactive` như thế nào |
| [config-lifecycle.md](./config-lifecycle.md) | Save/Discard, lưu trữ `landing_config`, checklist thêm 1 loại component mới |
| [effects.md](./effects.md) | Trần đồ hoạ — 4 tier kỹ thuật hiệu ứng (CSS/Canvas 2D/WebGL/asset ngoài), khi nào dùng tier nào |

## 1. Tổng quan — 2 cửa sổ, 1 nguồn dữ liệu

Landing Builder và Present Mode là **2 cửa sổ Electron riêng biệt**, không dùng chung React state
(mỗi cửa sổ tự fetch/poll dữ liệu qua IPC):

- **Builder** (`#/landing-builder/:sessionId`, `LandingBuilderWindow.tsx`) — nơi dựng trang: kéo-thả
  component, chỉnh Properties Panel. Mở từ nút "Landing Builder" trên tab "Landing Page" của cửa sổ
  chính (`src/pages/LandingPage.tsx`). Singleton theo `sessionId` — mở lại khi đã có cửa sổ cùng
  session chỉ focus lại, không mở cửa sổ mới (`electron/main.ts`, `openLandingBuilderWindow`).
- **Present Mode** (`#/present/:sessionId`, `src/pages/PresentMode.tsx`) — màn hình thật chiếu cho
  khán giả xem, chỉ render (không sửa được gì). Mở từ `LandingPage.tsx` hoặc
  `DrawSessionDetail.tsx`. Tự poll `sessions:get` mỗi 2s để nhận Save mới nhất từ Builder mà không
  cần đóng/mở lại.

Cả 2 cửa sổ đọc/ghi **1 nguồn duy nhất**: cột `sessions.landing_config` (JSON, xem
[config-lifecycle.md](./config-lifecycle.md)). Cùng 1 hàm `LandingRenderer.tsx` được cả
`LandingCanvas` (Builder) lẫn `PresentMode` dùng để vẽ component — đảm bảo Builder và Present Mode
LUÔN khớp pixel-cho-pixel, không có 2 bộ code vẽ khác nhau dễ lệch nhau theo thời gian. Cả 3 nơi đọc
`landing_config` (Builder/Present Mode/`LandingPage.tsx` ở cửa sổ chính) đều tự lọc bỏ component có
`type` không còn tồn tại trong `COMPONENT_REGISTRY` ngay khi parse — an toàn cho landing đã lưu từ
trước khi 1 loại component bị xoá khỏi app.

## 2. Thêm 1 loại component mới

Xem checklist đầy đủ (4 bước) ở đầu `src/lib/landing/types.ts`. Tóm tắt: 1) thêm type + interface
vào union `LandingComponent`; 2) thêm `views/XxxView.tsx`; 3) thêm `panels/XxxPanel.tsx`; 4) đăng ký
trong `componentRegistry.ts` (label, category cho Palette). Chi tiết đầy đủ về vòng đời config +
checklist này: [config-lifecycle.md](./config-lifecycle.md).

## 3. File liên quan

| File | Vai trò |
|---|---|
| `src/pages/LandingBuilderWindow.tsx` | Cửa sổ Builder — toolbar, Save/Discard |
| `src/pages/PresentMode.tsx` | Cửa sổ chiếu cho khán giả — chỉ render, poll config mỗi 2s |
| `src/components/landing/LandingCanvas.tsx` | Artboard 1920×1080 — chọn/kéo/resize/pan/zoom |
| `src/components/landing/LandingRenderer.tsx` | Painter thuần — dùng chung bởi Canvas lẫn Present Mode, switch theo `component.type` |
| `src/components/landing/PropertiesPanel.tsx` | Container Properties Panel — switch theo type + `SharedFields` |
| `src/components/landing/componentRegistry.ts` | `COMPONENT_REGISTRY` — nguồn DUY NHẤT cho Palette/canvas |
| `src/components/landing/ComponentPalette.tsx` | Menu "Add component" — kéo-thả tạo instance mới, gom nhóm theo `CATEGORY_ORDER` |
| `src/components/landing/componentIcons.tsx` | Icon dùng cho Palette |
| `src/components/landing/useDrawSequence.ts` | `pick()`/`confirm()`/`redo()`/`resetSession()`/... — cầu nối duy nhất từ Landing sang Draw Engine |
| `src/components/landing/views/ButtonView.tsx` | Chạy action của Button — xem [button-actions.md](./button-actions.md) |
| `src/lib/landing/types.ts` | Toàn bộ type hệ thống + checklist thêm component mới |

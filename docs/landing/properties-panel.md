# Properties Panel & nhóm component

## Properties Panel

`PropertiesPanel.tsx` là 1 switch thuần: chưa chọn gì → `BackgroundPanel` (nền trang); có chọn → 1
Panel riêng theo đúng `type` của component + `SharedFields.tsx` luôn hiện ở cuối.

`SharedFields.tsx` — dùng chung cho MỌI loại: **X/Y/Width/Height** (Height khoá "auto" nếu là Lucky
Wheel dùng template Digit Roller — chiều cao tự tính theo `digitCount`), **Effect** (fade/slide/pulse/
bounce khi component xuất hiện), nút **Delete component**.

| Panel file | Dùng cho |
|---|---|
| `BackgroundPanel.tsx` | Nền trang (khi chưa chọn component nào) |
| `TextPanel.tsx` | Text |
| `ImagePanel.tsx` | Image |
| `LuckyWheelPanel.tsx` | Lucky Wheel (cả 2 template `wheel`/`digitRoller`) |
| `LiveTextPanel.tsx` | Winner |
| `LiveImagePanel.tsx` | Prize |
| `CurrentTimePanel.tsx` | Current Time |
| `ParticipantCountPanel.tsx` | Participant Count |
| `ButtonPanel.tsx` | Button (chọn action + styling, xem [button-actions.md](./button-actions.md)) |
| `ScoreboardPanel.tsx` | Scoreboard |
| `FireworkPanel.tsx` | Firework |

## Nhóm component (`ComponentPalette.tsx`)

Menu "Add component" gom nhóm theo `CATEGORY_ORDER` (`componentRegistry.ts`) — chỉ hiện icon + tên
mỗi dòng (mô tả đầy đủ xem qua tooltip hover), giúp tìm nhanh thay vì cuộn qua 1 danh sách phẳng dài.

| Nhóm | Component | Mô tả |
|---|---|---|
| **Basic** | Text | Nhãn/tiêu đề tĩnh |
| | Image | Logo, banner, ảnh trang trí |
| **Draw & Results** | Lucky Wheel | Vòng quay/Digit Roller gắn với Draw Engine — xem [lucky-wheel.md](./lucky-wheel.md) |
| | Winner | Tên người trúng gần nhất |
| | Prize | Ảnh giải vừa trúng gần nhất |
| | Scoreboard | Bảng người trúng đã confirm, hiện qua popup |
| **Live Info** | Current Time | Đồng hồ thời gian thực |
| | Participant Count | Số người tham gia trong session |
| **Interactive** | Button | Chạy 1 action cố định khi bấm ở Present Mode, xem [button-actions.md](./button-actions.md) |
| **Effects** | Firework | Pháo hoa thưa/nhẹ, gắn 1 giải cụ thể — bắn trong đúng khung của nó lúc giải đó vừa được công bố |

`COMPONENT_REGISTRY` (`componentRegistry.ts`) là nguồn DUY NHẤT "nối dây" 1 loại component vào cả
Palette lẫn Canvas (tạo instance mặc định khi thả) — xem checklist thêm component mới ở
[config-lifecycle.md](./config-lifecycle.md).

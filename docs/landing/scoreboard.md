# Scoreboard (`scoreboard`) — nhóm Draw

Bảng người trúng **đã Confirm**, hiện như 1 cửa sổ phụ giữa màn hình khi bấm Button **Scoreboard**.
**Tối đa 1 cái/trang**. Mặc định 420×520.

## Properties Panel (`ScoreboardPanel.tsx`)

Chỉ có **Basic options** (hiện/ẩn do Button điều khiển từ bên ngoài, không phải cấu hình của chính
component):

| Field | Prop | Mặc định | Ghi chú |
|---|---|---|---|
| Title | `title` | "Winners" | Luôn căn giữa thanh tiêu đề |
| Bar color | `titleBarColor` | `#2244A5` | Nền thanh tiêu đề (Name Bar) |
| Title text color | `headerColor` | `#FFFFFF` | Chữ + nút ✕ trên Name Bar |
| Font size | `fontSize` | 16 | Chữ trong bảng; tiêu đề = ×1.1 |
| Text color | `color` | `#14161C` | Cả tiêu đề cột lẫn giá trị |
| Table background | `backgroundType` | color | None / Color / Image — nền của khung bảng, độc lập Name Bar |
| Background color / Image + Fit | `backgroundColor` / `backgroundImageDataUrl` + `backgroundImageFit` | `#FFFFFF` / — | Ảnh nhận PNG, JPG |
| Columns | `columns` | Name, Prize | Dropdown chọn nhiều (`ColumnsDropdown`) |

**Columns**: 6 field cố định (`SCOREBOARD_FIELDS`: Name, Code, Phone, Email, Prize, Category) + mọi cột
`extra_data` đang tồn tại trong session (nhánh 1 của quy tắc Source — liệt kê hết, không lọc Data Type,
không có tiêu chí phụ). Dropdown hiện tên cột đang chọn; bấm mở danh sách có dấu tick, bấm 1 dòng để
bật/tắt (danh sách vẫn mở để chọn tiếp), bấm ra ngoài hoặc Esc để đóng. Thứ tự cột luôn là thứ tự cố
định + cột optional theo sau.

## Hành vi

- **Present Mode**: không vẽ trong vòng lặp component thường; khi `sequence.scoreboardVisible` bật thì
  vẽ canh giữa toàn canvas, nền tối phía sau, kích thước = width/height đã kéo (x/y bỏ qua). Đóng bằng
  ✕, Esc, hoặc bấm lại Button Scoreboard. Quick Draw xong tự mở.
- **Builder**: vẽ tại chỗ theo x/y như mọi component để khung kéo-thả khớp nội dung thật.
- `TableTemplate.tsx`: giao diện kiểu cửa sổ Windows — Name Bar (grid 3 cột để title đúng tâm dù có nút
  ✕ bên phải) + bảng CSS Grid, hàng tiêu đề cột `sticky` khi cuộn (nền đục: màu nền khung nếu Color,
  trắng gần đục nếu Image/None), hàng xen kẽ tô nhạt. Chưa ai trúng → "No winners yet".
- **Chỉ người đã Confirm**: lọc bỏ dòng `pending-*` (candidate chưa Confirm).
- Giá trị ô (`valueOf`): Name/Code/Phone/Email/Prize đọc thẳng từ `DrawResultRow` (đã resolve theo Data
  Type ở server); Category tra `data.prizes`; cột optional tra `extra_data` của participant. Thiếu → "—".
- **Template**: hiện chỉ có `"table"`. Thêm template = giá trị mới trong `ScoreboardTemplate` + 1 file
  trong `scoreboardTemplates/` + 1 case ở `ScoreboardView.tsx` (cùng kiểu Lucky Wheel).
- **Tương thích ngược**: config cũ chỉ có `showPrizeName`/`backgroundColor` phẳng — `normalizeProps()`
  (lặp y hệt ở view và panel) suy ra cột/màu mặc định thay vì crash.

**Bug đã sửa**: Scoreboard từng luôn báo "⚠ Column not found" oan cho 6 field mặc định —
`missingColumnBindings` đối chiếu cả khoá cố định (`participantName`…, resolve từ `DrawResultRow`) với
tên cột Participant thật (`name`…), 2 hệ tên không bao giờ trùng. Giờ bỏ qua 6 field đó, chỉ kiểm cột
optional.

## File liên quan

`src/lib/landing/types.ts` (`ScoreboardProps`, `SCOREBOARD_FIELDS`, `getScoreboardFieldLabel`),
`views/ScoreboardView.tsx` (dispatcher), `scoreboardTemplates/TableTemplate.tsx`,
`panels/ScoreboardPanel.tsx`, `LandingRenderer.tsx` (overlay), `button.md` (action Scoreboard).

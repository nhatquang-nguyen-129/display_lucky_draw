# Winner (`winnerName`) — nhóm Draw

Tên người trúng của lượt quay hiện tại. Mặc định 500×80. Khác Text/Image: nội dung **đổi theo từng
lượt** (tên mỗi lần một khác, lúc Idle chưa có ai để hiện), nên KHÔNG dùng model Interactions with Draw
chung (`DrawCycleFields`) mà có cơ chế riêng `useRevealed` + `useRevealTransition`
(`drawRevealHooks.ts`) — và sẽ KHÔNG migrate sang model chung.

## Properties Panel (`LiveTextPanel.tsx`)

**Basic options**: Font size (40), Color (`#FFCA2D`), Weight (bold), Align (center), **Source**, rồi
X/Y/Width/Height (Position gộp vào đây, ẩn Effect entrance chung).

- **Source** (`nameSourceColumn`): cột nào dùng làm tên — nhánh 2 của quy tắc Source
  ([builder.md mục 7](../builder.md#dropdown-source-chọn-cột-participant--đúng-1-trong-2-nhánh)): chỉ các cột
  đang gán Data Type = **Name** và còn dữ liệu, luôn hiện kể cả chỉ có 1 lựa chọn; rỗng → select
  disabled "Set a column's Data Type to Name first.". Cần khi session có nhiều cột Name (vd "Tên người
  chơi" và "Tên người thân") và muốn 2 khung Winner hiện 2 cột khác nhau. Trống = đọc
  `participant_name` đã resolve sẵn ở server. Đã chọn rồi mà Data Type đổi sau đó thì vẫn đọc đúng cột
  đó (chỉ lọc lúc chọn).

**Self Interactions** → **Quick Draw** → **Quick Draw text** (`quickDrawText`, mặc định
"Congratulations!"): hiện THAY tên người trúng sau khi 1 Quick Draw chạy xong (Quick Draw ra nhiều người
cùng lúc, không có 1 tên "đúng" nào) — xem [button.md](./button.md#3-chế-độ-draw-single--multiple--quick).

**Interactions with Draw** — LUÔN bật (không có checkbox, component chỉ tồn tại để phản ứng theo Draw),
3 mục cùng khuôn giao diện với `DrawCycleFields` (Effect + Delay cùng 1 hàng, nhãn tóm tắt bên phải
tiêu đề) nhưng schema khác:

| Mục | Appearance | Effect / Delay | Ý nghĩa |
|---|---|---|---|
| **Idle** | `idleState`: Disappear (mặc định) / Appear | `idleEffect` / `idleDelayMs` | Chỉ tác dụng khi **Reset**. Disappear = ẩn tên (sau Delay, bằng Effect riêng — khác Redraw vì Reset là sự kiện khác). Appear = GIỮ tên đang hiện qua Reset (Effect/Delay bị khoá) |
| **Draw** | Cố định Appear (disabled) | `appearEffect` / `appearDelayMs` | Hiện tên mới |
| **Redraw** | Cố định Disappear (disabled) | `disappearEffect` / `disappearDelayMs` | Ẩn tên cũ khi có lượt mới |

Effect (`WinnerTransitionEffect`): None / Crossfade / Slide Up / Slide Down / Zoom. Mặc định None.

## 3 trạng thái — `useRevealed`

1. **Idle** (chưa Draw lần nào): không hiện gì, không delay nào áp dụng. Mở lại landing LUÔN bắt đầu
   rỗng (khởi tạo `{ text: "", phase: null }`), bất kể `idleState` — đúng quyết định "Landing luôn mở
   ở Idle, không khôi phục winner cũ".
2. **Draw lần đầu**: giữ rỗng tới đúng `appearDelayMs` kể từ lúc bấm Draw (resultId LIVE đổi), rồi
   `appearEffect` hiện tên.
3. **Redraw** (đang hiện tên lượt trước) — CHUỖI tuần tự: tên cũ đứng yên tới `disappearDelayMs` →
   `disappearEffect` ẩn nó → chờ thêm **1s cố định** (`MIN_REDRAW_REVEAL_GAP_MS`) → thêm `appearDelayMs`
   → tên mới hiện. Trước đây 2 mốc đo độc lập cùng gốc, `appearDelayMs` nhỏ khiến tên mới hiện đè lúc
   tên cũ còn đang ẩn dở (đã sửa).

Người dùng tự canh `appearDelayMs` cho khớp lúc Lucky Wheel quay xong (model cũ tự tính theo thời lượng
Wheel — `computeWheelRevealDelayMs` — đã bỏ cho Winner vì không tính đúng tuyệt đối cho mọi kiểu quay
của Digit Roller).

**Chi tiết kỹ thuật**:
- Tên (`value`) chỉ được đọc ĐÚNG lúc timer chạy (qua closure), không hiện ngay dù nguồn đã đổi lúc bấm
  Draw — tránh "flash" tên mới vào chỗ tên cũ trước khi Disappear kịp chạy.
- **Reset ép về Idle bằng 1 tín hiệu tường minh**: `resetSeq` đổi → phát hiện trong render (ghi vào
  ref), xử lý thật trong `useEffect` khoá theo `fireKey` (ghép `resultId`/`resetSeq`) — không
  setState-trong-render. Bản trước suy luận "có phải Reset không" bằng cách so `resetSeq` tách rời khỏi
  lúc `text` đổi → lệch nhịp, Reset bị dùng nhầm hiệu ứng của Redraw (đã sửa). `idleState = "appear"`
  thì bỏ qua hẳn bước này.
- `useRevealed` trả `{ text, phase }` (`phase`: `"idle" | "draw" | "redraw" | null`) cập nhật trong CÙNG
  1 setState — `useRevealTransition` đọc thẳng `phase === "idle"` để chọn `idleEffect`/`idleDelayMs`
  thay vì `disappearEffect`, không bao giờ lệch nhịp.
- `useRevealTransition` vẽ 2 lớp chữ chồng nhau trong lúc chuyển (lớp cũ class "-out", lớp mới "-in");
  khi text mới là chuỗi rỗng (Idle/Reset) thì không giữ lớp cũ chờ hết `TRANSITION_MS`.
- **Builder canvas** hiện chữ giữ chỗ "Winner" (không để trống — khó nhận ra khung để chọn); preview ở
  cửa sổ chính và Present Mode giữ trạng thái ẩn/hiện thật.
- Không nằm trong `REMOUNT_ON_RESULT_TYPES` — remount sẽ huỷ ngay lớp tên cũ, không còn cơ hội chạy
  Disappear.

## File liên quan

`src/lib/landing/types.ts` (`WinnerNameProps`, `LiveTextProps`, `WinnerTransitionEffect`),
`views/WinnerNameView.tsx`, `views/drawRevealHooks.ts` (`useRevealed`, `useRevealTransition`),
`panels/LiveTextPanel.tsx`, `landingEffects.css`.

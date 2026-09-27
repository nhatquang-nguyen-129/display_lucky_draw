# Background (`background`) — nhóm Basic

Ảnh nền của trang. **Tối đa 1 cái/trang**. Mặc định phủ kín 1920×1080 nhưng kéo/resize tự do như
Image. Phần canvas không được Background phủ tới LUÔN là **màu đen** cố định (`LandingRenderer`), không
có cấu hình màu nền/letterbox riêng.

## Vì sao là 1 component

Trước đây nền là thiết lập toàn cục của trang ("Page settings": màu nền hoặc ảnh nền, kèm "Dim
background while Revealed"). Đã đổi thành 1 component bình thường để: thêm/chỉnh qua Add component +
Properties Panel như mọi thứ khác; dùng chung "Interactions with Draw" với Image/Text thay vì 1 tính
năng dim riêng; và tách type riêng khỏi Image để sau này thêm **video** mà không đụng Image.

Landing lưu ảnh nền kiểu cũ (`canvas.background` type image) tự migrate thành 1 Background phủ kín
canvas, id `bg-migrated`, `zIndex: -1` (`migrateLegacyBackground` trong `types.ts`). Nền kiểu "color"
cũ không migrate — canvas tự đen.

## Properties Panel (`BackgroundPanel.tsx`)

**Basic options**

| Field | Prop | Mặc định | Ghi chú |
|---|---|---|---|
| Image (PNG, JPG) | `srcDataUrl` | trống | Nhận PNG và JPEG |
| Fit | `fit` | cover | cover / contain / stretch. Không có Border radius (nền không cần bo góc) |

**Self Interactions** — tiêu đề giữ sẵn chỗ, chưa có mục nào.

**Interactions with Draw** — `DrawCycleFields` với đủ 4 Appearance **Appear/Disappear/Dim/Blur**.
Model đầy đủ: [presentation.md mục 4](../presentation.md#4-interactions-with-draw--model-idledrawredraw).

## Hành vi

- Disappear = ẩn hẳn ảnh, lộ màu đen canvas. Dim = 1 lớp phủ đen opacity dim% (mặc định 80%), Blur =
  `filter: blur(px)` (mặc định 16px); cả 2 chuyển mượt 500ms bằng CSS transition, không cần lớp
  "-in"/"-out" như trục Appear/Disappear.
- Cách dùng phổ biến: Idle = Appear, Draw = Dim → nền tối đi lúc công bố người trúng cho nội dung
  chính nổi lên.
- Builder canvas luôn hiện ảnh "sạch".

## File liên quan

`src/lib/landing/types.ts` (`BackgroundProps`, `migrateLegacyBackground`,
`DEFAULT_BACKGROUND_DIM_AMOUNT`/`BLUR_AMOUNT`), `views/BackgroundView.tsx`,
`panels/BackgroundPanel.tsx`, `panels/DrawCycleFields.tsx`.

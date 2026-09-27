# Image (`image`) — nhóm Basic

Ảnh PNG tĩnh: logo, banner, ảnh trang trí (vd Podium). Mặc định 300×300. Ảnh lưu base64 thẳng trong
`landing_config` (`srcDataUrl`), giống cách trang Prizes lưu `display_image`.

## Properties Panel (`ImagePanel.tsx`)

**Basic options**

| Field | Prop | Mặc định | Ghi chú |
|---|---|---|---|
| Image (PNG) | `srcDataUrl` | trống | Chỉ nhận `image/png` (giữ nền trong suốt). Chưa có ảnh → khung hiện "No image" |
| Fit | `fit` | cover | cover / contain / stretch (`object-fit: fill`) |
| Border radius | `borderRadius` | 0 | px |

**Interactions with Draw** — `DrawCycleFields` với đủ 4 Appearance **Appear/Disappear/Dim/Blur**
(Dim/Blur có thêm **Amount**: Dim % mặc định 80, Blur px mặc định 16). Tắt (mặc định) = ảnh tĩnh luôn
hiện. Model đầy đủ: [presentation.md mục 4](../presentation.md#4-interactions-with-draw--model-idledrawredraw).

## Hành vi

- Dim/Blur vẽ bằng CSS `filter: brightness(1 − dim%) blur(px)` thẳng lên `<img>` (chuyển mượt 500ms) —
  KHÔNG dùng lớp phủ đen như Background, vì PNG trong suốt sẽ bị tô đen thành 1 khung chữ nhật.
  `brightness(1 − dim%)` cho đúng màu của lớp phủ đen opacity dim% trên phần ảnh đặc.
- Builder canvas luôn hiện ảnh "sạch" (appear) để còn chọn/kéo.
- Dùng khi 1 ảnh PNG cần tự ẩn/hiện/tối đi theo quy trình quay mà không cần tạo loại component riêng —
  vd Podium tách khỏi Background để không bị dim theo nền: Idle = Appear, Draw = Disappear, Redraw =
  Disappear (tự hiện lại bằng Effect của Draw).
- Khác **Prize**: Image không gắn giải nào, không click chọn được.

## File liên quan

`src/lib/landing/types.ts` (`ImageProps`), `views/ImageView.tsx`, `panels/ImagePanel.tsx`,
`panels/DrawCycleFields.tsx`.

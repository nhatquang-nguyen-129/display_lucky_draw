# Text (`text`) — nhóm Basic

Nhãn/tiêu đề tĩnh do người dựng trang tự gõ. Mặc định 400×80.

## Properties Panel (`TextPanel.tsx`)

**Basic options**

| Field | Prop | Mặc định | Ghi chú |
|---|---|---|---|
| Content | `content` | "Click to select, edit in the panel" | Textarea, giữ xuống dòng (`white-space: pre-wrap`) |
| Font size | `fontSize` | 32 | px artboard |
| Color | `color` | `#FFFFFF` | `ColorField` |
| Weight | `fontWeight` | normal | normal / bold |
| Align | `align` | left | left / center / right |

**Interactions with Draw** — `DrawCycleFields` với domain **Appear/Disappear** (không có Dim/Blur).
Tắt (mặc định) = luôn hiện. Model đầy đủ: [presentation.md mục 4](../presentation.md#4-interactions-with-draw--model-idledrawredraw).

## Hành vi

- `TextView.tsx`: `visible = !syncWithDraw || builderPreview || shown` — Builder canvas luôn hiện để
  còn chọn/kéo; Present Mode theo chu trình Idle/Draw/Redraw.
- Khác **Winner**: `content` là chuỗi TĨNH, nên dùng chung model hiện/ẩn với Image/Background thay vì
  cơ chế riêng của Winner (tên người trúng đổi theo từng lượt).
- Dùng khi cần 1 dòng chữ chỉ xuất hiện lúc công bố (vd "Chúc mừng!" với Idle = Disappear, Draw =
  Appear), hoặc 1 tiêu đề chỉ hiện đúng khi quay ra 1 giải cụ thể (dropdown Prize).

## File liên quan

`src/lib/landing/types.ts` (`TextProps`), `views/TextView.tsx`, `panels/TextPanel.tsx`,
`panels/DrawCycleFields.tsx`, `views/drawRevealHooks.ts` (`useDrawCycleVisibility`).

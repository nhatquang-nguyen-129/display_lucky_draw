# Current Time (`currentTime`) — nhóm Live

Đồng hồ thời gian thực. Mặc định 200×50.

## Properties Panel (`CurrentTimePanel.tsx`)

Chỉ có **Basic options** (không phản ứng theo Draw):

| Field | Prop | Mặc định | Ghi chú |
|---|---|---|---|
| Format | `format` | 24h | 24-Hour / 12-Hour (AM/PM) |
| Font size | `fontSize` | 28 | px |
| Color | `color` | `#FFFFFF` | `ColorField` |
| Align | `align` | center | left / center / right |

## Hành vi

`CurrentTimeView.tsx` cập nhật mỗi 1s bằng `setInterval` (dọn khi unmount), hiển thị
`toLocaleTimeString(undefined, { hour12 })` — định dạng giờ theo locale của máy đang chạy, font
monospace để chữ số không nhảy độ rộng. Chạy cả trong Builder canvas.

## File liên quan

`src/lib/landing/types.ts` (`CurrentTimeProps`), `views/CurrentTimeView.tsx`,
`panels/CurrentTimePanel.tsx`.

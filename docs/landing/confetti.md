# Confetti (`confetti`) — nhóm Effects

Tier 2 (Canvas 2D). Cấu trúc, 2 họ kỹ thuật, quy ước panel dùng chung cho cả nhóm: [builder.md → Khuôn chung của nhóm Effects](./builder.md#khuôn-chung-của-nhóm-effects).

Pháo giấy: mảnh chữ nhật (60%) / tròn (20%) / dải ruy băng (20%) bung ra rồi rơi lả tả, vừa rơi vừa
lật + lắc ngang. Cùng khuôn Fireworks (`createShow()` step/draw tách rời, `seededRng`, deps theo
`JSON.stringify(props)` — [fireworks.md](./fireworks.md#kiến-trúc-createshow)).

## Vật lý & cách vẽ

- Giấy nhẹ, cản gió lớn: bắn rất nhanh (`sides` 2000–3600 px/s, `center` 700–2000 px/s) nhưng drag
  tuyến tính mạnh (`v *= e^(−2.2·dt)`) ăn gần hết đà ngay — quãng bay ≈ `v/2.2`. Trọng lực 900 px/s²,
  vận tốc rơi bị GHIM ở tốc độ giới hạn riêng từng mảnh (110–200 px/s) → rơi đều, chậm, không nhanh
  dần như vật nặng.
- Lắc ngang: `x += sin(sway)·swayAmp` (20–70 px/s, 1.5–4 rad/s) — cộng thẳng vào vị trí, không qua
  vận tốc, nên không bị drag triệt tiêu.
- Lật 3D giả: `setTransform(cos, sin, −sin·open, cos·open, x, y)` với `open = cos(flip)` = xoay trong
  mặt phẳng rồi co trục y → mảnh lật quanh trục của chính nó. Mặt càng nghiêng (`|open|` nhỏ) phủ
  thêm lớp đen alpha tới 0.45 → thấy rõ mặt sáng/tối khi lật, không cần WebGL.
- Không dùng `lighter`/glow (khác Orbit Lights/Fireworks) — giấy không tự phát sáng, vẽ `source-over`
  màu đặc để vẫn rõ trên nền sáng.
- Nguồn bắn: `top` rải x ngẫu nhiên phía trên mép trên; `center` từ (50%, 62%) chùm hướng lên ±55°;
  `sides` từ 2 góc dưới (2%/98%), nghiêng vào giữa 15–50°, chia đôi số mảnh mỗi bên.
- Once/Loop: `center`/`sides` once = đúng 1 đợt lúc mount, loop = 1 đợt mỗi `intervalMs`. `top` once
  = rải đúng `pieceCount` mảnh trong 2.5s (`RAIN_WAVE_S`) rồi thôi, loop = rải liên tục cùng mật độ.
- Khung tĩnh Builder: mô phỏng trước 0.9s (bung từ dưới — chụp lúc mảnh đang lơ lửng) hoặc 4.5s
  (`top` — đủ để mảnh rải xuống quá nửa khung).

## Props (Basic options)

| Field | Panel | Mặc định | Ghi chú |
|---|---|---|---|
| `launchFrom` | Launch from | `sides` | Top (rain) / Center / Both sides |
| `playMode` | Play | `loop` | Once / Loop. Mặc định Loop vì Once khi chưa bật Trigger with Draw chỉ bung 1 đợt lúc mở Present Mode rồi thôi — dễ tưởng lỗi |
| `pieceCount` | Pieces | 150 | 10–600 mảnh mỗi đợt (Top: mỗi 2.5s) |
| `pieceSize` | Piece size | 18 | px, cạnh dài mảnh chữ nhật; từng mảnh ±25% |
| `intervalMs` | Interval (ms) | 3000 | CHỈ hiện khi Loop + Center/Both sides |
| `colors` | Colors | teal/vàng/hồng/trắng | 1–6 màu, nút × xoá / "+ Add color" |

Interactions with Draw: y hệt Orbit Lights ([orbit-lights.md](./orbit-lights.md#interactions-with-draw)). Cách dùng hợp nhất: Play = **Once** + Idle =
Disappear, Draw = Appear → mỗi lần công bố người trúng bung đúng 1 đợt (component mount lại mỗi lần
Appear nên đợt mới luôn bắt đầu từ đầu).

## File liên quan

| File | Vai trò |
|---|---|
| `src/lib/landing/types.ts` | `ConfettiProps`/`ConfettiComponent`/`ConfettiLaunchFrom` |
| `src/components/landing/views/ConfettiView.tsx` | `createShow()` + ẩn/hiện theo Draw + rAF |
| `src/components/landing/panels/ConfettiPanel.tsx` | Basic options + Interactions with Draw |
| `src/components/landing/views/seededRng.ts` | RNG có seed dùng chung với Fireworks |
| `componentRegistry.ts` / `componentIcons.tsx` | Entry `confetti` (category `"Effects"`) / `ConfettiIcon` |

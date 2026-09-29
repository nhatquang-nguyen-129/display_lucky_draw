# Marquee Lights (`marqueeLights`) — nhóm Effects

Tier 2 (Canvas 2D). Cấu trúc, 2 họ kỹ thuật, quy ước panel dùng chung cho cả nhóm: [builder.md → Khuôn chung của nhóm Effects](./builder.md#khuôn-chung-của-nhóm-effects).

Hàng bóng đèn chạy quanh viền khung (chữ nhật bo góc) như bảng hiệu sân khấu/máy quay thưởng. Cùng
khuôn Orbit Lights: sáng/tắt từng bóng là hàm THUẦN của (chỉ số bóng, thời gian), không có trạng thái
mô phỏng → 1 hàm `drawFrame` cho cả khung tĩnh Builder (`elapsedMs = 0`) lẫn rAF; `startRef` giữ nhịp
qua các lần poll config 2s.

## Hình học & cách vẽ

- Đường đặt bóng = viền khung lùi vào `bulbSize × 3` (đủ chỗ quầng sáng, không bị canvas cắt), bo góc
  `cornerRadius` (tự kẹp ≤ nửa cạnh ngắn). `perimeterPoints()` ghép 4 cạnh + 4 cung 1/4 tròn, chia
  đều `count` điểm theo độ dài thật — góc bo vẫn đều khoảng cách như cạnh thẳng.
- `count = round(chu vi / spacing)` làm tròn về số CHẴN — `alternate` khép kín vòng (bóng cuối và bóng
  đầu không cùng pha). `spacing` chỉ là khoảng cách MONG MUỐN, thực tế co giãn nhẹ để chia đều.
- Quầng sáng: vẽ SẴN 1 lần/màu/kích thước vào canvas phụ (radial gradient: lõi trắng → đúng màu →
  mờ dần ra ngoài, `spriteCache`) rồi `drawImage` + `lighter` mỗi khung hình — rẻ hơn hẳn
  `shadowBlur`/gradient × hàng trăm bóng × 60fps.
- 2 lớp: kính bóng lúc tắt (màu đặc alpha 0.22, vẽ cho MỌI bóng) → sprite quầng sáng alpha = độ sáng.
- Màu bóng thứ i = `colors[i % length]` → 2+ màu xen kẽ dọc viền.

## Pattern (`brightness(pattern, i, phase)`, `phase = elapsedMs / stepMs`)

- `chase`: cứ 3 bóng sáng 1, "đầu" tiến theo chiều kim đồng hồ 1 bóng/nhịp, kéo đuôi mờ dần 2 bóng
  phía sau (độ sáng 1 → 0.5 → 0, nội suy liên tục theo phase nên chạy mượt, không giật từng nấc).
- `alternate`: bóng chẵn/lẻ đổi nhau mỗi nhịp (bật/tắt dứt khoát kiểu bảng hiệu cổ).
- `twinkle`: mỗi bóng có pha lệch riêng (hash theo chỉ số bóng), mỗi "nhịp riêng" dài 2 nhịp chung,
  ~45% bóng được chọn sáng lên rồi tắt dần theo nửa sóng sin — lấp lánh rải rác, không đồng loạt.
  Hash thuần `sin(a·12.9898 + b·78.233)` → không cần state, khung tĩnh vẫn ổn định.

## Props (Basic options)

| Field | Panel | Mặc định | Ghi chú |
|---|---|---|---|
| `pattern` | Pattern | `chase` | Chase / Alternate / Twinkle |
| `stepMs` | Step (ms) | 120 | ms mỗi nhịp, nhỏ = nhanh, tối thiểu 30 |
| `bulbSize` | Bulb size | 10 | Bán kính bóng (px) |
| `spacing` | Spacing | 44 | Khoảng cách mong muốn giữa 2 tâm bóng (px), tối thiểu 2.5× bulbSize |
| `cornerRadius` | Corner radius | 0 | Bo góc đường viền (px) — tăng lên khi đóng khung Lucky Wheel tròn/ảnh bo góc |
| `colors` | Colors | vàng `#FFCA2D` + trắng | 1–6 màu xen kẽ dọc viền |

Interactions with Draw: y hệt Orbit Lights ([orbit-lights.md](./orbit-lights.md#interactions-with-draw)). Cách dùng: kéo khung ôm sát Lucky Wheel/Prize để đóng
khung, hoặc để mặc định phủ cả canvas thành viền màn hình.

## File liên quan

| File | Vai trò |
|---|---|
| `src/lib/landing/types.ts` | `MarqueeLightsProps`/`MarqueeLightsComponent`/`MarqueePattern` |
| `src/components/landing/views/MarqueeLightsView.tsx` | `perimeterPoints()` + `brightness()` + `drawFrame()` + ẩn/hiện theo Draw |
| `src/components/landing/panels/MarqueeLightsPanel.tsx` | Basic options + Interactions with Draw |
| `componentRegistry.ts` / `componentIcons.tsx` | Entry `marqueeLights` (category `"Effects"`) / `MarqueeLightsIcon` |

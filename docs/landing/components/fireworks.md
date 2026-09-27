# Fireworks (`fireworks`) — nhóm Effects

Tier 2 (Canvas 2D). Cấu trúc, 2 họ kỹ thuật, quy ước panel dùng chung cho cả nhóm: [builder.md → Khuôn chung của nhóm Effects](../builder.md#khuôn-chung-của-nhóm-effects).

Pháo hoa 2 pha bắn LIÊN TỤC: quả pháo bay lên kéo vệt → tới đỉnh nổ thành chùm tia toả tròn → tia rơi
theo trọng lực, tắt dần, ~1/3 tia rơi tàn kiểu "willow". Viết lại vật lý từ `FireworksView.tsx` cũ (gỡ
cùng Trigger Graph — `git show a39d07a:src/components/landing/views/FireworksView.tsx`), bỏ cơ chế
Play/Stop/loop/duration, thay bằng khuôn Orbit Lights (luôn chạy ở Present Mode + Trigger with Draw).

## Kiến trúc `createShow()`

- Trạng thái (rockets/sparks/embers) nằm trong closure; `step(dt)` cập nhật vật lý, `draw(ctx)` chỉ
  vẽ — tách rời để khung tĩnh Builder = **mô phỏng trước 3.2s** (`PREVIEW_SIMULATE_S`, bước 1/60s) rồi
  vẽ 1 lần, cùng đúng code với Present Mode (khác Orbit Lights vẽ thẳng theo thời gian vì quỹ đạo là
  hàm tuần hoàn, còn pháo hoa phụ thuộc lịch sử).
- RNG truyền vào (`views/seededRng.ts`, dùng chung với Confetti): Builder dùng `seededRng(1)` (mulberry32) → cùng props luôn ra cùng 1 hình, không
  nhảy mỗi lần re-render; Present Mode dùng `Math.random`.
- `dt` chặn tối đa 50ms — tab bị treo quay lại không làm hạt nhảy cóc.
- Deps của effect là `JSON.stringify(props)` chứ KHÔNG phải object `props`: Present Mode poll config
  mỗi 2s ra object mới dù không đổi gì — deps theo identity sẽ huỷ + bắn lại từ đầu mỗi 2s.
- `MAX_PARTICLES = 4000` chặn trên khi đặt Interval quá nhỏ + Sparks quá lớn.

## Vật lý & cách vẽ

- Quả pháo: chọn trước độ cao đỉnh (`launchHeight`% chiều cao khung, ±15%) và thời gian lên đỉnh
  (0.9–1.3s), suy ngược gia tốc `a = 2d/t²` + vận tốc đầu `v0 = a·t` → luôn nổ đúng độ cao dù bắn
  nghiêng (góc chỉ quyết định `vx`). Xuất phát dưới mép dưới khung.
  - `scattered`: rải x 10–90% khung, gần thẳng đứng. `center`: quanh giữa ±10%, lệch ±10°.
    `sides`: luân phiên 2 góc dưới (8%/92%), nghiêng vào giữa 18–26°.
- Nổ: `sparkCount` tia, hướng ngẫu nhiên đều 360°, tốc độ `520 × burstSize% × (0.4–1)` px/s; drag
  ngang mạnh hơn dọc (`vx *= 1-0.6dt`, `vy *= 1-0.15dt`) + trọng lực 240 px/s² → chùm tròn rồi rũ
  xuống. 20% tia màu trắng (lấp lánh), còn lại màu quả pháo (chọn ngẫu nhiên trong `colors`).
- Tàn (willow, 35% số tia, 1 hạt/55ms): rơi CHẬM có sức cản không khí — vận tốc tiến dần về tốc độ
  giới hạn `EMBER_TERMINAL_VY = 22` px/s (`v += (vT − v)·(1 − e^(−3·dt))`), chỉ thừa hưởng 10% quán
  tính của tia, sống 0.7–1.3s để kịp thấy trôi lơ lửng. Chỉ riêng tàn — quả pháo/tia giữ nguyên.
- Vẽ (`lighter`): tia = vệt thẳng dài `vận tốc × 0.045s` (tia nhanh vệt dài, chậm dần thành chấm), 2
  nét chồng: nét rộng 3× alpha 0.18 (quầng) + nét lõi. **KHÔNG dùng `shadowBlur` cho tia/tàn** —
  hàng trăm hạt × shadowBlur/khung hình là phần đắt nhất; bản cũ vẽ chấm tròn + shadowBlur trông nhỏ,
  tối, lấm tấm (đã thử, bỏ). Quả pháo: vệt liền qua 14 vị trí gần nhất (`lineCap: "butt"`) + đầu trắng
  có shadowBlur (chỉ vài quả cùng lúc nên rẻ).

## Props (Basic options)

| Field | Panel | Mặc định | Ghi chú |
|---|---|---|---|
| `launchFrom` | Launch from | `scattered` | Scattered / Center / Both sides |
| `sparkCount` | Sparks per burst | 90 | 6–400 |
| `launchIntervalMs` | Interval (ms) | 700 | Khoảng cách 2 quả (±30% ngẫu nhiên), tối thiểu 150. Quả đầu bắn ngay |
| `burstSize` | Burst size (%) | 100 | 30–200, nhân tốc độ văng tia |
| `launchHeight` | Launch height (%) | 60 | 10–95, % chiều cao khung tính từ đáy |
| `colors` | Colors | teal/vàng/hồng (như Orbit Lights) | 1–6 màu, nút × xoá / "+ Add color" |

Interactions with Draw: y hệt Orbit Lights ([orbit-lights.md](./orbit-lights.md#interactions-with-draw)). Gợi ý dùng: Idle = Disappear, Draw = Appear →
pháo hoa chỉ bắn lúc công bố người trúng; hiện lại thì show khởi động mới (quả đầu bắn ngay).

## File liên quan

| File | Vai trò |
|---|---|
| `src/lib/landing/types.ts` | `FireworksProps`/`FireworksComponent`/`FireworksLaunchFrom` |
| `src/components/landing/views/FireworksView.tsx` | `createShow()` (step + draw) + ẩn/hiện theo Draw + rAF |
| `src/components/landing/panels/FireworksPanel.tsx` | Basic options + Interactions with Draw |
| `componentRegistry.ts` / `componentIcons.tsx` | Entry `fireworks` (category `"Effects"`) / `FireworksIcon` |

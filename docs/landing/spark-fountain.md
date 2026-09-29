# Spark Fountain (`sparkFountain`) — nhóm Effects

Tier 2 (Canvas 2D). Cấu trúc, 2 họ kỹ thuật, quy ước panel dùng chung cho cả nhóm: [builder.md → Khuôn chung của nhóm Effects](./builder.md#khuôn-chung-của-nhóm-effects).

Pháo lạnh sân khấu: N cột tia lửa phun thẳng lên từ đáy khung rồi rơi lả tả, tắt dần — hình ảnh quen
thuộc lúc công bố giải ở sự kiện thật. Cùng khuôn Fireworks (`createShow()` step/draw tách rời,
`seededRng`, deps theo `JSON.stringify(props)` — [fireworks.md](./fireworks.md#kiến-trúc-createshow)).

## Vật lý & cách vẽ

- Cột chia đều theo chiều ngang đáy khung: cột i ở `x = w·(i + 0.5)/N`, miệng phun ngay mép dưới.
- Mỗi giây phun `intensity` tia MỖI cột (bộ tích luỹ `emitAcc`, không phụ thuộc fps). Vận tốc đầu suy
  ngược từ độ cao mong muốn `v0 = √(2·g·H) × 1.12` (`H = height% × chiều cao khung × 0.85–1.05`; hệ số
  1.12 bù phần cản gió ăn mất độ cao — đo bằng ảnh chụp, không có hệ số này đỉnh cột chỉ ~3/4
  Height). Trọng lực 1400 px/s² (tia pháo lạnh nặng, lên đỉnh ~1s), cản nhẹ `e^(−0.35·dt)`.
- Góc: lệch khỏi phương thẳng đứng `(rng + rng − 1) × spread` — phân bố tam giác dồn về 0 → lõi cột
  đặc, thưa dần ra rìa, đúng dáng cột pháo thật (phân bố đều sẽ ra hình quạt đặc đều, trông giả).
- 25% tia màu trắng nóng xen giữa (không cần chọn trong Colors), còn lại chọn ngẫu nhiên trong
  `colors`. Sống 1.2–2.1s, mờ dần ở 40% cuối đời.
- Vẽ (`lighter`, không `shadowBlur`): tia = vệt dài `vận tốc × 0.028s`, 2 nét chồng (quầng rộng 3×
  alpha 0.2 + lõi) — cùng kỹ thuật tia Fireworks; alpha nhân thêm nhiễu 0.7–1 mỗi khung hình → lấp
  lánh. Miệng phun có quầng sáng nhỏ (3 vòng tròn đồng tâm, chỉ khi đang phun).
- Play: `continuous` phun mãi; `once` phun `durationMs` rồi tắt, tia còn trên không rơi hết tự nhiên.
  Khung tĩnh Builder = mô phỏng trước 1.8s (cột đã lên đỉnh + bắt đầu rơi).

## Props (Basic options)

| Field | Panel | Mặc định | Ghi chú |
|---|---|---|---|
| `fountainCount` | Fountains | 2 | 1–8 cột chia đều đáy khung |
| `intensity` | Intensity | 250 | Tia/giây MỖI cột, 10–1000 |
| `playMode` | Play | `continuous` | Continuous / Once |
| `durationMs` | Duration (ms) | 4000 | CHỈ hiện khi Once |
| `height` | Height (%) | 70 | Độ cao đỉnh cột, % chiều cao khung |
| `spread` | Spread (°) | 8 | Nửa góc loe của cột, 0–45 |
| `colors` | Colors | vàng nhạt `#FFE08A` + vàng cam `#FFB300` | 1–6 màu (tia trắng tự xen thêm) |

Interactions with Draw (+ Prize): y hệt Orbit Lights ([orbit-lights.md](./orbit-lights.md#interactions-with-draw)). Cách dùng hợp nhất: Play = **Once** (vd 4000ms)
+ Idle = Disappear, Draw = Appear → mỗi lần công bố người trúng, pháo lạnh phun 4 giây rồi tắt — đúng
nhịp pháo lạnh ở sự kiện thật.

## File liên quan

| File | Vai trò |
|---|---|
| `src/lib/landing/types.ts` | `SparkFountainProps`/`SparkFountainComponent` |
| `src/components/landing/views/SparkFountainView.tsx` | `createShow()` + ẩn/hiện theo Draw + rAF |
| `src/components/landing/panels/SparkFountainPanel.tsx` | Basic options + Interactions with Draw |
| `componentRegistry.ts` / `componentIcons.tsx` | Entry `sparkFountain` (category `"Effects"`) / `SparkFountainIcon` |

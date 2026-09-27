# Orbit Lights (`orbitLights`) — nhóm Effects

Tier 2 (Canvas 2D). Cấu trúc, 2 họ kỹ thuật, quy ước panel dùng chung cho cả nhóm: [builder.md → Khuôn chung của nhóm Effects](../builder.md#khuôn-chung-của-nhóm-effects).

N hạt sáng (mặc định 3) kéo vệt, bay theo N quỹ đạo elip xoay đều quanh tâm khung — kiểu biểu tượng
nguyên tử.

## Hình học

- Quỹ đạo `i` (0…N-1) nghiêng `π·i/N` — chia đều trong NỬA vòng (elip đối xứng tâm nên xoay 180° là
  trùng lại): 3 quỹ đạo lệch 60°, 2 quỹ đạo lệch 90°.
- Pha xuất phát của hạt `i` lệch `2π·i/N` — các hạt không chụm 1 chỗ.
- Toạ độ: elip đơn vị `(cos t, ratio·sin t)` → xoay theo góc nghiêng → nhân `(w/2 − pad, h/2 − pad)`.
  Quỹ đạo luôn **nội tiếp khung** x/y/width/height; khung không vuông thì cả hình giãn theo khung.
  Kích thước quỹ đạo KHÔNG có field riêng — chỉnh bằng Width/Height của component (mặc định phủ cả
  canvas 1920×1080).
- `pad = particleSize × 4` — chừa lề cho quầng sáng để hạt sát mép không bị canvas cắt.

## Cách vẽ (`drawFrame`)

- `globalCompositeOperation = "lighter"` (cộng sáng) cho vệt + hạt.
- **Vệt** = 12 nét (`TRAIL_LAYERS`) LIỀN chồng nhau, CÙNG kết thúc ở hạt, nét càng ngắn càng dày →
  cộng sáng tự tạo độ đậm/dày dần về phía hạt. `lineCap: "butt"`.
  - KHÔNG vẽ từng đoạn rời với alpha tăng dần: đầu nét các đoạn chồng nhau cộng sáng thành chuỗi "hạt
    cườm" lấm tấm (đã thử, bỏ).
  - KHÔNG dùng `lineCap: "round"`: đầu tròn của nét ngắn (dày) phồng lên thành nốt sáng trên nét dài
    (mảnh) bên dưới.
- **Hạt** = quầng mờ (bán kính 3× size, alpha 0.18) → thân màu có `shadowBlur` (glow rẻ, không dùng
  blur thật) → lõi trắng 0.5× size.
- `showOrbits` vẽ đường quỹ đạo alpha 0.12.
- Màu từng hạt qua `orbitLightColor(props, i)` = `colors[i] ?? color` — áp cho hạt, vệt, quầng và
  đường quỹ đạo của hạt đó.

## Builder vs Present Mode

- `animate` = `interactive` của `LandingRenderer` — CHỈ Present Mode chạy rAF. Builder và preview
  `LandingPage.tsx` vẽ 1 khung tĩnh (`elapsedMs = 0`), đúng quy tắc Builder/Present Mode ở [presentation.md mục 2](../presentation.md#2-pipeline-render--builder-preview-present-mode).
- Cùng 1 hàm `drawFrame` cho cả 2 → khung tĩnh và animation luôn giống hình dáng.
- `startRef` giữ mốc thời gian qua các lần đổi props (Present Mode poll config mỗi 2s) → đổi màu/tốc
  độ không làm hạt nhảy về vị trí xuất phát. Cleanup `cancelAnimationFrame` khi unmount/đổi props.
- Wrapper của `LandingRenderer` có `pointerEvents: "none"` → khung phủ cả màn hình KHÔNG chặn click
  của Button/Prize bên dưới. Muốn hạt nằm SAU component khác thì kéo xuống trong Layers.

## Props (Basic options)

| Field | Panel | Mặc định | Ghi chú |
|---|---|---|---|
| `particleCount` | Particles | 3 | 1–6, = số quỹ đạo |
| `particleSize` | Particle size | 10 | Bán kính lõi (px artboard); quyết định cả độ dày vệt, quầng, `pad` |
| `revolutionMs` | Lap time (ms) | 6000 | Thời gian 1 vòng, nhỏ = nhanh, tối thiểu 500 |
| `colors` | Color 1…N | teal `#20C7F1`, vàng `#FFCA2D`, hồng `#FF5C8A` | 1 ô/hạt, số ô = Particles. Không dùng `gold` xanh đậm `#2244A5` — quá tối cho hạt sáng trên nền đen |
| `color` | (không hiện) | `#20C7F1` | Fallback cho hạt không có phần tử trong `colors` (landing cũ, hoặc tăng Particles vượt độ dài mảng) |
| `trailLength` | Trail length (%) | 30 | % của 1 vòng, 0–60; 0 = không vệt |
| `orbitWidth` | Orbit width (%) | 35 | Trục ngắn/trục dài, 10–100; 100 = mọi quỹ đạo trùng thành 1 vòng tròn |
| `showOrbits` | Show orbit paths | false | Vẽ mờ đường quỹ đạo |

`OrbitLightsPanel.setColor` ghi ĐỦ mảng tới index đang sửa (điền màu đang hiển thị cho ô trống phía
trước) — tránh mảng thưa có lỗ `undefined` khi lưu JSON.

## Interactions with Draw

`syncWithDraw`/`drawCycle` — cùng schema, cùng panel `DrawCycleFields.tsx`, cùng hook
`useDrawCycleVisibility` với Image (chỉ Appear/Disappear). Mặc định tắt = luôn hiện + luôn chạy. Lúc
ẩn thì unmount hẳn canvas → dừng luôn rAF; hiện lại thì hạt bay lại từ vị trí xuất phát. Chi tiết
model Idle/Draw/Redraw: [presentation.md mục 4](../presentation.md#4-interactions-with-draw--model-idledrawredraw).

## File liên quan

| File | Vai trò |
|---|---|
| `src/lib/landing/types.ts` | `OrbitLightsProps`/`OrbitLightsComponent`, `orbitLightColor()` |
| `src/components/landing/views/OrbitLightsView.tsx` | `drawFrame()` (vẽ 1 khung) + ẩn/hiện theo Draw + vòng lặp rAF |
| `src/components/landing/panels/OrbitLightsPanel.tsx` | Basic options + Interactions with Draw |
| `src/components/landing/componentRegistry.ts` | Entry `orbitLights`, category `"Effects"`, props mặc định |
| `src/components/landing/componentIcons.tsx` | `OrbitLightsIcon` |

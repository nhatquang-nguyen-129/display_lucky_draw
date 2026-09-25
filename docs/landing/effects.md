# EFFECTS — Trần đồ hoạ & định hướng kỹ thuật cho hiệu ứng trong Landing Builder

Tài liệu này trả lời 1 câu hỏi cụ thể: **app này (Electron/Chromium, chạy offline trên máy người tổ
chức sự kiện) có thể triển khai hiệu ứng đồ hoạ tới mức nào, bằng kỹ thuật gì, và nên chọn kỹ thuật
nào cho từng loại hiệu ứng** — để không mất thời gian phân vân/thử sai khi bắt tay làm 1 hiệu ứng
mới. Đọc file này trước khi thêm bất kỳ Effect (Fireworks-kiểu-cũ, Stage Light-kiểu-cũ, hoặc hiệu
ứng hoàn toàn mới) vào Landing Builder.

Bối cảnh: Trigger Graph (hệ tín hiệu Emitter/Receiver) đã bị bỏ hẳn (xem `CLAUDE.md`) để tránh sa đà
thiết kế logic, dồn thời gian cho phần khán giả thực sự nhìn thấy. File này là bước tiếp theo — xác
định rõ "trần" kỹ thuật trước khi đầu tư công sức vào 1 hướng cụ thể.

## 1. Tech stack thực tế — quan trọng nhất cần nắm

- **Electron = Chromium ĐẦY ĐỦ chạy trên máy người tổ chức**, không phải WebView giới hạn hay trình
  duyệt cũ cần lo tương thích. Renderer process có TOÀN BỘ API của 1 trình duyệt hiện đại: Canvas 2D,
  WebGL/WebGL2, Web Audio, CSS filter/backdrop-filter, requestAnimationFrame, OffscreenCanvas...
- **Chạy 100% offline, không CDN** — mọi thư viện/asset phải nằm trong bundle hoặc lưu cục bộ (base64
  trong `landing_config` JSON, giống `ImageProps.srcDataUrl` đang làm, hoặc file riêng qua IPC). Không
  bao giờ `<script src="https://...">` hay tải font/model/asset từ mạng.
- **1 màn hình khán giả cố định 1920×1080** (`PresentMode.tsx`, letterbox theo tỉ lệ thật khi màn
  hình khác tỉ lệ) — không phải responsive nhiều kích thước như web thường, ngân sách GPU/CPU tương
  đối rộng rãi (máy trình chiếu sự kiện thường không phải máy yếu/di động/pin), nhưng vẫn phải mượt
  suốt buổi (jank giữa lúc công bố người trúng là tối kỵ).
- **React 18 + TypeScript + Tailwind**, KHÔNG có thư viện đồ hoạ nào cài sẵn hiện tại (Three.js/Pixi/
  Lottie đều CHƯA có trong `package.json`) — mọi hiệu ứng hiện tại (trước khi bỏ) đều dựng bằng CSS
  thuần hoặc Canvas 2D tay, không dependency ngoài.

## 2. Kiến trúc render bắt buộc phải theo (áp dụng cho MỌI tier bên dưới)

- `LandingRenderer.tsx` là painter THUẦN, dùng chung tuyệt đối bởi Builder (`LandingCanvas.tsx`) và
  Present Mode (`PresentMode.tsx`) qua 1 prop `interactive` — đảm bảo 2 nơi không bao giờ vẽ lệch
  nhau (chi tiết ranh giới `interactive` xem [present-mode.md](./present-mode.md)). Effect mới PHẢI
  tôn trọng ranh giới này:
  - `interactive=false` (Builder) → LUÔN hiện khung TĨNH/preview 1 khung hình, KHÔNG chạy animation
    loop thật — tránh giật/phân tâm khi đang kéo-thả nhiều component cùng lúc trong lúc dựng trang.
  - `interactive=true` (Present Mode) → animation thật mới chạy.
- Mỗi effect là 1 **Component** độc lập theo đúng checklist 4 bước ở đầu `src/lib/landing/types.ts`
  (Props/Component type → View → Panel → đăng ký `componentRegistry.ts` — xem
  [config-lifecycle.md](./config-lifecycle.md)) — không gắn effect vào component khác kiểu field phụ.
- **Không còn tầng tín hiệu trung gian nào** (đã bỏ Trigger Graph) — 1 effect mới cần "khi nào bắt
  đầu chạy" phải chọn 1 trong 2 cơ chế đã có tiền lệ trong app:
  1. **Button gọi thẳng** — action cố định trong `ButtonPanel.tsx` gọi thẳng 1 hàm (giống Draw/
     Confirm hiện tại, xem [button-actions.md](./button-actions.md)).
  2. **Tự phát hiện qua data đổi** — component tự `useEffect` dò 1 giá trị trong `LandingData` đổi
     rồi tự chạy (giống Lucky Wheel dò `results[0].id`, xem `WheelTemplate.tsx`).
  Không tạo lại 1 hệ tín hiệu tổng quát mới — đúng tinh thần vừa quyết định đơn giản hoá.

## 3. 4 tier kỹ thuật — từ rẻ nhất tới mạnh nhất

### Tier 1 — CSS thuần (transform/opacity/filter)

**Kỹ thuật**: Tailwind class hoặc inline style cho transform/opacity, CSS `@keyframes` (1 file
`.css` riêng theo component, đúng convention `landingEffects.css`/`digitRollerEffects.css` đã có),
`filter: blur()/drop-shadow()`, `backdrop-filter`. Với animation cần đọc vật lý mỗi khung hình (spin,
sweep...), ghi TRỰC TIẾP `style.transform` vào DOM qua `ref` trong `requestAnimationFrame`, KHÔNG qua
React state mỗi frame — kỹ thuật đã dùng cho vòng quay số ký tự (đã kiểm chứng mượt 60fps, né hẳn
chi phí re-render React 60 lần/giây).

**Điểm mạnh**: rẻ nhất, transform/opacity được GPU tăng tốc tự động bởi trình duyệt, không thêm
dependency, code đơn giản nhất để bảo trì.

**Giới hạn**: mỗi "hạt" chuyển động là 1 DOM node — quá vài trăm node cùng lúc bắt đầu giật; không vẽ
tự do được hình dạng/gradient động phức tạp (chỉ style CSS chuẩn).

**Phù hợp**: hiệu ứng entrance khi 1 component xuất hiện (đã có sẵn `EffectName`: fade/slide/pulse/
bounce), đèn quét/chùm sáng (clip-path hình tam giác + blur + xoay qua ref), lớp phủ tối/sáng dần
(opacity transition), glow tĩnh, mọi chuyển động UI thông thường.

### Tier 2 — Canvas 2D

**Kỹ thuật**: `<canvas>` + `requestAnimationFrame`, tự quản lý mảng particle trong closure/ref (chỉ
`setState` khi cần re-render phần UI khác, không phải mỗi khung hình), mỗi khung hình
`ctx.clearRect()` toàn bộ rồi vẽ lại từng particle theo vị trí/màu/alpha hiện tại. Glow rẻ tiền qua
`ctx.shadowBlur`/`shadowColor` thay vì blur thật (đắt hơn nhiều).

**Điểm mạnh**: hàng trăm tới ~1-2 nghìn particle vẫn mượt trên phần cứng hiện đại, tự do vẽ hình
dạng/màu/gradient/alpha theo ý muốn — **đã CHỨNG MINH chạy tốt trong chính app này** (hiệu ứng pháo
hoa 2 pha rocket bay lên để lại vệt sáng → nổ thành chùm tia toả tròn rồi tắt dần, từng triển khai
đầy đủ trước khi gỡ theo quyết định đơn giản hoá kiến trúc — xem lịch sử git nếu cần tham khảo lại
cách viết vật lý particle/glow/ember cụ thể, tìm theo tên file cũ `FireworksView.tsx`).

**Giới hạn**: phải tự viết TOÀN BỘ vật lý tay (gravity/drag/spawn/lifetime) — không có engine dựng
sẵn, dễ rối nếu effect có nhiều pha; vẫn là CPU vẽ (Canvas 2D không dùng shader GPU thật dù trình
duyệt có tối ưu phần nào).

**Phù hợp**: pháo hoa, confetti, particle burst ăn mừng, mưa/tuyết rơi, tia lửa/ember, bất kỳ hiệu
ứng "rời rạc nhiều hạt chuyển động độc lập" nào — đây là tier "sweet spot" cho phần lớn nhu cầu hiệu
ứng ăn mừng sự kiện.

### Tier 3 — WebGL / Three.js / PixiJS

**Kỹ thuật**: cài thêm thư viện (Three.js cho 3D, PixiJS cho 2D tăng tốc GPU), render vào 1
`<canvas>` riêng qua WebGL context, particle/shader chạy trực tiếp trên GPU.

**Điểm mạnh**: hàng chục nghìn particle, hiệu ứng 3D thật (xoay/rơi/va chạm có vật lý 3D), shader tuỳ
biến (lửa/khói/nước/ánh sáng thể tích) mà Canvas 2D không tái tạo đẹp nổi.

**Chi phí thật (không nên trả trừ khi cần)**: thêm dependency đáng kể (Three.js riêng phần lõi đã
~600KB+), đường cong học riêng (shader/scene graph/camera), thêm 1 tầng phức tạp bảo trì lâu dài cho
1 app vốn định hướng đơn giản. Rủi ro tương thích GPU driver máy khán giả cụ thể tuy hiếm với
Chromium hiện đại nhưng không phải bằng 0.

**Phù hợp**: CHỈ khi có 1 hiệu ứng cụ thể mà Tier 2 thử rồi vẫn không đáp ứng nổi (vd cần particle 3D
thật, shader lửa/khói phức tạp) — không thêm "phòng khi cần", đúng nguyên tắc đã thống nhất khi bỏ
Trigger Graph (không xây trước cho nhu cầu giả định).

### Tier 4 — Asset ngoài (Video / GIF / Lottie / SVG / Audio)

**Kỹ thuật**: phát trực tiếp video/GIF đã render sẵn từ công cụ thiết kế ngoài (After Effects,
Photoshop...), Lottie (file JSON animation vector từ After Effects, thư viện `lottie-web` chỉ
~30KB, nhẹ hơn hẳn Three.js), SVG animation (SMIL hoặc CSS), Web Audio API cho âm thanh phản ứng
theo hiệu ứng (vd tiếng nổ đúng lúc pháo hoa bắn).

**Điểm mạnh**: chất lượng hình ảnh cao nhất có thể đạt được (do người thiết kế chuyên nghiệp dựng
sẵn, không giới hạn bởi khả năng code tự vẽ), triển khai NHANH nếu đã có asset — chỉ cần 1 component
"phát file" là xong, không viết vật lý/animation tay.

**Giới hạn cần lưu ý**: asset phải lưu CỤC BỘ (app offline hoàn toàn) — video/Lottie thường NẶNG hơn
ảnh nhiều, cần quyết định lưu base64 thẳng trong `landing_config` JSON (đơn giản, giống ImageProps,
nhưng file JSON phình to) hay lưu file riêng trên đĩa + chỉ lưu đường dẫn trong config (nhẹ hơn
nhưng cần thêm cơ chế copy/quản lý file qua IPC, phức tạp hơn 1 chút).

**Phù hợp**: bổ sung nhanh 1 hiệu ứng "wow" cụ thể mà không cần code tự vẽ, đặc biệt hợp nếu người tổ
chức sự kiện có sẵn designer/asset dựng animation ngoài.

## 4. Định hướng cụ thể (khuyến nghị)

- **Mặc định bám Tier 1-2** (CSS + Canvas 2D) — đã có nền sẵn trong app, đã chứng minh chạy mượt, đủ
  sức làm phần lớn hiệu ứng ăn mừng/trình chiếu sự kiện cần (pháo hoa, đèn sân khấu, dim nền, entrance
  animation, confetti...). Không thêm dependency mới cho tới khi có nhu cầu cụ thể vượt quá 2 tier này.
- **Tier 4 (đặc biệt là Lottie) đáng cân nhắc SỚM nếu có sẵn asset/designer ngoài** — triển khai
  nhanh hơn code tay nhiều, rủi ro kỹ thuật thấp hơn cả Tier 3, chỉ cần lo phần lưu trữ file cục bộ.
- **Tier 3 (WebGL) chỉ khi có 1 hiệu ứng cụ thể, đã thử Tier 2 không đủ** — không xây trước "phòng
  khi cần", đúng tinh thần đơn giản hoá đang theo đuổi.

## 5. Checklist kỹ thuật khi thêm 1 effect mới (bất kể tier nào)

1. Theo đúng 4 bước component mới ở đầu `src/lib/landing/types.ts` (Props/Component → View → Panel →
   `componentRegistry.ts` — xem [config-lifecycle.md](./config-lifecycle.md)).
2. Builder (`interactive=false`) LUÔN hiện khung tĩnh/preview — không chạy animation loop thật.
3. Present Mode (`interactive=true`) mới chạy animation thật (xem [present-mode.md](./present-mode.md)).
4. Cơ chế bắt đầu/dừng: Button gọi thẳng hàm HOẶC tự phát hiện qua data đổi (mục 2) — không dựng lại
   tầng tín hiệu trung gian nào.
5. Dọn dẹp `useEffect` cleanup (`cancelAnimationFrame`/`clearTimeout`) khi unmount — effect có thể bị
   xoá hoặc đổi component giữa lúc animation đang chạy, không dọn sẽ leak.
6. Nếu dùng asset ngoài (Tier 4): xác định rõ lưu base64 trong config hay file riêng + IPC TRƯỚC khi
   code, tránh phải đổi shape dữ liệu giữa chừng.

## 6. Effect đã có — nhóm "Effects" trong Palette

Mẫu tham khảo khi thêm effect Canvas 2D mới — Orbit Lights (vẽ thẳng theo thời gian) hoặc Fireworks
(mô phỏng có trạng thái, step/draw tách rời): 1 hàm vẽ thuần + prop `animate` +
(tuỳ chọn) `DrawCycleFields` cho "Interactions with Draw". Đăng ký với `category: "Effects"` trong
`componentRegistry.ts`, theo checklist mục 5.

Chung cho MỌI effect trong nhóm (không cần code riêng cho từng loại):
- **Trigger with Draw + Prize**: `DrawCycleFields` có dropdown Prize ("Any prize" hoặc 1 giải) — lượt
  quay ra giải khác thì effect về Idle. View PHẢI lấy resultId qua `drawCycleResultId(latest,
  drawCycle)`, không tự đọc `isLiveDrawResultId`. Chi tiết: [properties-panel.md](./properties-panel.md).
- **Tên tự động** "Confetti 1", "Confetti 2"... khi kéo vào trang — áp theo `category === "Effects"`
  trong `LandingBuilderWindow.tsx`, effect mới tự có, không cần đăng ký thêm.
- Dropdown Prize hiện dạng **"Category - Tên giải"** (giải chưa có category chỉ hiện tên) — 2 giải cùng
  tên ở 2 hạng khác nhau vẫn phân biệt được.

**Quy ước Properties Panel** (mọi effect — giữ đồng nhất, người dùng đã duyệt): 1 nhóm **Basic options**
phẳng (nhãn tiếng Anh ngắn; số lượng/kích thước/thời gian = ô số trong lưới 2 cột; tỉ lệ %/góc = thanh
trượt có giá trị ngay trên nhãn; field chỉ có nghĩa ở 1 chế độ thì ẩn khi không dùng, vd Interval/
Duration) → **Colors** (1–6 ô `ColorField`, nút × xoá, "+ Add color") → vạch ngăn → `DrawCycleFields`
(**Interactions with Draw**). Khung mặc định phủ cả canvas 1920×1080; wrapper `pointerEvents: none` nên
không chặn click Button/Prize bên dưới.

**2 họ kỹ thuật** — chọn đúng họ trước khi viết effect mới:

| Họ | Khi nào | Effect | Đặc điểm |
|---|---|---|---|
| Hàm thuần theo thời gian | Mọi thứ suy ra được từ (chỉ số, t) — tuần hoàn/lặp | Orbit Lights, Marquee Lights | `drawFrame(ctx, w, h, props, elapsedMs)`; khung tĩnh = `elapsedMs = 0`; `startRef` giữ mốc qua poll 2s |
| Mô phỏng có trạng thái | Hạt sinh ra/mất đi, phụ thuộc lịch sử | Fireworks, Confetti, Spark Fountain | `createShow()` → `step(dt)` + `draw(ctx)`; khung tĩnh = mô phỏng trước N giây bằng `seededRng(1)` (`views/seededRng.ts`); `dt` chặn 50ms; trần số hạt |

Chung cả 2 họ: deps effect theo `JSON.stringify(props)` (Present Mode poll config 2s ra object mới);
glow bằng `lighter` + nét rộng mờ chồng nét lõi, hoặc sprite vẽ sẵn (`spriteCache`) — KHÔNG
`shadowBlur` cho hàng trăm hạt; giấy/vật thể không tự phát sáng (Confetti) vẽ `source-over`.

**Đã thử và BỎ** (người dùng duyệt ảnh chụp rồi yêu cầu gỡ sạch khỏi code — đừng đề xuất lại): Sunburst
(tia sáng xoay từ tâm), Twinkle Stars (sao lấp lánh nền), Falling Petals (cánh hoa đào/mai rơi). Lý do
chung: là nền trang trí êm dịu, không mang không khí "trúng thưởng". Effect được giữ đều là năng
lượng/ăn mừng/sân khấu (game show, jackpot) — hướng gợi ý tiếp theo: Coin Shower (mưa tiền vàng/lì xì),
Stage Beams (đèn sân khấu quét), Camera Flash, Shockwave, Balloons.

### Orbit Lights (`orbitLights`) — Tier 2 (Canvas 2D)

N hạt sáng (mặc định 3) kéo vệt, bay theo N quỹ đạo elip xoay đều quanh tâm khung — kiểu biểu tượng
nguyên tử.

| File | Vai trò |
|---|---|
| `src/lib/landing/types.ts` | `OrbitLightsProps`/`OrbitLightsComponent`, `orbitLightColor()` |
| `src/components/landing/views/OrbitLightsView.tsx` | `drawFrame()` (vẽ 1 khung) + ẩn/hiện theo Draw + vòng lặp rAF |
| `src/components/landing/panels/OrbitLightsPanel.tsx` | Basic options + Interactions with Draw |
| `src/components/landing/componentRegistry.ts` | Entry `orbitLights`, category `"Effects"`, props mặc định |
| `src/components/landing/componentIcons.tsx` | `OrbitLightsIcon` |

#### 6.1 Hình học

- Quỹ đạo `i` (0…N-1) nghiêng `π·i/N` — chia đều trong NỬA vòng (elip đối xứng tâm nên xoay 180° là
  trùng lại): 3 quỹ đạo lệch 60°, 2 quỹ đạo lệch 90°.
- Pha xuất phát của hạt `i` lệch `2π·i/N` — các hạt không chụm 1 chỗ.
- Toạ độ: elip đơn vị `(cos t, ratio·sin t)` → xoay theo góc nghiêng → nhân `(w/2 − pad, h/2 − pad)`.
  Quỹ đạo luôn **nội tiếp khung** x/y/width/height; khung không vuông thì cả hình giãn theo khung.
  Kích thước quỹ đạo KHÔNG có field riêng — chỉnh bằng Width/Height của component (mặc định phủ cả
  canvas 1920×1080).
- `pad = particleSize × 4` — chừa lề cho quầng sáng để hạt sát mép không bị canvas cắt.

#### 6.2 Cách vẽ (`drawFrame`)

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

#### 6.3 Builder vs Present Mode

- `animate` = `interactive` của `LandingRenderer` — CHỈ Present Mode chạy rAF. Builder và preview
  `LandingPage.tsx` vẽ 1 khung tĩnh (`elapsedMs = 0`), đúng quy ước mục 2 ở trên.
- Cùng 1 hàm `drawFrame` cho cả 2 → khung tĩnh và animation luôn giống hình dáng.
- `startRef` giữ mốc thời gian qua các lần đổi props (Present Mode poll config mỗi 2s) → đổi màu/tốc
  độ không làm hạt nhảy về vị trí xuất phát. Cleanup `cancelAnimationFrame` khi unmount/đổi props.
- Wrapper của `LandingRenderer` có `pointerEvents: "none"` → khung phủ cả màn hình KHÔNG chặn click
  của Button/Prize bên dưới. Muốn hạt nằm SAU component khác thì kéo xuống trong Layers.

#### 6.4 Props (Basic options)

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

#### 6.5 Interactions with Draw

`syncWithDraw`/`drawCycle` — cùng schema, cùng panel `DrawCycleFields.tsx`, cùng hook
`useDrawCycleVisibility` với Image (chỉ Appear/Disappear). Mặc định tắt = luôn hiện + luôn chạy. Lúc
ẩn thì unmount hẳn canvas → dừng luôn rAF; hiện lại thì hạt bay lại từ vị trí xuất phát. Chi tiết
model Idle/Draw/Redraw: [properties-panel.md](./properties-panel.md) mục `DrawCycleFields.tsx` và
[present-mode.md](./present-mode.md).

### Fireworks (`fireworks`) — Tier 2 (Canvas 2D)

Pháo hoa 2 pha bắn LIÊN TỤC: quả pháo bay lên kéo vệt → tới đỉnh nổ thành chùm tia toả tròn → tia rơi
theo trọng lực, tắt dần, ~1/3 tia rơi tàn kiểu "willow". Viết lại vật lý từ `FireworksView.tsx` cũ (gỡ
cùng Trigger Graph — `git show a39d07a:src/components/landing/views/FireworksView.tsx`), bỏ cơ chế
Play/Stop/loop/duration, thay bằng khuôn Orbit Lights (luôn chạy ở Present Mode + Trigger with Draw).

| File | Vai trò |
|---|---|
| `src/lib/landing/types.ts` | `FireworksProps`/`FireworksComponent`/`FireworksLaunchFrom` |
| `src/components/landing/views/FireworksView.tsx` | `createShow()` (step + draw) + ẩn/hiện theo Draw + rAF |
| `src/components/landing/panels/FireworksPanel.tsx` | Basic options + Interactions with Draw |
| `componentRegistry.ts` / `componentIcons.tsx` | Entry `fireworks` (category `"Effects"`) / `FireworksIcon` |

#### 6.6 Kiến trúc `createShow()`

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

#### 6.7 Vật lý & cách vẽ

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

#### 6.8 Props (Basic options)

| Field | Panel | Mặc định | Ghi chú |
|---|---|---|---|
| `launchFrom` | Launch from | `scattered` | Scattered / Center / Both sides |
| `sparkCount` | Sparks per burst | 90 | 6–400 |
| `launchIntervalMs` | Interval (ms) | 700 | Khoảng cách 2 quả (±30% ngẫu nhiên), tối thiểu 150. Quả đầu bắn ngay |
| `burstSize` | Burst size (%) | 100 | 30–200, nhân tốc độ văng tia |
| `launchHeight` | Launch height (%) | 60 | 10–95, % chiều cao khung tính từ đáy |
| `colors` | Colors | teal/vàng/hồng (như Orbit Lights) | 1–6 màu, nút × xoá / "+ Add color" |

Interactions with Draw: y hệt Orbit Lights (mục 6.5). Gợi ý dùng: Idle = Disappear, Draw = Appear →
pháo hoa chỉ bắn lúc công bố người trúng; hiện lại thì show khởi động mới (quả đầu bắn ngay).

### Confetti (`confetti`) — Tier 2 (Canvas 2D)

Pháo giấy: mảnh chữ nhật (60%) / tròn (20%) / dải ruy băng (20%) bung ra rồi rơi lả tả, vừa rơi vừa
lật + lắc ngang. Cùng khuôn Fireworks (`createShow()` step/draw tách rời, `seededRng`, deps theo
`JSON.stringify(props)` — mục 6.6).

| File | Vai trò |
|---|---|
| `src/lib/landing/types.ts` | `ConfettiProps`/`ConfettiComponent`/`ConfettiLaunchFrom` |
| `src/components/landing/views/ConfettiView.tsx` | `createShow()` + ẩn/hiện theo Draw + rAF |
| `src/components/landing/panels/ConfettiPanel.tsx` | Basic options + Interactions with Draw |
| `src/components/landing/views/seededRng.ts` | RNG có seed dùng chung với Fireworks |
| `componentRegistry.ts` / `componentIcons.tsx` | Entry `confetti` (category `"Effects"`) / `ConfettiIcon` |

#### 6.9 Vật lý & cách vẽ

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

#### 6.10 Props (Basic options)

| Field | Panel | Mặc định | Ghi chú |
|---|---|---|---|
| `launchFrom` | Launch from | `sides` | Top (rain) / Center / Both sides |
| `playMode` | Play | `loop` | Once / Loop. Mặc định Loop vì Once khi chưa bật Trigger with Draw chỉ bung 1 đợt lúc mở Present Mode rồi thôi — dễ tưởng lỗi |
| `pieceCount` | Pieces | 150 | 10–600 mảnh mỗi đợt (Top: mỗi 2.5s) |
| `pieceSize` | Piece size | 18 | px, cạnh dài mảnh chữ nhật; từng mảnh ±25% |
| `intervalMs` | Interval (ms) | 3000 | CHỈ hiện khi Loop + Center/Both sides |
| `colors` | Colors | teal/vàng/hồng/trắng | 1–6 màu, nút × xoá / "+ Add color" |

Interactions with Draw: y hệt Orbit Lights/Fireworks. Cách dùng hợp nhất: Play = **Once** + Idle =
Disappear, Draw = Appear → mỗi lần công bố người trúng bung đúng 1 đợt (component mount lại mỗi lần
Appear nên đợt mới luôn bắt đầu từ đầu).

### Marquee Lights (`marqueeLights`) — Tier 2 (Canvas 2D)

Hàng bóng đèn chạy quanh viền khung (chữ nhật bo góc) như bảng hiệu sân khấu/máy quay thưởng. Cùng
khuôn Orbit Lights: sáng/tắt từng bóng là hàm THUẦN của (chỉ số bóng, thời gian), không có trạng thái
mô phỏng → 1 hàm `drawFrame` cho cả khung tĩnh Builder (`elapsedMs = 0`) lẫn rAF; `startRef` giữ nhịp
qua các lần poll config 2s.

| File | Vai trò |
|---|---|
| `src/lib/landing/types.ts` | `MarqueeLightsProps`/`MarqueeLightsComponent`/`MarqueePattern` |
| `src/components/landing/views/MarqueeLightsView.tsx` | `perimeterPoints()` + `brightness()` + `drawFrame()` + ẩn/hiện theo Draw |
| `src/components/landing/panels/MarqueeLightsPanel.tsx` | Basic options + Interactions with Draw |
| `componentRegistry.ts` / `componentIcons.tsx` | Entry `marqueeLights` (category `"Effects"`) / `MarqueeLightsIcon` |

#### 6.11 Hình học & cách vẽ

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

#### 6.12 Pattern (`brightness(pattern, i, phase)`, `phase = elapsedMs / stepMs`)

- `chase`: cứ 3 bóng sáng 1, "đầu" tiến theo chiều kim đồng hồ 1 bóng/nhịp, kéo đuôi mờ dần 2 bóng
  phía sau (độ sáng 1 → 0.5 → 0, nội suy liên tục theo phase nên chạy mượt, không giật từng nấc).
- `alternate`: bóng chẵn/lẻ đổi nhau mỗi nhịp (bật/tắt dứt khoát kiểu bảng hiệu cổ).
- `twinkle`: mỗi bóng có pha lệch riêng (hash theo chỉ số bóng), mỗi "nhịp riêng" dài 2 nhịp chung,
  ~45% bóng được chọn sáng lên rồi tắt dần theo nửa sóng sin — lấp lánh rải rác, không đồng loạt.
  Hash thuần `sin(a·12.9898 + b·78.233)` → không cần state, khung tĩnh vẫn ổn định.

#### 6.13 Props (Basic options)

| Field | Panel | Mặc định | Ghi chú |
|---|---|---|---|
| `pattern` | Pattern | `chase` | Chase / Alternate / Twinkle |
| `stepMs` | Step (ms) | 120 | ms mỗi nhịp, nhỏ = nhanh, tối thiểu 30 |
| `bulbSize` | Bulb size | 10 | Bán kính bóng (px) |
| `spacing` | Spacing | 44 | Khoảng cách mong muốn giữa 2 tâm bóng (px), tối thiểu 2.5× bulbSize |
| `cornerRadius` | Corner radius | 0 | Bo góc đường viền (px) — tăng lên khi đóng khung Lucky Wheel tròn/ảnh bo góc |
| `colors` | Colors | vàng `#FFCA2D` + trắng | 1–6 màu xen kẽ dọc viền |

Interactions with Draw: y hệt các effect trên. Cách dùng: kéo khung ôm sát Lucky Wheel/Prize để đóng
khung, hoặc để mặc định phủ cả canvas thành viền màn hình.

### Spark Fountain (`sparkFountain`) — Tier 2 (Canvas 2D)

Pháo lạnh sân khấu: N cột tia lửa phun thẳng lên từ đáy khung rồi rơi lả tả, tắt dần — hình ảnh quen
thuộc lúc công bố giải ở sự kiện thật. Cùng khuôn Fireworks (`createShow()` step/draw tách rời,
`seededRng`, deps theo `JSON.stringify(props)` — mục 6.6).

| File | Vai trò |
|---|---|
| `src/lib/landing/types.ts` | `SparkFountainProps`/`SparkFountainComponent` |
| `src/components/landing/views/SparkFountainView.tsx` | `createShow()` + ẩn/hiện theo Draw + rAF |
| `src/components/landing/panels/SparkFountainPanel.tsx` | Basic options + Interactions with Draw |
| `componentRegistry.ts` / `componentIcons.tsx` | Entry `sparkFountain` (category `"Effects"`) / `SparkFountainIcon` |

#### 6.14 Vật lý & cách vẽ

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

#### 6.15 Props (Basic options)

| Field | Panel | Mặc định | Ghi chú |
|---|---|---|---|
| `fountainCount` | Fountains | 2 | 1–8 cột chia đều đáy khung |
| `intensity` | Intensity | 250 | Tia/giây MỖI cột, 10–1000 |
| `playMode` | Play | `continuous` | Continuous / Once |
| `durationMs` | Duration (ms) | 4000 | CHỈ hiện khi Once |
| `height` | Height (%) | 70 | Độ cao đỉnh cột, % chiều cao khung |
| `spread` | Spread (°) | 8 | Nửa góc loe của cột, 0–45 |
| `colors` | Colors | vàng nhạt `#FFE08A` + vàng cam `#FFB300` | 1–6 màu (tia trắng tự xen thêm) |

Interactions with Draw (+ Prize): y hệt các effect trên. Cách dùng hợp nhất: Play = **Once** (vd 4000ms)
+ Idle = Disappear, Draw = Appear → mỗi lần công bố người trúng, pháo lạnh phun 4 giây rồi tắt — đúng
nhịp pháo lạnh ở sự kiện thật.

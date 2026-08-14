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
  nhau. Effect mới PHẢI tôn trọng ranh giới này:
  - `interactive=false` (Builder) → LUÔN hiện khung TĨNH/preview 1 khung hình, KHÔNG chạy animation
    loop thật — tránh giật/phân tâm khi đang kéo-thả nhiều component cùng lúc trong lúc dựng trang.
  - `interactive=true` (Present Mode) → animation thật mới chạy.
- Mỗi effect là 1 **Component** độc lập theo đúng checklist 4 bước ở đầu `src/lib/landing/types.ts`
  (Props/Component type → View → Panel → đăng ký `componentRegistry.ts`) — không gắn effect vào
  component khác kiểu field phụ.
- **Không còn tầng tín hiệu trung gian nào** (đã bỏ Trigger Graph) — 1 effect mới cần "khi nào bắt
  đầu chạy" phải chọn 1 trong 2 cơ chế đã có tiền lệ trong app:
  1. **Button gọi thẳng** — action cố định trong `ButtonPanel.tsx` gọi thẳng 1 hàm (giống Draw/
     Confirm hiện tại, xem `useDrawSequence.ts`/`ButtonView.tsx`).
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
   `componentRegistry.ts`).
2. Builder (`interactive=false`) LUÔN hiện khung tĩnh/preview — không chạy animation loop thật.
3. Present Mode (`interactive=true`) mới chạy animation thật.
4. Cơ chế bắt đầu/dừng: Button gọi thẳng hàm HOẶC tự phát hiện qua data đổi (mục 2) — không dựng lại
   tầng tín hiệu trung gian nào.
5. Dọn dẹp `useEffect` cleanup (`cancelAnimationFrame`/`clearTimeout`) khi unmount — effect có thể bị
   xoá hoặc đổi component giữa lúc animation đang chạy, không dọn sẽ leak.
6. Nếu dùng asset ngoài (Tier 4): xác định rõ lưu base64 trong config hay file riêng + IPC TRƯỚC khi
   code, tránh phải đổi shape dữ liệu giữa chừng.

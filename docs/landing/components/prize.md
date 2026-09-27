# Prize Image — ảnh đại diện 1 giải + hiệu ứng Spotlight "Won"

> Đọc trước khi sửa `src/components/landing/views/PrizeImageView.tsx`,
> `src/components/landing/views/prizeEffectTransform.ts`,
> `src/components/landing/views/PrizeEffectOverlay.tsx`,
> `src/components/landing/panels/LiveImagePanel.tsx`/`PrizeEffectPicker.tsx`, hoặc phần
> `PrizeInteractions`/`LiveImageProps` trong `src/lib/landing/types.ts`.

## 1. Prize Image là gì, khác Prize Gallery/Lucky Wheel ở đâu

Prize Image (`component.type === "prizeImage"`, `LiveImageProps` trong `types.ts`) là 1 ảnh đại diện
**ĐÚNG 1 giải CỐ ĐỊNH** do người dựng trang tự chọn (`props.prizeId`) — **không đổi theo kết quả
quay**. Dùng để ghim nhiều instance rải khắp landing, mỗi cái tự do vị trí/kích thước khớp đúng 1 chỗ
trong ảnh nền artwork (vd 1 cái đè lên ảnh máy hút bụi, 1 cái đè lên ảnh xe đẩy) — mỗi ảnh đại diện
ĐÚNG 1 giải, không sinh thêm ảnh theo `quantity` của giải đó.

Component này **LUÔN cho phép click để CHỌN giải đó cho Draw** — không có tuỳ chọn tắt, đây chính là
lý do component tồn tại (khác 1 ảnh trang trí thường). Click gọi thẳng
`DrawSequenceActions.togglePrizeSelection` (xem `useDrawSequence.ts`), ảnh nào đang hết hàng/không
active thì click báo popup qua `notifyOutOfStock` thay vì chọn được.

Ảnh hiển thị luôn là `prize.display_image` (bắt buộc nhập ở màn Prizes, `PrizeFormModal.tsx`) —
không còn ảnh dự phòng riêng. `prizeId = null`/giải đã bị xoá → hiện placeholder "No image".

## 2. Click xuyên qua PNG trong suốt — vì sao cần 2 lớp hit-test riêng

Vì nhiều Prize Image thường đặt **chồng bounding box lên nhau** (ghim theo artwork nền), hit-test
kiểu DOM thường (click vào hình chữ nhật của element) sẽ sai theo 2 cách: (1) click vào vùng TRONG
SUỐT của 1 PNG vẫn tính là "trúng ảnh đó"; (2) ảnh A nằm đè lên ảnh B — browser chỉ gửi sự kiện chuột
cho phần tử TRÊN CÙNG (ảnh A), nên dù ảnh A trong suốt tại điểm đó, ảnh B bên dưới vẫn không nhận
được gì (chuột coi như "lọt qua" cả 2).

Giải quyết bằng 2 file phối hợp:

- **`pixelAlphaHitTest.ts`** — decode pixel THẬT của từng PNG (qua `<canvas>`, cache theo `src`,
  `display_image` luôn là base64 data URL nên không bị taint CORS), trả lời "điểm này có alpha > 0
  hay không" cho ĐÚNG 1 ảnh.
- **`prizeHitCoordinator.ts`** — 1 CẶP listener DUY NHẤT gắn ở `document` (không phải trên từng
  element), mỗi lần di chuột/click dò lại TOÀN BỘ ngăn xếp phần tử tại điểm đó bằng
  `document.elementsFromPoint`, rồi lần lượt kiểm tra từng Prize Image đã đăng ký theo đúng thứ tự
  trên xuống: ảnh nào trong suốt tại điểm đó → bỏ qua (coi như xuyên qua); ảnh ĐẦU TIÊN có pixel thật
  mới là người thắng. Gặp 1 phần tử KHÔNG PHẢI Prize Image đã đăng ký (vd Button) thì dừng ngay — coi
  như bị thứ khác che thật.

## 3. Hệ 4 giai đoạn tương tác (`PrizeInteractions`)

| Giai đoạn | Kiểu chạy | Khi nào active |
|---|---|---|
| `onHover` | persistent (lặp suốt trạng thái) | Di chuột gần/vào — CHỈ lúc CHƯA chọn (click chính là hành động chọn nên "Click" và "Select" gộp làm 1 mục panel duy nhất, tên "Select") |
| `onSelect` | persistent | Suốt lúc giải này đang là giải ĐANG CHỌN |
| `onOutOfStock` | persistent | Suốt lúc hết hàng/không active — mặc định Highlight = Dim 58% (xem bên dưới), KHÔNG còn field nền `outOfStockDimAmount` riêng luôn-bật-sẵn như trước, chỉ còn 1 lựa chọn Highlight bình thường như 3 giai đoạn kia |
| `onWon` | **oneshot** (chạy đúng 1 lần rồi tắt) | Đúng lúc Wheel VỪA TRẢ VỀ người trúng giải NÀY (`candidate.prizeId === prizeId`) — KHÔNG đợi Confirm, xem `justWon` trong `PrizeImageView.tsx` |

Trùng nhau thì ưu tiên `onOutOfStock` > `onSelect` > `onHover` (đang hover 1 giải đã hết hàng thì hiện
`onOutOfStock`, không phải `onHover`).

Mỗi giai đoạn gộp **3 nhóm ĐỘC LẬP** (`PrizeStageEffect.focus/highlight/motion`), có thể bật ĐỒNG THỜI
cả 3 (vd vừa `scaleUp` vừa `glow`) — chỉ TRONG 1 nhóm mới giới hạn đúng 1 effect (hoặc `none`):

- **Focus** — `scaleUp` (phóng to quanh 1 điểm neo kéo-thả trên canvas) / `lift` (nâng/dịch theo
  hướng, điểm cố định LUÔN là chính giữa khung).
- **Highlight** — `glow` (viền sáng, vẽ bằng `filter: drop-shadow()` lặp 3 lớp, đặt `-z-10` để chỉ lộ
  ra outer glow) / `sweep` (1 dải sáng quét ngang qua bề mặt, dùng `mask-image` theo alpha để không
  tràn ra ngoài silhouette) / `dim` (phủ đen mask theo silhouette, `size` = % tối đi) / `spotlight`
  (luồng sáng toàn cảnh hình nón — xem mục 4, KHÁC 3 effect còn lại ở chỗ vẽ RIÊNG trong
  `PrizeImageView.tsx` chứ không qua `PrizeEffectOverlay.tsx`, vì cần
  `component.x/y/width/height` để kéo lên tận đỉnh canvas).
- **Motion** — `bounce`/`pulse`/`shake` (biên độ theo px, keyframes CSS trong `landingEffects.css`).

Cộng thêm nhóm thứ 4 tách riêng, `appearance: "none" | "disappear"` — công tắc ẩn/hiện thuần, không
có field phụ (màu/size/hướng vô nghĩa với "biến mất").

Vẽ ở 2 file: `prizeEffectTransform.ts` (Focus/Motion — biến đổi TRỰC TIẾP `transform` của ảnh, 2
wrapper DOM riêng để 2 nhóm animate đồng thời không tranh chấp cùng thuộc tính) và
`PrizeEffectOverlay.tsx` (Highlight — 1 lớp phủ RIÊNG cạnh ảnh).

## 4. Spotlight — hiệu ứng ánh sáng toàn cảnh

### 4.1. Khác gì với Focus/Highlight/Motion còn lại — và LỊCH SỬ 2 VÒNG kiến trúc

`spotlight` là 1 effect BÌNH THƯỜNG của nhóm **Highlight** (mục 3) — chọn được ở CẢ 4 giai đoạn
Hover/Select/Won/Out of Stock, y hệt `glow`/`sweep`/`dim` — nhưng khác 3 effect kia ở CÁCH VẼ:

- Không vẽ qua `PrizeEffectOverlay.tsx` như `glow`/`sweep`/`dim` (những effect đó chỉ cần
  `imageSrc`/`fit`/`borderRadius`) — Spotlight cần `component.x/y/width/height` để kéo nón sáng lên
  tận ĐỈNH CANVAS (vượt ra khỏi khung của CHÍNH component này), nên vẽ RIÊNG ngay trong
  `PrizeImageView.tsx`, đọc trực tiếp `resolvePrizeEffects()`'s `highlightPersistent`/
  `highlightOneshot` để biết stage nào (nếu có) đang active.
- Hiện **SUỐT** lúc stage đó còn active (không phải 1 cú chạy ngắn rồi tắt như oneshot
  Focus/Highlight/Motion khác) — tắt NGAY (không delay) khi hết active.
- Chỉ trễ đúng `delayMs` (field RIÊNG của `PrizeGroupEffect`, CHỈ effect này dùng) lúc BẮT ĐẦU hiện,
  không có field "tắt sau bao lâu".
- Phong cách (màu/hình dạng/độ mờ) **CỐ ĐỊNH trong code**, không phơi ra Properties Panel — panel chỉ
  cho chọn effect (`Spotlight`) + Delay, y hệt 3 effect Highlight kia không có field phụ ngoài
  Color/Size của riêng chúng. Lý do: đây là 1 kiểu ánh sáng photoreal khó tham số hoá gọn gàng bằng
  vài ô nhập, cố định sẵn 1 phong cách "đẹp mặc định" đơn giản hơn nhiều so với mở hết ra cho người
  dùng tự chỉnh màu/góc/cường độ.

**LỊCH SỬ 2 VÒNG** (quan trọng để hiểu vì sao kiến trúc hiện tại trông "lằng nhằng" hơn cần thiết nếu
chỉ đọc code hiện tại):

1. **Vòng 1** (đã CHẾT) — `spotlight` từng là 1 effect Highlight vẽ NGAY trong `PrizeEffectOverlay.tsx`
   (kiểu polygon/2D lighting) — bỏ hẳn sau nhiều vòng thử vì không ra hướng đẹp (nhìn phẳng lì).
2. **Vòng 2** — dựng LẠI hoàn toàn bằng kỹ thuật khác (nón đáy elip + mask silhouette + drop-shadow,
   mục 4.2-4.3 dưới đây), nhưng LÚC ĐẦU triển khai như 1 field HOÀN TOÀN TÁCH RIÊNG
   (`wonAmbientEffect`/`wonAmbientDelayMs` trên `LiveImageProps`, gắn cứng CHỈ cho `onWon`, không đi
   qua hệ 3-nhóm Focus/Highlight/Motion) — rồi mới GỘP LẠI làm 1 lựa chọn Highlight bình thường, dùng
   được cho cả 4 giai đoạn (bản hiện tại). 2 field `wonAmbientEffect`/`wonAmbientDelayMs` KHÔNG còn
   tồn tại nữa.

### 4.2. Spotlight ngoài đời thật trông như thế nào

Trước khi đọc phần code, hình dung rõ vật lý ánh sáng mà mình đang mô phỏng — 1 đèn sân khấu (spotlight
thật) chiếu thẳng từ trên xuống 1 vật thể:

1. **Chùm sáng hình nón** — hẹp ở nguồn sáng (trên cao), loang rộng dần khi đi xuống, vì đèn có góc
   mở cố định. Nhìn nghiêng, chùm sáng là 1 hình nón/hình nêm, không phải 1 dải thẳng đứng đều.
2. **"Vũng sáng" ở nơi ánh sáng chạm tới** — khi chùm nón chạm 1 mặt phẳng (sàn/vật thể), vết sáng đó
   là 1 hình **elip** (nhìn nghiêng 1 hình tròn thành elip), KHÔNG PHẢI 1 đường thẳng cắt cụt.
3. **Vật thể được chiếu sáng không đều** — mặt HƯỚNG LÊN TRÊN (phía đối diện nguồn sáng) sáng/bóng
   hơn hẳn, càng xuống dưới càng ít ánh sáng trực tiếp chạm tới.
4. **Đổ bóng ở chân vật thể** — vật cản 1 phần ánh sáng, phần "khuất sáng" ngay dưới đáy vật thể (nơi
   nó tiếp xúc/gần mặt sàn) tối hơn hẳn phần được chiếu trực tiếp, và thường có 1 viền bóng đổ lan ra
   xung quanh/xuống dưới đáy vật đó.

4 quan sát này ánh xạ trực tiếp sang 4 khối kỹ thuật ở mục 4.3.

### 4.3. Tái tạo bằng code — từng phần một

Tất cả nằm trong `PrizeImageView.tsx`, đọc `component.width/height/x/y` (khung Prize Image thật, kể
cả phần đã zoom bởi `onSelect`'s `scaleUp` đang active — bù bằng `activeFocusScaleFraction`, xem
doc-comment đầu file) — không có Canvas/WebGL nào, thuần CSS (đúng Tier 1 trong
[effects.md](./effects.md), vì đây là 1 lớp phủ tĩnh không cần particle/vật lý khung hình).

**(1) Chùm sáng hình nón, đáy elip** — `computeSpotlightClipPath()` trong `prizeEffectTransform.ts`.
`clip-path: polygon(...)` chỉ vẽ được cạnh THẲNG nên đáy ban đầu là 1 đường ngang cắt cụt (nhìn giả,
không giống nón sáng thật) — đổi sang `clip-path: path("...")` (SVG path syntax, cần toạ độ PIXEL
thật chứ không nhận `%`, nên hàm này nhận thẳng `width`/`height` đã tính bằng px):

- 2 cạnh nón nối THẲNG từ 1 đỉnh hẹp (đại diện nguồn sáng) xuống đúng 2 điểm ngoài cùng trái/phải của
  1 elip tưởng tượng ở đáy.
- Khép nửa dưới elip bằng 1 **SVG arc** (`A rx ry 0 0 0 ...`) — `sweep-flag=0` đi từ trái sang phải
  mới bulge ĐÚNG xuống dưới đường nối (toạ độ y trong SVG hướng xuống nên quy ước ngược với trực giác
  toán học thường, đã tự kiểm bằng công thức tham số hoá cung tâm của spec SVG trước khi chốt flag
  này — xem doc-comment ngay tại hàm).

Kết quả: hình "cây kem ốc quế" — nón thu hẹp ở đỉnh, đáy tròn bầu dục — đúng quan sát (1) + (2) ở mục
4.2, thay vì nón cụt đáy phẳng xấu.

Khung chứa nón **kéo dài từ y=0 TUYỆT ĐỐI của canvas** (`top: -component.y`) xuống đúng đáy khung
Prize — canvas ngoài cùng không `overflow: hidden` phần trên y=0 nên phần vượt lên không bị cắt mất,
mô phỏng đúng "nguồn sáng ở rất xa phía trên", không phải bắt đầu từ đỉnh khung ảnh.

**Đáy elip phải LUÔN to hơn ảnh, không khớp sát — bài học từ 1 bug thật thứ 2**: elip ban đầu chỉ bù
`width` theo `activeFocusScaleFraction` (mức zoom `onSelect`'s `scaleUp` đang active) mà QUÊN bù
`height` — lúc ảnh đang phóng to (đã chọn giải), chiều cao thật lớn hơn khung gốc nhưng đáy elip vẫn
đứng yên ở vị trí cũ, khiến đáy PNG (vd chân máy hút bụi) tràn thẳng ra ngoài elip (bug đã gặp thật,
xem ảnh trong lịch sử trao đổi). Sửa bằng `SPOTLIGHT_COVER_MARGIN = 0.12` — 1 khoảng dư 12% CỘNG
THÊM vào `activeFocusScaleFraction` cho CẢ WIDTH LẪN HEIGHT (coi margin như 1 mức "zoom" bù thêm, tái
dùng nguyên công thức left/width đã có), thay vì cố khớp pixel-đúng-bằng dễ vỡ lại nếu tính sai 1 ly
hoặc anchor `scaleUp` lệch tâm. Nửa phần dư ở height cộng vào PHÍA DƯỚI (`spotlightHeight`, đẩy đáy
elip xuống) vì ảnh phóng to đều quanh tâm nên nửa trên đã nằm gọn trong khoảng `-component.y` kéo lên
đỉnh canvas sẵn rồi, không cần bù riêng.

**Thứ tự vẽ (z-order) — bài học từ 1 bug thật**: ban đầu đặt nón ở `z-20`, đè LÊN TRÊN ảnh sản phẩm —
đúng phần nón chồng lên ảnh bị "rửa trắng"/mờ hẳn đi, sai hoàn toàn quan sát (3)+(4) (ánh sáng phải
NẰM SAU vật thể khi nhìn thẳng vào nó, không phải sơn đè lên mặt trước). Sửa: đặt khối nón **TRƯỚC**
wrapper Focus trong DOM và **bỏ hẳn `z-index`** — DOM order mặc định (không z-index) nghĩa là phần tử
sau đè lên phần tử trước, nên ảnh sản phẩm (vẽ sau) tự nhiên che kín đúng phần chồng lấn: chỗ ảnh CÓ
pixel (opaque) che hoàn toàn nón (ảnh giữ rõ nét 100%), chỗ ảnh KHÔNG có pixel (PNG trong suốt quanh
sản phẩm) hoặc NGOÀI khung ảnh (đoạn nón phía trên, giữa nguồn sáng và sản phẩm) vẫn hiện đúng.

**(2) Mặt trên sáng hơn, mặt dưới giữ nguyên** — quan sát (3), tái tạo bằng 1 lớp phủ RIÊNG (không
đụng ảnh gốc) nằm ngay trong wrapper Motion (bám sát ảnh kể cả lúc có `bounce`/`shake` từ `onWon`'s
Motion group đang chạy đồng thời):

- `mask-image: url(src)` (kỹ thuật giống `sweep` ở `PrizeEffectOverlay.tsx`) — giới hạn lớp phủ CHỈ
  hiện trong đúng silhouette PNG, không tràn ra vùng trong suốt thành 1 khối chữ nhật xấu.
- `background: linear-gradient(to bottom, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.45) 45%,
  rgba(255,255,255,0) 55%)` — giữ NGUYÊN mức sáng suốt nửa trên (0%-45%), chỉ nhạt dần trong 1 dải
  hẹp 45%-55% để tránh 1 đường cắt cứng lộ pixel — chia ĐÔI rõ ràng, không phải gradient tăng dần từ
  đỉnh (bản đầu tiên làm sai chỗ này: sáng nhất ngay tại y=0 rồi mờ dần, không phải "nửa trên đều
  sáng hơn" như quan sát thật).
- `mixBlendMode: "soft-light"` — cộng sáng NHẸ, không rửa trôi chi tiết/màu gốc như `"screen"` (đã
  dùng `"screen"` cho glow persistent ở `PrizeEffectOverlay.tsx`, nhưng chỗ đó chấp nhận rực hơn vì
  chỉ còn lộ outer glow ngoài biên, không phải phủ nguyên khối lên mặt ảnh như ở đây).

**(3) Đổ bóng ở chân ảnh** — quan sát (4), thử đầu tiên (gradient tối `mixBlendMode: "multiply"` BÊN
TRONG silhouette, đối xứng với lớp sáng ở trên) **không hiệu quả** — tối bên trong pixel đã có màu
sẵn của ảnh không tạo cảm giác "đổ bóng ra ngoài" rõ rệt, gần như không thấy được (bug thật đã gặp,
tester báo "chưa nhìn thấy đổ bóng luôn"). Đổi hẳn sang kỹ thuật **outer drop-shadow**, giống hệt cách
`glow` ở `PrizeEffectOverlay.tsx` tạo outer glow, chỉ đổi hướng + màu:

- 1 `<img>` THỨ HAI, cùng `src`, phủ `filter: drop-shadow(0 16px 14px rgba(15,10,5,0.65))` — trình
  duyệt tự vẽ 1 bản sao alpha của ảnh, làm mờ, dịch xuống dưới `16px`, TÔ màu tối chỉ định.
- Đặt `-z-10` (bên trong `isolate` của wrapper Focus, y hệt cách `glow` đã làm) — bản sao này bị
  chính ảnh THẬT ở trên che kín hoàn toàn phần trùng khít, **CHỈ CÒN LỘ RA đúng phần shadow LAN RA
  NGOÀI biên ảnh** (do offset `16px` xuống dưới + blur `14px`) — đúng cảm giác "stroke tối đổ bóng
  xuống dưới đáy" thay vì tối đều bên trong ảnh.

Việc "glow" và "đổ bóng Spotlight" dùng CHUNG 1 mẹo (`drop-shadow` + `-z-10` + để ảnh thật che bản
sao) không phải trùng hợp — đây là cách rẻ nhất trong Tier 1 (CSS thuần) để có 1 hiệu ứng bám ĐÚNG
silhouette PNG mà lan ra ngoài biên, không cần Canvas 2D tự vẽ alpha mask tay.

### 4.4. Đồng bộ bật/tắt 3 lớp

Nón + lớp sáng + lớp bóng đều dùng CHUNG state `spotlightOn` (1 `useState` trong `PrizeImageView.tsx`)
và CHUNG `transition: "opacity 400ms ease-out"` — đảm bảo 3 lớp luôn fade in/out ĐỒNG THỜI, không lệch
nhịp (vd nón hiện trước, ảnh sáng lên sau nửa giây sẽ trông như 2 hiệu ứng rời rạc thay vì 1 luồng sáng
thống nhất). `spotlightOn` bật sau đúng `delayMs` (đọc từ CONFIG của stage đang active — oneshot ưu
tiên hơn persistent nếu trùng nhau) kể từ lúc `spotlightTriggerKey` đổi (oneshot: mỗi lượt thắng mới,
qua `key` remount riêng; persistent: mỗi lần CHUYỂN sang active), tắt NGAY khi `spotlightActive` về
`false` (hết active, không phải effect nào đó đang chọn "Spotlight" nữa).

### 4.5. Giới hạn đã biết (chấp nhận được, không phải bug)

- Đây là xấp xỉ thị giác, KHÔNG PHẢI dựng lại quang học thật (không ray tracing, không tính góc
  chiếu/khoảng cách thật theo vị trí `component.x/y` so với 1 "nguồn sáng" cụ thể) — đủ dùng cho 1
  landing quay số, không cần chính xác vật lý.
- Nón/lớp sáng-bóng không track theo `transform` của Motion (`bounce`/`shake`) một cách tuyệt đối
  tuyệt đối trong MỌI trường hợp — riêng nón (đặt ở cấp ngoài Focus wrapper) không track cả Focus lẫn
  Motion; lớp sáng/bóng trên ảnh (đặt trong Motion wrapper) track đúng Motion nhưng không track
  Focus's `transform-origin` lệch tâm. Trong thực tế Motion là hiệu ứng oneshot chạy rất ngắn, còn
  Spotlight thường bật sau `delayMs` (đã trễ), nên 2 pha hiếm khi chồng đúng lúc — cùng kiểu đánh đổi
  đã chấp nhận sẵn cho `glow`/`sweep` ở `PrizeEffectOverlay.tsx`.
- Màu/hình dạng/độ dày stroke đổ bóng là hằng số cố định trong code (không phơi Properties Panel) —
  đổi trực tiếp trong `PrizeImageView.tsx` nếu cần tinh chỉnh, không có UI riêng.

## 5. File liên quan

| File | Vai trò |
|---|---|
| `src/lib/landing/types.ts` | `LiveImageProps`/`PrizeInteractions`/`PrizeStageEffect`/`PrizeGroupEffect` (kèm `delayMs`, CHỈ spotlight dùng) — toàn bộ shape dữ liệu |
| `src/components/landing/views/PrizeImageView.tsx` | Component render chính — click-to-select, 4 giai đoạn, Spotlight (nón + lớp sáng/bóng trên ảnh, đọc `resolved.highlightPersistent`/`highlightOneshot` để biết stage nào đang chọn Spotlight) |
| `src/components/landing/views/prizeEffectTransform.ts` | Tính `transform` cho Focus/Motion, `resolvePrizeEffects` (ưu tiên persistent/oneshot), `computeSpotlightClipPath` |
| `src/components/landing/views/PrizeEffectOverlay.tsx` | Vẽ Highlight `glow`/`sweep`/`dim` — cùng kỹ thuật `drop-shadow`/`mask-image` mà Spotlight tái dùng (nhưng Spotlight KHÔNG vẽ ở đây, xem mục 4.1) |
| `src/components/landing/views/pixelAlphaHitTest.ts` | Decode alpha PNG thật qua canvas, cache theo `src` |
| `src/components/landing/views/prizeHitCoordinator.ts` | Dò lại toàn bộ ngăn xếp phần tử tại điểm chuột — xử lý nhiều Prize Image chồng bounding box |
| `src/components/landing/panels/LiveImagePanel.tsx` | Properties Panel — Prize/Fit/Border radius, 4 `PrizeEffectPicker` giống hệt nhau (không còn nội dung riêng qua `children`) |
| `src/components/landing/panels/PrizeEffectPicker.tsx` | UI chọn Focus/Highlight/Motion cho 1 giai đoạn — dropdown Highlight có Spotlight (+ Delay) và Dim (+ Amount %) |
| `src/components/landing/componentRegistry.ts` | Default props khi tạo Prize Image mới (`prizeImage` entry, `onOutOfStock` mặc định Dim 58%) |

Xem thêm: [effects.md](./effects.md) (trần kỹ thuật hiệu ứng, tier nào dùng khi nào),
[button-actions.md](./button-actions.md) (nút Draw đọc `selectedPrizeId` do Prize Image set),
[README.md](./README.md) (mục lục toàn bộ Landing Builder).

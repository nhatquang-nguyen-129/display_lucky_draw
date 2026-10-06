# Landing Builder — cửa sổ dựng trang trình chiếu

Đọc trước khi sửa `src/pages/LandingBuilderWindow.tsx`, `src/components/landing/` (trừ `views/`),
hoặc `src/lib/landing/types.ts`. Phần chạy thật trước khán giả: [presentation.md](./presentation.md).
Từng loại component: 1 file `<component>.md` ngay trong thư mục này (bảng ở [mục 5](#5-add-component--danh-sách-component)).

## 1. Tổng quan

**Ý tưởng sản phẩm**: Landing Page là **"trình chiếu tuỳ biến"**. Người tổ chức tự thiết kế màn hình
trình chiếu (kéo-thả component, chỉnh màu/font/hiệu ứng) thay vì dùng 1 giao diện quay số cố định, vì
mỗi sự kiện có branding/không khí khác nhau.

Mỗi session có đúng 1 landing page, xuất hiện ở 3 nơi:

| Nơi | File | Vai trò |
|---|---|---|
| Tab "Landing Page" ở cửa sổ chính | `src/pages/LandingPage.tsx` | Preview read-only (tự poll config 2s), 2 nút mở **Builder** và **Presentation** |
| **Builder** (cửa sổ riêng, `#/landing-builder/:sessionId`) | `src/pages/LandingBuilderWindow.tsx` | Dựng trang: kéo-thả, chỉnh Properties Panel, Save/Discard. Singleton theo `sessionId` (mở lại chỉ focus cửa sổ cũ, `openLandingBuilderWindow` trong `electron/main.ts`) |
| **Present Mode** (cửa sổ riêng, `#/present/:sessionId`) | `src/pages/PresentMode.tsx` | Màn hình chiếu cho khán giả, chạy quay số thật — xem [presentation.md](./presentation.md) |

Cả 3 đọc/ghi **1 nguồn duy nhất**: cột `sessions.landing_config` (JSON `LandingConfig`, mục 9), và
vẽ bằng **cùng 1 painter** `LandingRenderer.tsx` — Builder và Present Mode luôn khớp pixel-cho-pixel,
không có 2 bộ code vẽ khác nhau dễ lệch theo thời gian. Các cửa sổ không chia sẻ React state, mỗi cửa
sổ tự fetch/poll qua IPC.

## 2. Bố cục cửa sổ Builder

- **Header**: Undo / Redo / History (mục 8) — nhãn **Unsaved**/**Saved** — **Discard** — **Save** (mục 9).
- **Canvas** ở giữa (mục 3), **toolbar nổi** góc trái trên (mục 4), cụm zoom góc dưới trái, minimap
  góc dưới phải.
- **Properties Panel** bên phải (mục 7), ẩn/hiện bằng nút ✕ / "Show panel" hoặc phím `Tab`.
- 3 flyout neo vào toolbar: **Add component** (mục 5), **Layers** (mục 6), **History** (mục 8) — click
  ra ngoài là đóng.

Builder tự poll `prizes.list`/`participants.list` mỗi **5s** để dữ liệu sửa ở cửa sổ khác (trang
Prizes, Data Editor) hiện ra mà không cần mở lại. Dữ liệu này truyền xuống canvas với `results: []` —
Builder không cần kết quả quay; Prize Image vẫn hiện đúng ảnh giải thật.

## 3. Canvas (`LandingCanvas.tsx`)

- **Artboard cố định 1920×1080** (`config.canvas`), chỉ co giãn hiển thị: `scale = fitScale × zoom`,
  zoom 100%–400% (bước 25%). Zoom bằng `Ctrl/Cmd +/-`, cụm nút góc dưới trái, cuộn chuột, hoặc pinch
  trackpad. Cuộn và pinch đi qua đúng 1 handler `wheel` gắn thủ công (prop `onWheel` của React bị
  passive, không `preventDefault` được). Pinch (Chromium tự gắn `ctrlKey`) LUÔN zoom; cuộn thường thì
  zoom ở Select tool, **pan** ở Hand tool — giống trackpad gốc macOS.
- **Frame** (component nhóm Basic, khung vùng LED cắt): ruột khung click xuyên qua, chỉ viền + nhãn bắt
  chuột; resize khoá tỉ lệ; tự bắt dính mép ảnh Background/canvas — xem [`output-frame.md`](output-frame.md).
- **Bàn nháp (pasteboard)**: mỗi bên thêm 50% kích thước khung thật (`PASTEBOARD_MARGIN_RATIO` — 960px
  trái/phải, 540px trên/dưới), tổng bằng 1 khung 3840×2160 bao quanh. Kéo/resize component ra hẳn
  ngoài khung được. Nền bàn nháp khác màu + khung thật có viền đậm riêng. `LandingCanvas` truyền
  `clip={false}` cho `LandingRenderer` nên component ở bàn nháp vẫn thấy nội dung thật; Present Mode
  và preview ở cửa sổ chính giữ `clip=true` mặc định — bàn nháp không bao giờ lọt vào buổi chiếu. Zoom
  100% = vừa CẢ bàn nháp.
- **Chọn**: click chọn 1; **Ctrl/Cmd+click** cộng/bớt khỏi vùng chọn; **kéo khung chọn (marquee)** trên
  nền trống chọn nhiều (giữ Ctrl/Cmd lúc bắt đầu kéo = cộng vào vùng chọn cũ).
- **Kéo/resize**: mousedown-based (mousemove/mouseup gắn ở `window`, chia cho `scale` ra toạ độ
  artboard). Resize qua 4 tay cầm góc, tối thiểu 20px. **Image** và **Prize** (xem
  [`image.md`](image.md), [`prize.md`](prize.md)) luôn khoá đúng tỉ lệ ảnh gốc khi resize (lấy
  `naturalWidth/naturalHeight` thật của ảnh — `srcDataUrl` cho Image, `prize.display_image` cho
  Prize — qua `mediaNaturalSizes` trong `LandingCanvas.tsx`, cùng cơ chế `bgNaturalSizes` đã dùng cho
  Background) — không có modifier (Shift) để tắt, vì ảnh bắt buộc hiển thị nguyên vẹn, không cho kéo
  méo/crop sai tỉ lệ. Trục kéo lệch nhiều hơn làm chủ đạo, trục còn lại tự suy theo tỉ lệ, góc đối diện
  đứng yên — cùng kỹ thuật khoá tỉ lệ đã dùng cho Frame (xem ngay bên dưới).
- **Smart guide** (`computeSnap`, ngưỡng 8px màn hình): khi kéo di chuyển, (1) **căn thẳng hàng** — mốc
  trái/tâm/phải (trên/giữa/dưới) trùng tâm khung thật hoặc mốc của component khác → bắt dính + hiện
  đường guide; (2) **khoảng cách đều** — nằm giữa 2 component và 2 khoảng trống gần bằng nhau → bắt
  dính cho bằng hẳn (như "Distribute spacing" của Figma). (1) ưu tiên hơn (2) trên cùng 1 trục.
- **Lưới 40px** (nút Gridline / phím `G`): THUẦN HIỂN THỊ, không bắt dính, phủ cả khung thật lẫn bàn
  nháp và khớp pha ở đường biên.
- **Thước** (`LandingRulers.tsx`): trải hết bàn nháp (âm ở đầu, vượt 1920/1080 ở cuối).
- **Hand tool / pan**: kẹp biên để bàn nháp không trôi khỏi màn hình; tự tắt khi zoom về 100% (không
  còn gì để pan); double-click reset về giữa.
- **Minimap** góc dưới phải: thu nhỏ bàn nháp + khung thật + khung nhìn hiện tại, chỉ hiển thị.
- **`hiddenInBuilder`** (bật/tắt ở Layers): ẩn component khỏi canvas Builder (cả vẽ lẫn khung chọn).
  Present Mode luôn bỏ qua cờ này.
- **Digit Roller tự khớp chiều cao**: Lucky Wheel template Digit Roller có height dẫn xuất từ width +
  `digitCount` (`fitAutoHeight`, áp sau mọi thay đổi và cả lúc mở Builder), không chỉnh tay.

## 4. Toolbar & phím tắt

Toolbar nổi góc trái trên: **Select** / **Hand** / **Gridline** / **Add component** / **Layers**. Di
chuột vào Select/Hand/Gridline hiện popup nhỏ tên nút + phím tắt (`ToolbarTooltip`, có độ trễ để không
nhấp nháy); nút Hand tự đổi nội dung báo lý do bị tắt khi đang vừa khít màn hình.

| Phím | Tác dụng |
|---|---|
| `V` / `Esc` | Select tool |
| `H` | Hand tool (chỉ khi đã zoom in) |
| `G` | Bật/tắt lưới |
| `Ctrl/Cmd` + `=` / `-` | Zoom in/out |
| `Ctrl/Cmd` + `Z` | Undo |
| `Ctrl/Cmd` + `Shift` + `Z`, hoặc `Ctrl/Cmd` + `Y` | Redo |
| `Delete` / `Backspace` | Xoá mọi component đang chọn |
| `Tab` | Ẩn/hiện Properties Panel |

Mọi phím tắt tự tắt khi đang gõ trong input/textarea/select/contentEditable (không nuốt chữ "h" khi
đang gõ nội dung Text, không xoá component khi Backspace trong ô số).

## 5. Add component — danh sách component

`ComponentPalette.tsx`: menu gom nhóm theo `CATEGORY_ORDER` (`componentRegistry.ts`), mỗi dòng icon +
tên (mô tả đầy đủ ở tooltip). Kéo 1 dòng thả lên canvas → `createComponentAt()` tạo instance với props
mặc định, tâm tại điểm thả, tự chọn nó và mở Properties Panel.

| Nhóm | Component | Tài liệu |
|---|---|---|
| **Basic** | Text | [components/text.md](./text.md) |
| | Image | [components/image.md](./image.md) |
| | Video | [components/video.md](./video.md) |
| | Background (tối đa 1/trang) | [components/background.md](./background.md) |
| | Frame — khung vùng LED cắt (tối đa 1/trang) | [components/output-frame.md](./output-frame.md) |
| **Draw** | Lucky Wheel (tối đa 1/trang) | [components/lucky-wheel.md](./lucky-wheel.md) |
| | Winner | [components/winner.md](./winner.md) |
| | Prize | [components/prize.md](./prize.md) |
| | Scoreboard (tối đa 1/trang) | [components/scoreboard.md](./scoreboard.md) |
| **Live** | Current Time | [components/current-time.md](./current-time.md) |
| | Participant Count | [components/participant-count.md](./participant-count.md) |
| **Interactive** | Button | [components/button.md](./button.md) |
| **Effects** | Orbit Lights | [components/orbit-lights.md](./orbit-lights.md) |
| | Fireworks | [components/fireworks.md](./fireworks.md) |
| | Confetti | [components/confetti.md](./confetti.md) |
| | Marquee Lights | [components/marquee-lights.md](./marquee-lights.md) |
| | Spark Fountain | [components/spark-fountain.md](./spark-fountain.md) |

**Giới hạn 1 cái/trang** (`handleDropNewComponent`): Background, Lucky Wheel, Scoreboard — thả cái
thứ 2 thì hiện thông báo lớn giữa màn hình ("Can't create more … — a page can only have 1.", tự tắt
sau 3s) thay vì toast nhỏ ở header dễ bị bỏ lỡ. Lý do: mỗi loại đại diện cho 1 thứ duy nhất của trang
(nền / nguồn kết quả quay / danh sách người trúng) — cái thứ 2 chỉ gây nhầm.

**Tự đặt tên** (`component.name`, chỉ dùng làm nhãn ở Layers — không có ô sửa tên trong Properties
Panel):
- Nhóm **Effects**: "Confetti 1", "Confetti 2"… (số nhỏ nhất còn trống theo đúng loại).
- **Button**: "Button", "Button 2"… — nhưng Layers hiện theo chữ thật trên nút (xem mục 6).
- Các loại khác: không đặt, Layers dùng nhãn loại.

## 6. Layers (`LayersPanel.tsx`)

Danh sách component theo thứ tự trước → sau: click để chọn, nút mắt bật/tắt `hiddenInBuilder`, kéo-thả
để đổi thứ tự (Builder quy đổi thành `zIndex`). Nhãn = `component.name` hoặc nhãn loại; riêng Button
tính lại đúng chữ đang hiện trên nút theo action ("Single Draw", "Confirm"…), vì `name` đặt 1 lần lúc
tạo không đổi theo action.

## 7. Properties Panel

`PropertiesPanel.tsx` là 1 switch thuần:
- Không chọn gì → gợi ý chọn/thêm component.
- Chọn **nhiều** → chỉ hiện "N components selected" + nút xoá hàng loạt.
- Chọn **1** → panel riêng theo `type` (`panels/XxxPanel.tsx`) + `SharedFields.tsx` ở cuối.

**`SharedFields.tsx`** (mọi loại): **X/Y/Width/Height**, **Effect** (hiệu ứng xuất hiện — dropdown hiện
thẳng tên kỹ thuật `none`/`fadeIn`/`slideUp`/`pulse`/`bounce`, chưa có nhãn đẹp; CSS
`landing-effect-*` trong `landingEffects.css`, chạy 1 lần lúc component mount), nút **Delete component**. Ngoại lệ **Winner** và **Lucky Wheel**: Position gộp
vào cuối "Basic options" của panel riêng, ẩn Effect (entrance chỉ chạy 1 lần lúc mở Present Mode, vô
nghĩa với 2 loại này).

### Quy ước bố cục panel (giữ đồng nhất)

1. **Basic options** — field tĩnh (nội dung, font, màu, nguồn dữ liệu…).
2. **Self Interactions** — phản ứng theo thao tác với CHÍNH component (vd Prize: Hover/Select/Won/Out
   of Stock; Lucky Wheel: Spin; Winner: Quick Draw).
3. **Interactions with Draw** — phản ứng theo quy trình quay Idle/Draw/Redraw. Component tĩnh dùng
   chung `DrawCycleFields.tsx` (checkbox **Trigger with Draw**), cơ chế ở
   [presentation.md → Interactions with Draw](./presentation.md#4-interactions-with-draw--model-idledrawredraw).

Component không có nhóm nào tương ứng thì bỏ hẳn nhóm đó (Current Time, Participant Count, Scoreboard,
Button chỉ có Basic options).

### `ColorField.tsx` — mọi ô chọn màu dùng chung

`<input type="color">` trần mở popup màu riêng của Chromium, nơi Ctrl/Cmd+V dán hex không hoạt động.
`ColorField` đặt 1 swatch nhỏ cạnh 1 ô text thật — gõ/dán hex bình thường; text gõ dở giữ ở state cục
bộ, chỉ `onChange` khi khớp `#RRGGBB`, tự đồng bộ lại khi giá trị đổi từ bên ngoài (Undo, đổi
component). Ô màu mới ở bất kỳ panel nào PHẢI dùng `ColorField`.

### Dropdown "Source" chọn cột Participant — đúng 1 trong 2 nhánh

| Field có yêu cầu Data Type cụ thể? | Cách liệt kê | Ví dụ |
|---|---|---|
| **KHÔNG** — cột nào cũng dùng được | TOÀN BỘ cột đang thực sự tồn tại (core field còn dữ liệu thật + mọi cột `extra_data`), không lọc Data Type. Có tiêu chí phụ thì đánh dấu option `disabled` kèm lý do (`title`), không ẩn | Lucky Wheel Draw/Display field; Source của Digit Roller (đúng `digitCount` ký tự); Scoreboard Columns |
| **CÓ** — sai ý nghĩa là hỏng chức năng | ĐÚNG các cột đang gán Data Type đó (`listParticipantColumnsForType`) và còn dữ liệu. Rỗng → `<select disabled>` placeholder `"Set a column's Data Type to <Type> first."`, không dropdown rỗng | Winner Source (Name); Button Open Link Source (URL) |

Lý do: Digit Roller không quan tâm cột "nghĩa là gì" (lọc theo type sẽ loại oan cột hợp lệ), còn Open
Link cần đúng 1 URL (liệt kê mọi cột sẽ cho chọn nhầm cột Name). Gốc của nhánh 2 là dropdown Source ở
Generate ▸ Display Phone của Data Editor. Dropdown Source mới PHẢI xếp vào 1 trong 2 nhánh, không tự
đặt luật riêng.

**Bẫy đã gặp**: 4 nhãn chung Name/Phone/Email/Code (bí danh cho cột SQL lõi) từng luôn hiện dù cột lõi
rỗng (từ khi import chuyển hẳn sang `extra_data`, xem
[`docs/participants/column-mapping.md`](../participants/column-mapping.md)). Giờ chỉ hiện khi cột lõi
cùng tên có dữ liệu thật (`computeActiveParticipantCoreFields`); field đang lưu là nhãn "ảo" thì panel
tự chuyển sang cột thật đầu tiên.

### Badge cảnh báo — chỉ ở canvas Builder

`LandingRenderer` gắn badge đỏ lên component khi `builderPreview` (không bao giờ ở Present Mode):
- **"⚠ Column not found: x"** — `missingColumnBindings()` đối chiếu cột mà Lucky Wheel
  (`drawField`/`displayField`/`winnerDisplayField`), Scoreboard (`columns`, bỏ qua 6 field cố định
  `SCOREBOARD_FIELDS`), Button Open Link (`urlField`) đang bind với `availableParticipantColumns()` — cột
  đã bị xoá ở Data Editor.
- **"⚠ Prize not found"** — `hasMissingPrizeBinding()`: component bật Trigger with Draw gán Prize đã bị
  xoá (chỉ kiểm khi danh sách prize đã nạp, tránh báo oan).

## 8. Undo / Redo / History (`useConfigHistory.ts`)

Khác Command Pattern `{execute, undo}` của Data Editor: `LandingConfig` là 1 object JSON nhỏ, nên mỗi
bước lưu nguyên 1 **snapshot**. Tối đa 100 bước.
- Thao tác **rời rạc** (Add/Delete, Reorder, ẩn/hiện layer…) gọi `set(updater, { commit: true, label })`
  → luôn là 1 bước riêng có nhãn ("Added Text", "Deleted 3 components"…).
- Thao tác **liên tục** (kéo/resize — bắn mỗi mousemove; gõ chữ; kéo slider/color picker) tự gộp vào
  1 bước nếu các lần sửa cách nhau dưới 600ms (`COALESCE_WINDOW_MS`) — nơi gọi không cần biết gesture
  bắt đầu/kết thúc.
- Flyout **History**: danh sách các bước, click 1 dòng để rollback thẳng tới đó.

## 9. Save / Discard / lưu trữ

- **Dirty** = `JSON.stringify(config)` khác bản đã Save gần nhất → nhãn **Unsaved**. **Save** ghi qua
  `window.api.sessions.updateLandingConfig`. **Discard** hỏi xác nhận rồi khôi phục bản đã Save (không
  hoàn tác được). Đóng cửa sổ khi còn dirty bị chặn bằng hộp thoại native (renderer báo trạng thái qua
  `landingBuilder.reportDirty`, main process chặn `close`).
- **Parse an toàn** (`parseLandingConfig`): chỉ kiểm `version === 1` + `components` là mảng + có
  `canvas`, sai thì rơi về config rỗng. Không có migration hình thức: field mới thêm vào 1 loại
  component xử lý ad hoc (optional + fallback ở view/panel).
- **Lọc type không còn tồn tại**: cả 3 nơi đọc config (Builder/Present Mode/`LandingPage.tsx`) bỏ
  component có `type` không có trong `COMPONENT_REGISTRY` (landing lưu từ trước khi 1 loại bị xoá).
- **Migrate ảnh nền cũ**: `canvas.background` kiểu ảnh (trước khi Background là component) tự thành 1
  Background component phủ kín canvas, `zIndex: -1` (`migrateLegacyBackground`).
- Mở Builder mà Digit Roller đang sai chiều cao (landing cũ) thì tự sửa và hiện **Unsaved**, không âm
  thầm ghi đè DB.
- **`landing_config` KHÔNG phải nơi duy nhất bị đổi khi vận hành trang**: action Confirm/Reset của
  Button ghi thẳng `draw_results`/`prizes.remaining`, ngoài JSON này và **không bị Discard hoàn tác** —
  xem [components/button.md](./button.md).

## 10. Thêm 1 loại component mới

Checklist 4 bước ở đầu `src/lib/landing/types.ts`:

1. Thêm `XxxProps` + `XxxComponent` vào union `LandingComponent`.
2. Thêm `views/XxxView.tsx` — chỉ render, nhận `props` + `LandingData`.
3. Thêm `panels/XxxPanel.tsx` + 1 case trong `PropertiesPanel.tsx`.
4. Đăng ký trong `componentRegistry.ts` (label, description, category, kích thước + props mặc định) —
   chỗ DUY NHẤT nối loại mới vào Palette và canvas. Thêm icon ở `componentIcons.tsx` và 1 case trong
   `renderComponent()` của `LandingRenderer.tsx`.

Kèm theo:
- Tôn trọng ranh giới Builder/Present Mode ([presentation.md mục 2](./presentation.md#2-pipeline-render--builder-preview-present-mode)):
  Builder LUÔN hiện khung tĩnh, animation thật chỉ chạy ở Present Mode.
- Cần "Interactions with Draw" → dùng thẳng `DrawCycleFields.tsx` + `useDrawCycleVisibility` + lấy
  resultId qua `drawCycleResultId()`, không viết lại.
- Ô màu dùng `ColorField`; dropdown chọn cột theo đúng 1 trong 2 nhánh Source ở mục 7.
- Cơ chế "khi nào chạy": hoặc Button gọi thẳng 1 hàm, hoặc tự phát hiện qua `LandingData` đổi (như
  Lucky Wheel dò `results[0].id`). Không dựng lại tầng tín hiệu trung gian nào (Trigger Graph đã bỏ).
- Viết tài liệu `docs/landing/<ten-component>.md` + thêm 1 dòng vào bảng mục 5.

## 11. Kỹ thuật đồ hoạ — chọn tier nào cho hiệu ứng

Bối cảnh: Electron = **Chromium đầy đủ** trên máy người tổ chức (Canvas 2D, WebGL, CSS filter, rAF…);
chạy **100% offline** (mọi asset phải nằm trong bundle hoặc base64 trong `landing_config`); màn khán giả
cố định 1920×1080; KHÔNG có thư viện đồ hoạ nào cài sẵn (Three.js/Pixi/Lottie đều chưa có).

| Tier | Kỹ thuật | Mạnh | Giới hạn | Dùng cho |
|---|---|---|---|---|
| **1. CSS thuần** | transform/opacity/filter, `@keyframes` (file `.css` riêng như `landingEffects.css`), với animation vật lý thì ghi thẳng `style.transform` qua ref trong rAF (không setState mỗi frame) | Rẻ nhất, GPU tự tăng tốc, không dependency | Vài trăm DOM node là giật; không vẽ tự do được | Entrance effect, dim/glow, Spotlight của Prize, Digit Roller |
| **2. Canvas 2D** | `<canvas>` + rAF, mảng particle trong closure/ref | Hàng trăm → 1-2 nghìn hạt vẫn mượt, vẽ tự do | Tự viết toàn bộ vật lý; vẫn là CPU vẽ | **Sweet spot** — toàn bộ nhóm Effects |
| **3. WebGL / Three.js / PixiJS** | Thêm thư viện, shader GPU | Chục nghìn hạt, 3D thật, shader lửa/khói | Dependency lớn (Three.js lõi ~600KB+), đường cong học, rủi ro driver | CHỈ khi Tier 2 đã thử và không đủ |
| **4. Asset ngoài** | Video/GIF/Lottie (`lottie-web` ~30KB)/SVG/Web Audio | Chất lượng cao nhất nếu có designer | Asset phải lưu cục bộ, nặng — phải quyết định base64 trong config hay file riêng + IPC TRƯỚC khi code | Hiệu ứng "wow" có sẵn asset |

Khuyến nghị: mặc định bám Tier 1-2; Tier 4 (Lottie) đáng cân nhắc sớm nếu có designer; Tier 3 chỉ khi
có nhu cầu cụ thể — đúng nguyên tắc không thêm dependency "phòng khi cần" (`CLAUDE.md`).

Checklist cho mọi effect: dọn `cancelAnimationFrame`/`clearTimeout` trong cleanup của `useEffect`
(component có thể bị xoá giữa lúc đang chạy).

### Khuôn chung của nhóm Effects

Áp dụng cho Orbit Lights, Fireworks, Confetti, Marquee Lights, Spark Fountain (đều Tier 2, Canvas 2D).
Effect mới cùng nhóm theo đúng khuôn này:

- **Cấu trúc**: 1 hàm vẽ thuần + prop `animate` (= `interactive`, chỉ Present Mode chạy rAF) +
  `DrawCycleFields` cho Interactions with Draw (Appear/Disappear, mặc định tắt = luôn hiện + luôn
  chạy). Đăng ký `category: "Effects"`. Khung mặc định phủ cả canvas 1920×1080; wrapper
  `pointerEvents: none` nên không chặn click Button/Prize bên dưới — muốn hiệu ứng nằm sau component
  khác thì kéo xuống trong Layers.
- **2 họ kỹ thuật** — chọn đúng họ trước khi viết:

  | Họ | Khi nào | Effect | Đặc điểm |
  |---|---|---|---|
  | Hàm thuần theo thời gian | Mọi thứ suy ra được từ (chỉ số, t) — tuần hoàn | Orbit Lights, Marquee Lights | `drawFrame(ctx, w, h, props, elapsedMs)`; khung tĩnh Builder = `elapsedMs = 0`; `startRef` giữ mốc thời gian qua các lần poll config 2s (đổi màu/tốc độ không làm hạt nhảy về đầu) |
  | Mô phỏng có trạng thái | Hạt sinh ra/mất đi, phụ thuộc lịch sử | Fireworks, Confetti, Spark Fountain | `createShow()` → `step(dt)` + `draw(ctx)` tách rời; khung tĩnh Builder = mô phỏng trước N giây bằng `seededRng(1)` (`views/seededRng.ts`, mulberry32) nên cùng props luôn ra cùng 1 hình; Present Mode dùng `Math.random`; `dt` chặn 50ms (tab bị treo quay lại không nhảy cóc); có trần số hạt |

- **Chung cả 2 họ**: deps của effect là `JSON.stringify(props)`, KHÔNG phải object `props` — Present
  Mode poll config 2s ra object mới dù không đổi gì, deps theo identity sẽ huỷ + chạy lại từ đầu mỗi
  2s. Glow bằng `globalCompositeOperation = "lighter"` + nét rộng mờ chồng nét lõi, hoặc sprite vẽ sẵn
  (`spriteCache`) — KHÔNG `shadowBlur` cho hàng trăm hạt/khung hình (phần đắt nhất). Vật thể không tự
  phát sáng (giấy Confetti) vẽ `source-over`.
- **Quy ước Properties Panel** (người dùng đã duyệt, giữ đồng nhất): 1 nhóm **Basic options** phẳng
  (nhãn tiếng Anh ngắn; số lượng/kích thước/thời gian = ô số lưới 2 cột; tỉ lệ %/góc = thanh trượt có
  giá trị ngay trên nhãn; field chỉ có nghĩa ở 1 chế độ thì ẩn khi không dùng) → **Colors** (1–6 ô
  `ColorField`, nút × xoá, "+ Add color") → vạch ngăn → **Interactions with Draw**.
- **Tên tự động** "Confetti 1", "Confetti 2"… khi thả vào trang (mục 5) — effect mới tự có.
- Hướng gợi ý tiếp theo (năng lượng/ăn mừng/sân khấu): Coin Shower (mưa tiền vàng/lì xì), Stage Beams,
  Camera Flash, Shockwave, Balloons. Đã thử và bỏ: xem mục 12.

## 12. Đã bỏ — đừng làm lại

| Đã bỏ | Lý do / thay bằng |
|---|---|
| Trigger Graph (Signal Emitter/Receiver + màn hình nối dây) | Quá phức tạp so với app quay số. Button chạy thẳng 1 action cố định |
| `EffectReaction` (mảng `reactions` dim/scale/glow gắn theo trigger draw/confirm/redo, `ReactionsEditor`, `useActiveReactions`) | Gỡ khỏi code. Thay bằng "Interactions with Draw" của từng component và hiệu ứng của Prize |
| Component Spotlight đứng riêng, component Firework gắn giải | Spotlight thành 1 lựa chọn Highlight của Prize; pháo hoa thành component Fireworks của nhóm Effects |
| Nền trang toàn cục ("Page settings", màu nền/letterbox, "Dim background while Revealed") | Background là component bình thường; phần không phủ luôn đen; dim nền qua Interactions with Draw của Background |
| Effect Sunburst, Twinkle Stars, Falling Petals | Là nền trang trí êm dịu, không có không khí "trúng thưởng" |
| Ô Label của Button; dropdown Spin style/Timing/Effect của Lucky Wheel | Xem [button.md](./button.md), [lucky-wheel.md](./lucky-wheel.md) |

## 13. File liên quan

| File | Vai trò |
|---|---|
| `src/pages/LandingBuilderWindow.tsx` | Cửa sổ Builder — header, toolbar, phím tắt, thả component mới, Save/Discard |
| `src/components/landing/LandingCanvas.tsx` | Artboard — chọn/kéo/resize/marquee/smart guide/pan/zoom/minimap |
| `src/components/landing/LandingRulers.tsx` | Thước ngang/dọc |
| `src/components/landing/LandingRenderer.tsx` | Painter dùng chung với Present Mode, badge cảnh báo |
| `src/components/landing/PropertiesPanel.tsx` | Switch panel theo type, trạng thái chọn nhiều |
| `src/components/landing/panels/` | 1 panel/loại + `SharedFields`, `ColorField`, `DrawCycleFields` dùng chung |
| `src/components/landing/componentRegistry.ts` | `COMPONENT_REGISTRY`, `CATEGORY_ORDER`, props mặc định |
| `src/components/landing/ComponentPalette.tsx` / `componentIcons.tsx` | Menu Add component / icon |
| `src/components/landing/LayersPanel.tsx` | Layers |
| `src/components/landing/useConfigHistory.ts` | Undo/Redo/History |
| `src/lib/landing/types.ts` | Toàn bộ type, parse/migrate config, checklist thêm component |

# LANDING BUILDER

Tài liệu này giải thích **toàn bộ** màn hình Landing Page Builder: 2 cửa sổ liên quan
(Builder/Present Mode), Canvas mode, Properties Panel, các nhóm component, và cách dữ liệu được
lưu. Cơ chế **Trigger Graph** (màn hình nối dây tín hiệu) đã có tài liệu riêng, đầy đủ chi tiết ở
[`docs/graph.md`](./graph.md) — file này KHÔNG lặp lại nội dung đó, chỉ tham chiếu tới khi cần.
Đọc file này trước khi sửa bất kỳ gì trong `src/pages/LandingBuilderWindow.tsx`,
`src/components/landing/` (ngoại trừ `triggerGraph/`, xem `docs/graph.md`), hoặc
`src/lib/landing/types.ts`.

## 1. Tổng quan — 2 cửa sổ, 1 nguồn dữ liệu

Landing Builder và Present Mode là **2 cửa sổ Electron riêng biệt**, không dùng chung React state
(mỗi cửa sổ tự fetch/poll dữ liệu qua IPC):

- **Builder** (`#/landing-builder/:sessionId`, `LandingBuilderWindow.tsx`) — nơi dựng trang: kéo-thả
  component, chỉnh Properties Panel, nối dây Trigger Graph. Mở từ nút "Landing Builder" trên tab
  "Landing Page" của cửa sổ chính (`src/pages/LandingPage.tsx`). Singleton theo `sessionId` — mở lại
  khi đã có cửa sổ cùng session chỉ focus lại, không mở cửa sổ mới (`electron/main.ts`,
  `openLandingBuilderWindow`).
- **Present Mode** (`#/present/:sessionId`, `src/pages/PresentMode.tsx`) — màn hình thật chiếu cho
  khán giả xem, chỉ render (không sửa được gì). Mở từ `LandingPage.tsx` hoặc
  `DrawSessionDetail.tsx`. Tự poll `sessions:get` mỗi 2s để nhận Save mới nhất từ Builder mà không
  cần đóng/mở lại.

Cả 2 cửa sổ đọc/ghi **1 nguồn duy nhất**: cột `sessions.landing_config` (JSON, xem mục 9). Cùng
1 hàm `LandingRenderer.tsx` được cả `LandingCanvas` (Builder) lẫn `PresentMode` dùng để vẽ component
— đảm bảo Builder và Present Mode LUÔN khớp pixel-cho-pixel, không có 2 bộ code vẽ khác nhau dễ lệch
nhau theo thời gian.

## 2. Canvas mode

Artboard cố định **1920×1080** (`config.canvas.width/height`) — không đổi kích thước theo cửa sổ,
chỉ co giãn hiển thị (`scale = fitScale × zoom`, zoom 100%–400%, `Ctrl/Cmd +/-`).

- **Chọn/kéo/resize**: mousedown-based (mousemove/mouseup gắn ở `window`, chia cho `scale` để ra
  đúng toạ độ artboard) — cùng kỹ thuật với việc kéo-resize cột trong Data Editor. Resize qua 4 tay
  cầm góc, kích thước tối thiểu 20px, luôn kẹp trong biên 1920×1080.
- **Smart guide bắt dính tâm canvas**: kéo di chuyển (không phải resize) — nếu tâm component đang
  kéo tới gần tâm ngang/dọc của canvas (trong 8px màn hình, quy đổi theo `scale`), tự bắt dính đúng
  tâm và hiện đường guide đỏ, giống Figma/Photoshop.
- **Lưới (Grid)**: nút Gridline bật/tắt 1 lớp lưới 40px THUẦN HIỂN THỊ (không bắt dính toạ độ nào) —
  chỉ để căn mắt.
- **Hand tool / pan**: kéo cả khung nhìn, kẹp biên để artboard không trôi mất khỏi màn hình;
  double-click reset về giữa.
- Component có `hiddenInBuilder: true` vẫn hiện trong `LayersPanel` để bật lại, nhưng ẩn khỏi vùng
  chọn/kéo trên canvas (Present Mode luôn phớt lờ cờ này — khán giả luôn thấy đúng những gì config
  khai báo).
- Có `LandingRulers.tsx` vẽ thước kẻ trên/trái, tham chiếu theo toạ độ artboard.

## 3. Toolbar & phím tắt

Toolbar nổi góc trái trên, dịch sang phải khi ở Trigger Graph mode (tránh đè `TriggerSidebar`):

- **Select** (phím `V`/`Esc`) / **Hand** (phím `H`, tắt khi đã fit-to-screen ở Canvas mode vì không
  còn gì để pan) — dùng chung cho cả Canvas lẫn Trigger Graph.
- **Gridline** — dùng chung cho cả 2 màn hình (mỗi màn hình tự vẽ lưới bằng cơ chế riêng).
- Chỉ hiện ở Canvas mode: **Add component** (mở `ComponentPalette`, xem mục 5), **Layers** (mở/ẩn +
  sắp xếp component), **Page settings** (chỉnh background — mở Properties Panel khi chưa chọn gì).
  Những nút này ẩn hẳn ở Trigger Graph mode vì không có ý nghĩa gì ở đó.
- **Trigger Graph** — nút tròn nhỏ đổi thành nút to "Back to Builder" khi đang ở trong Graph, tránh
  người dùng không biết cách thoát ngoài việc đóng hẳn cửa sổ.

Phím tắt khác: `Delete`/`Backspace` xoá component đang chọn (chỉ ở Canvas mode). Mọi phím tắt tự tắt
khi đang gõ trong input/textarea/select/contentEditable.

## 4. Properties Panel

`PropertiesPanel.tsx` là 1 switch thuần: chưa chọn gì → `BackgroundPanel` (nền trang); có chọn → 1
Panel riêng theo đúng `type` của component + `SharedFields.tsx` luôn hiện ở cuối.

`SharedFields.tsx` — dùng chung cho MỌI loại: **Name** (optional, trừ Button có ô Name riêng bắt
buộc+duy nhất vì Button cần định danh rõ ràng trên Trigger Graph), **X/Y/Width/Height** (Height khoá
"auto" nếu là Lucky Wheel dùng template Digit Roller — chiều cao tự tính theo `digitCount`),
**Effect** (fade/slide/pulse/bounce khi component xuất hiện), nút **Delete component**.

| Panel file | Dùng cho |
|---|---|
| `BackgroundPanel.tsx` | Nền trang (khi chưa chọn component nào) |
| `TextPanel.tsx` | Text |
| `ImagePanel.tsx` | Image |
| `LuckyWheelPanel.tsx` | Lucky Wheel (cả 2 template `wheel`/`digitRoller`) |
| `LiveTextPanel.tsx` | Winner Name, Prize Name (dùng chung) |
| `LiveImagePanel.tsx` | Prize Image |
| `PrizeListPanel.tsx` | Prize List |
| `CountdownPanel.tsx` | Countdown |
| `CurrentTimePanel.tsx` | Current Time |
| `ParticipantCountPanel.tsx` | Participant Count |
| `ButtonPanel.tsx` | Button |
| `ScoreboardPanel.tsx` | Scoreboard |
| `FireworksPanel.tsx` | Fireworks |
| `StageLightPanel.tsx` | Stage Light |
| `LinkOpenerPanel.tsx` | Link Opener |
| `DrawPanel.tsx` | Draw |
| `ConfirmWinnerPanel.tsx` | Confirm Winner |

## 5. Nhóm component (`ComponentPalette.tsx`)

Menu "Add component" gom nhóm theo `CATEGORY_ORDER` (`componentRegistry.ts`) — chỉ hiện icon + tên
mỗi dòng (mô tả đầy đủ xem qua tooltip hover), giúp tìm nhanh thay vì cuộn qua 1 danh sách phẳng dài.
Nhóm theo **công dụng người dùng nhìn thấy**, không theo kiến trúc Emitter/Receiver bên trong (1
nhóm có thể trộn cả 2 — vd Draw & Results gồm cả Lucky Wheel lẫn các text hiển thị thuần):

| Nhóm | Component | Mô tả |
|---|---|---|
| **Basic** | Text | Nhãn/tiêu đề tĩnh |
| | Image | Logo, banner, ảnh trang trí |
| **Draw & Results** | Lucky Wheel | Vòng quay/Digit Roller gắn với Draw Engine |
| | Winner Name | Tên người trúng gần nhất |
| | Prize Name | Tên giải vừa trúng gần nhất |
| | Prize Image | Ảnh giải vừa trúng gần nhất |
| | Prize List | Danh sách toàn bộ giải trong session |
| | Scoreboard | Bảng người trúng đã confirm, hiện qua popup |
| **Live Info** | Countdown | Đếm ngược tới 1 mốc thời gian |
| | Current Time | Đồng hồ thời gian thực |
| | Participant Count | Số người tham gia trong session |
| **Interactive** | Button | Signal Emitter — chỉ phát `Button.Click` |
| **Effects** | Fireworks | Hiệu ứng pháo hoa hạt |
| | Stage Light | Đèn sân khấu quét |
| **Actions** | Link Opener | Mở URL của winner trong trình duyệt |
| | Draw | Chọn 1 candidate mới cho lượt quay |
| | Confirm Winner | Ghi thật candidate đang chờ vào database |

## 6. Actions — chi tiết

**Action** là 1 nhóm con của Signal Receiver: KHÔNG có bất kỳ nội dung hiển thị nào cho khán giả,
dù đang "hoạt động" hay không (khác hẳn Effects — Fireworks/Stage Light tồn tại CHÍNH để khán giả
nhìn thấy). Action chỉ là 1 hành động 1 lần khi nhận đúng Command, rồi hoàn toàn vô hình trở lại.

> **⚠️ Quan trọng — Action là nhóm component DUY NHẤT có thể ghi dữ liệu THẬT, VĨNH VIỄN, ngoài
> phạm vi `landing_config`.**
>
> Mọi component khác (Text, Lucky Wheel, Fireworks, kể cả Button) — toàn bộ "trạng thái" của nó chỉ
> nằm trong khối JSON `landing_config` (xem mục 9). Sửa gì, kéo gì, xoá gì ở Builder cũng chỉ đổi
> khối JSON đó — bấm **Discard** là quay lại y nguyên bản đã Save gần nhất, không có gì mất thật.
>
> **Confirm Winner thì khác**: khi được trigger, nó gọi thẳng `sequence.confirm()` →
> `window.api.draw.commit()` → ghi **1 dòng thật vào bảng `draw_results`** và **trừ
> `prizes.remaining`** trong SQLite — trong 1 transaction, ở `commitDraw()`
> (`electron/drawEngine.ts`). Đây là ghi DB thật, **Discard của Landing Builder không hề đụng tới
> và không thể hoàn tác** (cách duy nhất huỷ là `resetSession()` — xoá TOÀN BỘ kết quả của cả
> session, không phải riêng 1 lượt). `draw_results`/`prizes.remaining` chính là dữ liệu mà Data
> Editor và màn hình quản lý Prize đọc/hiển thị — nghĩa là Action không chỉ đổi "trang landing" mà
> đổi luôn dữ liệu THẬT của cả sự kiện, ngoài phạm vi những gì Builder tự quản lý.
>
> `Draw` "nhẹ" hơn 1 chút: `sequence.pick()` KHÔNG ghi DB (chỉ SELECT chọn ứng viên), nhưng ứng viên
> đang chờ đó (`candidate`) đã được "độn" ngay vào `results[0]` (một dòng giả, xem
> `useDrawSequence.ts`'s `effectiveData`) — nghĩa là MỌI component đọc dữ liệu (Winner Name, Lucky
> Wheel...) đã thấy "có kết quả" NGAY khi Draw chạy, **trước khi** Confirm Winner ghi DB thật. Nếu
> Draw chạy nhưng Confirm Winner không bao giờ chạy theo sau, ứng viên đó vẫn hiện trên màn hình
> nhưng KHÔNG BAO GIỜ thật sự tồn tại trong `draw_results`.
>
> `Link Opener` không ghi gì vào DB, nhưng vẫn có hệ quả ngoài `landing_config`: mở 1 trình duyệt
> ngoài thật sự trên máy đang chạy Present Mode.

Danh sách Action hiện có:

| Action | Command nhận | Ghi gì | Ghi chú |
|---|---|---|---|
| **Draw** | `Draw.Pick` | Không ghi DB (chỉ SELECT) | Ngoại lệ hẹp — emits `Draw.Picked` sau khi `pick()` thật sự resolve (xem `docs/graph.md`) |
| **Confirm Winner** | `ConfirmWinner.Confirm` | `INSERT draw_results` + `UPDATE prizes.remaining` | Ghi DB thật, không hoàn tác qua Discard |
| **Link Opener** | `LinkOpener.Open` | Không ghi DB | Mở trình duyệt ngoài qua `shell.openExternal` |

Ví dụ chuỗi hoàn chỉnh (đúng thứ tự mỗi bước chờ bước trước THẬT SỰ xong, không đoán delay):

```
Button.Click → Draw.Pick → Draw.Picked → Wheel.StartSpin → Wheel.SpinCompleted → ConfirmWinner.Confirm
```

1 cú click của người vận hành → Draw chọn 1 ứng viên (bất đồng bộ) → xong thì Lucky Wheel bắt đầu
quay reveal đúng ứng viên đó → quay xong thật sự thì Confirm Winner ghi kết quả vào DB. Xem
`docs/graph.md` để biết cách kéo-thả nối dây các bước này trên Trigger Graph.

## 7. Signal Emitter/Receiver — tóm tắt

Landing component chủ yếu thuộc 1 trong 2 nhóm: **Emitter** (Button — chỉ phát Event, không biết gì
về phần còn lại của app) và **Receiver** (mọi Action/Effect/Lucky Wheel — chỉ nhận Command rồi tự
thực thi). Trigger Graph là tầng trung gian DUY NHẤT nối 2 nhóm này. Toàn bộ cơ chế kéo-thả tín
hiệu, node/chip, validate, và cách 1 Command thật sự chạy lúc Present Mode — xem
**[`docs/graph.md`](./graph.md)**, không lặp lại ở đây.

## 8. Present Mode render khác Builder canvas thế nào

Cả 2 dùng chung `LandingRenderer.tsx`, khác nhau ở prop `interactive`:

- **`interactive=true`** (chỉ Present Mode): mỗi Receiver nhận `sequence` thật (không phải
  `undefined`) nên mới thực thi Command thật; `hiddenInBuilder` bị phớt lờ (khán giả luôn thấy đúng
  những gì config khai báo); Scoreboard vẽ như 1 modal riêng canh giữa màn hình, chỉ hiện khi
  `sequence.scoreboardVisible`.
- **`interactive=false`** (Builder canvas): mọi Receiver nhận `sequence=undefined` → tự vẽ 1 khung
  tĩnh/preview (vd Stage Light đứng yên ở góc quét mặc định, Draw/Confirm Winner/Link Opener hiện
  khung chấm chấm) thay vì chạy animation/Command thật — tránh bấm nhầm khi đang chỉnh sửa; Scoreboard
  vẽ tại chỗ theo x/y như mọi component khác (để còn kéo/resize được).

## 9. Save / Discard / lưu trữ

`config` (Canvas lẫn Trigger Graph dùng chung, không tách biệt) coi là "dirty" khi khác bản JSON đã
Save gần nhất. Nút **Save** ghi xuống `sessions.landing_config` qua
`window.api.sessions.updateLandingConfig`; **Discard** hỏi xác nhận rồi khôi phục nguyên bản JSON đã
Save. Đóng cửa sổ khi còn dirty bị chặn bằng hộp thoại cảnh báo native (Electron `BrowserWindow`
`close` event).

Không có hệ thống migration hình thức cho `landing_config` — `parseLandingConfig()` chỉ kiểm tra
`version === 1` + `components` là mảng + có `canvas`, sai bất kỳ điều nào thì fallback thẳng về
`DEFAULT_LANDING_CONFIG` (rỗng) thay vì cố gắng chuyển đổi shape cũ. Field mới thêm vào 1 loại
component theo thời gian được xử lý ad hoc ở cấp type/view/panel (optional field + fallback), không
qua 1 cơ chế version-bump chung nào.

## 10. Thêm 1 loại component mới

Xem checklist đầy đủ (5 bước, bước 0 là phân loại Emitter/Receiver) ở đầu `src/lib/landing/
types.ts`. Tóm tắt: 1) thêm type + interface vào union `LandingComponent`; 2) thêm
`views/XxxView.tsx`; 3) thêm `panels/XxxPanel.tsx`; 4) đăng ký trong `componentRegistry.ts` (label,
category cho Palette, `COMPONENT_SIGNALS` nếu là Emitter/Receiver). Nếu là Receiver, xem thêm
`docs/graph.md` để hiểu cách nó xuất hiện trên Trigger Graph.

## 11. File liên quan

| File | Vai trò |
|---|---|
| `src/pages/LandingBuilderWindow.tsx` | Cửa sổ Builder — toolbar, Save/Discard, chuyển Canvas/Graph mode |
| `src/pages/PresentMode.tsx` | Cửa sổ chiếu cho khán giả — chỉ render, poll config mỗi 2s |
| `src/components/landing/LandingCanvas.tsx` | Artboard 1920×1080 — chọn/kéo/resize/pan/zoom |
| `src/components/landing/LandingRenderer.tsx` | Painter thuần — dùng chung bởi Canvas lẫn Present Mode, switch theo `component.type` |
| `src/components/landing/PropertiesPanel.tsx` | Container Properties Panel — switch theo type + `SharedFields` |
| `src/components/landing/componentRegistry.ts` | `COMPONENT_REGISTRY` (Palette/canvas) + `COMPONENT_SIGNALS` (Trigger Graph) — nguồn DUY NHẤT |
| `src/components/landing/ComponentPalette.tsx` | Menu "Add component" — kéo-thả tạo instance mới, gom nhóm theo `CATEGORY_ORDER` |
| `src/components/landing/componentIcons.tsx` | Icon dùng chung cho Palette lẫn Trigger Graph node |
| `src/components/landing/useDrawSequence.ts` | `pick()`/`confirm()`/`redo()`/`fireClick()` — cầu nối duy nhất từ Landing sang Draw Engine |
| `src/lib/landing/types.ts` | Toàn bộ type hệ thống + checklist thêm component mới |
| `docs/graph.md` | Cơ chế Trigger Graph đầy đủ (kéo-thả tín hiệu, node/chip, chạy Command lúc Present Mode) |

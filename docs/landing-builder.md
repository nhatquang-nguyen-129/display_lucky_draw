# LANDING BUILDER

Tài liệu này giải thích **toàn bộ** màn hình Landing Page Builder: 2 cửa sổ liên quan
(Builder/Present Mode), Canvas mode, Properties Panel, các nhóm component, cách Button chạy action,
và cách dữ liệu được lưu. Đọc file này trước khi sửa bất kỳ gì trong
`src/pages/LandingBuilderWindow.tsx`, `src/components/landing/`, hoặc `src/lib/landing/types.ts`.

## 1. Tổng quan — 2 cửa sổ, 1 nguồn dữ liệu

Landing Builder và Present Mode là **2 cửa sổ Electron riêng biệt**, không dùng chung React state
(mỗi cửa sổ tự fetch/poll dữ liệu qua IPC):

- **Builder** (`#/landing-builder/:sessionId`, `LandingBuilderWindow.tsx`) — nơi dựng trang: kéo-thả
  component, chỉnh Properties Panel. Mở từ nút "Landing Builder" trên tab "Landing Page" của cửa sổ
  chính (`src/pages/LandingPage.tsx`). Singleton theo `sessionId` — mở lại khi đã có cửa sổ cùng
  session chỉ focus lại, không mở cửa sổ mới (`electron/main.ts`, `openLandingBuilderWindow`).
- **Present Mode** (`#/present/:sessionId`, `src/pages/PresentMode.tsx`) — màn hình thật chiếu cho
  khán giả xem, chỉ render (không sửa được gì). Mở từ `LandingPage.tsx` hoặc
  `DrawSessionDetail.tsx`. Tự poll `sessions:get` mỗi 2s để nhận Save mới nhất từ Builder mà không
  cần đóng/mở lại.

Cả 2 cửa sổ đọc/ghi **1 nguồn duy nhất**: cột `sessions.landing_config` (JSON, xem mục 8). Cùng
1 hàm `LandingRenderer.tsx` được cả `LandingCanvas` (Builder) lẫn `PresentMode` dùng để vẽ component
— đảm bảo Builder và Present Mode LUÔN khớp pixel-cho-pixel, không có 2 bộ code vẽ khác nhau dễ lệch
nhau theo thời gian. Cả 3 nơi đọc `landing_config` (Builder/Present Mode/`LandingPage.tsx` ở cửa sổ
chính) đều tự lọc bỏ component có `type` không còn tồn tại trong `COMPONENT_REGISTRY` ngay khi
parse — an toàn cho landing đã lưu từ trước khi 1 loại component bị xoá khỏi app.

## 2. Canvas mode

Artboard cố định **1920×1080** (`config.canvas.width/height`) — không đổi kích thước theo cửa sổ,
chỉ co giãn hiển thị (`scale = fitScale × zoom`, zoom 100%–400%). Đổi zoom qua `Ctrl/Cmd +/-`, nút
+/- ở góc dưới trái, hoặc cuộn chuột/pinch 2 ngón trực tiếp trên canvas — cả cuộn chuột (Windows/
macOS) lẫn pinch trackpad (macOS) đều nhận qua đúng 1 handler `wheel` gắn thủ công (không dùng prop
`onWheel` của React vì bị passive mặc định từ React 17, không preventDefault được) trong
`LandingCanvas.tsx`, xem comment tại đó. Giống hành vi trackpad gốc của macOS: pinch (2 ngón chụm/
xoè) LUÔN zoom bất kể tool nào đang bật; cuộn 2 ngón thường (không chụm) thì zoom nếu đang ở Select
tool, còn PAN nếu đang bật Hand tool — không cần giữ chuột kéo mới di chuyển được khung nhìn.

- **Chọn/kéo/resize**: mousedown-based (mousemove/mouseup gắn ở `window`, chia cho `scale` để ra
  đúng toạ độ artboard) — cùng kỹ thuật với việc kéo-resize cột trong Data Editor. Resize qua 4 tay
  cầm góc, kích thước tối thiểu 20px.
- **Bàn nháp (pasteboard) ngoài khung 1920×1080** — vùng chỉnh sửa THỰC TẾ rộng hơn hẳn khung hiển
  thị thật: mỗi bên (trái/phải/trên/dưới) có thêm 50% kích thước tương ứng của khung thật
  (`PASTEBOARD_MARGIN_RATIO` trong `LandingCanvas.tsx` — 960px hai bên trái/phải, 540px trên/dưới),
  tức tổng diện tích bàn nháp đúng bằng 1 khung 3840×2160 (4K) bao quanh khung thật nằm giữa —
  cho phép kéo/resize 1 component ra HẲN ngoài khung hiển thị thật. Đây là chỗ chuẩn bị sẵn cho hiệu
  ứng "xuất hiện từ ngoài khung vào trong" sau này (bản thân hiệu ứng animate chưa làm ở bản này) —
  nền bàn nháp tô màu khác (`bg-base-900`) + khung thật có viền đậm riêng (`outline-2 outline-base-400`)
  để phân biệt rõ ranh giới, không lẫn với viền `outline-gold-500` của component đang được chọn.
  Lưới căn chỉnh (xem bên dưới) cũng phủ đều lên cả bàn nháp, không riêng gì khung thật.
  **Vẫn thấy được nội dung thật của component khi đang đặt ở bàn nháp** — `LandingRenderer.tsx`
  nhận thêm prop `clip` (mặc định `true`, LUÔN `overflow-hidden` đúng khung width/height thật);
  CHỈ riêng lời gọi từ `LandingCanvas.tsx` truyền `clip={false}` để nội dung/màu sắc thật của 1
  component ở bàn nháp vẫn hiện ra trong lúc chỉnh sửa, thay vì bị cắt mất chỉ còn khung chọn rỗng.
  **An toàn tuyệt đối cho Present Mode**: `PresentMode.tsx` và `LandingPage.tsx` (preview read-only
  trong cửa sổ chính) đều KHÔNG truyền `clip` nên vẫn giữ nguyên `clip=true` mặc định — bàn nháp
  không bao giờ lọt vào buổi trình chiếu thật hay preview đó, chỉ là tiện ích riêng của MÀN HÌNH
  CHỈNH SỬA trong Builder. "Vừa khung" (100%, mức zoom out tối đa) giờ nghĩa là vừa CẢ bàn nháp
  (không chỉ riêng khung thật) — margin luôn hiện sẵn ngay từ đầu, không cần zoom out thêm mới thấy.
- **Thước (Rulers)**: vạch chia trải dài hết cả phần bàn nháp (âm ở đầu, vượt 1920/1080 ở cuối),
  không chỉ riêng khung thật — thấy được toạ độ của cả component đang đặt ngoài khung.
- **Smart guide bắt dính tâm canvas**: kéo di chuyển (không phải resize) — nếu tâm component đang
  kéo tới gần tâm ngang/dọc của khung THẬT (trong 8px màn hình, quy đổi theo `scale`), tự bắt dính
  đúng tâm và hiện đường guide đỏ, giống Figma/Photoshop — không đổi bởi bàn nháp, tâm luôn là tâm
  khung 1920×1080 thật.
- **Lưới (Grid)**: nút Gridline bật/tắt 1 lớp lưới 40px THUẦN HIỂN THỊ (không bắt dính toạ độ nào) —
  chỉ để căn mắt, phủ đều lên CẢ khung thật lẫn bàn nháp (lưới ở 2 vùng luôn khớp pha nhau, không bị
  lệch ở đường biên — `backgroundPosition` neo theo đúng gốc toạ độ khung thật).
- **Hand tool / pan**: kéo cả khung nhìn, kẹp biên để bàn nháp (khung thật + margin) không trôi mất
  khỏi màn hình; double-click reset về giữa.
- **Minimap** góc dưới-phải: thu nhỏ toàn bộ bàn nháp, vẽ khung thật (viền mảnh) + khung nhìn hiện tại
  (viền vàng) — chỉ hiển thị, không tương tác (`pointer-events-none`). Dùng để xác nhận trực quan pan
  có kẹp đối xứng ở cả 2 bên/2 trục hay không.
- Component có `hiddenInBuilder: true` vẫn hiện trong `LayersPanel` để bật lại, nhưng ẩn khỏi vùng
  chọn/kéo trên canvas (Present Mode luôn phớt lờ cờ này — khán giả luôn thấy đúng những gì config
  khai báo).
- Có `LandingRulers.tsx` vẽ thước kẻ trên/trái, tham chiếu theo toạ độ artboard.

## 3. Toolbar & phím tắt

Toolbar nổi góc trái trên: **Select** (phím `V`/`Esc`) / **Hand** (phím `H`, tắt khi đã fit-to-screen
vì không còn gì để pan) / **Gridline** (phím `G`) / **Add component** (mở `ComponentPalette`, xem
mục 5) / **Layers** (mở/ẩn + sắp xếp component) / **Page settings** (chỉnh background — mở
Properties Panel khi chưa chọn gì).

Di chuột vào nút Select/Hand/Gridline hiện 1 popup nhỏ (tên nút + phím tắt, `ToolbarTooltip` trong
`LandingBuilderWindow.tsx`) thay cho tooltip mặc định của trình duyệt — có độ trễ nhỏ để không nhấp
nháy khi rê chuột lướt qua nhiều nút liên tiếp; nút Hand còn tự đổi nội dung popup báo lý do bị tắt
khi đang fit-to-screen.

Phím tắt khác: `Delete`/`Backspace` xoá component đang chọn. Mọi phím tắt tự tắt khi đang gõ trong
input/textarea/select/contentEditable.

## 4. Properties Panel

`PropertiesPanel.tsx` là 1 switch thuần: chưa chọn gì → `BackgroundPanel` (nền trang); có chọn → 1
Panel riêng theo đúng `type` của component + `SharedFields.tsx` luôn hiện ở cuối.

`SharedFields.tsx` — dùng chung cho MỌI loại: **Name** (optional, chỉ để dễ nhận diện trong
LayersPanel khi trang có nhiều component cùng loại — không có yêu cầu duy nhất nào), **X/Y/Width/
Height** (Height khoá "auto" nếu là Lucky Wheel dùng template Digit Roller — chiều cao tự tính theo
`digitCount`), **Effect** (fade/slide/pulse/bounce khi component xuất hiện), nút **Delete component**.

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
| `ButtonPanel.tsx` | Button (chọn action + styling, xem mục 6) |
| `ScoreboardPanel.tsx` | Scoreboard |

## 5. Nhóm component (`ComponentPalette.tsx`)

Menu "Add component" gom nhóm theo `CATEGORY_ORDER` (`componentRegistry.ts`) — chỉ hiện icon + tên
mỗi dòng (mô tả đầy đủ xem qua tooltip hover), giúp tìm nhanh thay vì cuộn qua 1 danh sách phẳng dài.

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
| **Interactive** | Button | Chạy 1 action cố định khi bấm ở Present Mode, xem mục 6 |

## 6. Button — action cố định

Button KHÔNG có tín hiệu/wiring nào — chọn thẳng 1 **action** cố định trong dropdown của
`ButtonPanel.tsx`, bấm là chạy NGAY action đó (`ButtonView.tsx` gọi thẳng 1 hàm của
`DrawSequenceActions`, xem `useDrawSequence.ts`). **Mỗi action (trừ "None") chỉ cho phép ĐÚNG 1
Button/trang** — action nào đã bị 1 Button khác chiếm sẽ bị khoá trong dropdown (hiện popup nhỏ báo
tên Button đang giữ nó khi hover), tránh 2 nút cùng "Draw" gây nhầm lẫn vận hành. Dropdown Action tự
dựng bằng div/button (không dùng `<select>` gốc) vì `<select>` không cho chèn tooltip riêng vào từng
option — xem `usedActionOwners` (tính ở `PropertiesPanel.tsx`, đọc `config.components`) trong
`ButtonPanel.tsx`. "None" không giới hạn — nhiều Button chưa cấu hình gì vẫn hợp lệ:

> ⚠️ **Nút toolbar "Discard" (huỷ thay đổi chưa Save) là khái niệm HOÀN TOÀN KHÁC** — không liên quan
> gì tới Button action ở đây. Bảng dưới không còn action nào tên "Discard" (xem ghi chú action
> **Draw**) nên không còn nguy cơ nhầm 2 thứ này với nhau nữa.

| Action | Gọi hàm | Ghi gì | Ghi chú |
|---|---|---|---|
| **None** | — | — | Mặc định, chưa cấu hình |
| **Draw** | Đang có candidate CHỜ CONFIRM (`sequence.isPending`) → `sequence.redo()`, ngược lại → `sequence.pick()` | Không ghi DB (chỉ SELECT) | 1 nút DUY NHẤT vừa Draw vừa "Redraw/Discard" — bấm lần đầu chọn candidate mới; bấm tiếp trong lúc candidate đó CHƯA Confirm thì rút lại, chọn lại đúng giải đó cho người khác |
| **Confirm** | `sequence.confirm()` | `INSERT draw_results` + `UPDATE prizes.remaining` | Ghi DB thật, không hoàn tác qua nút Discard |
| **Reset** | `sequence.resetSession()` | `DELETE` toàn bộ `draw_results` của session | Không hoàn tác — xoá hết kết quả đã Confirm |
| **Scoreboard** | `sequence.toggleScoreboard()` | Không ghi gì | Bật/tắt popup Scoreboard giữa màn hình |
| **Open Link** | Đọc `getParticipantField` + `window.api.shell.openExternal` | Không ghi gì | Cần chọn thêm **URL field** — mở URL của winner GẦN NHẤT, no-op im lặng nếu chưa có winner/field rỗng |

> **⚠️ Quan trọng — Confirm và Reset là 2 action DUY NHẤT ghi dữ liệu THẬT, VĨNH VIỄN, ngoài phạm vi
> `landing_config`.**
>
> Mọi thứ khác trên trang (Text, Lucky Wheel, styling của Button...) — toàn bộ "trạng thái" chỉ nằm
> trong khối JSON `landing_config` (xem mục 8). Sửa gì, kéo gì, xoá gì ở Builder cũng chỉ đổi khối
> JSON đó — bấm **nút Discard** ở toolbar là quay lại y nguyên bản đã Save gần nhất, không có gì mất
> thật.
>
> **Confirm thì khác**: gọi thẳng `window.api.draw.commit()` → ghi **1 dòng thật vào bảng
> `draw_results`** và **trừ `prizes.remaining`** trong SQLite — trong 1 transaction, ở
> `commitDraw()` (`electron/drawEngine.ts`). Đây là ghi DB thật, **nút Discard ở toolbar không hề
> đụng tới và không thể hoàn tác** (cách duy nhất huỷ là action **Reset** — xoá TOÀN BỘ kết quả của
> cả session, không phải riêng 1 lượt). `draw_results`/`prizes.remaining` chính là dữ liệu mà Data
> Editor và màn hình quản lý Prize đọc/hiển thị.
>
> `Draw` "nhẹ" hơn: cả `sequence.pick()` lẫn `sequence.redo()` (2 hàm cùng đứng sau action **Draw**,
> xem bảng trên) đều KHÔNG ghi DB (chỉ SELECT chọn ứng viên), nhưng ứng viên đang chờ đó (`candidate`)
> đã được "độn" ngay vào `results[0]` (1 dòng giả, xem `useDrawSequence.ts`'s `effectiveData`) —
> nghĩa là MỌI component đọc dữ liệu (Winner Name, Lucky Wheel...) đã thấy "có kết quả" NGAY khi Draw
> chạy, **trước khi** Confirm ghi DB thật. Nếu Draw chạy nhưng Confirm không bao giờ chạy theo sau,
> ứng viên đó vẫn hiện trên màn hình nhưng KHÔNG BAO GIỜ thật sự tồn tại trong `draw_results`.
>
> `Open Link` không ghi gì vào DB, nhưng vẫn có hệ quả ngoài `landing_config`: mở 1 trình duyệt
> ngoài thật sự trên máy đang chạy Present Mode.

Lucky Wheel KHÔNG cần Button nào ra lệnh — nó tự phát hiện `results[0].id` vừa đổi (candidate mới,
dù là lượt Draw đầu hay 1 lượt "quay lại" từ chính action Draw đó — xem trên) và tự bắt đầu quay (xem
`WheelTemplate.tsx`/`DigitRollerTemplate.tsx`), dừng đúng lúc animation THẬT SỰ kết thúc, không phải
đoán 1 delay cố định.

**Nút Draw có thêm 1 mũi tên dropdown (▾) cạnh nó** (`DrawMenu` trong `ButtonView.tsx`, chỉ hiện ở
Present Mode thật) — dropdown này là 1 BỘ CHỌN CHẾ ĐỘ (kiểu radio, có dấu ✓ cạnh mục đang chọn),
KHÔNG tự chạy draw. Chọn xong, người vận hành phải tự bấm nút Draw CHÍNH để thật sự tiến hành quay
theo đúng chế độ đã ARM (`sequence.drawMode`/`drawCount`, chạy qua `sequence.runDraw()` — xem
`runAction`'s case `"draw"` trong `ButtonView.tsx`):

| Chế độ | Chọn trong dropdown | Khi bấm nút Draw chính |
|---|---|---|
| **Single Draw** | Set thẳng, không hỏi gì | Y hệt hành vi Draw gốc: đang có candidate chờ Confirm thì `redo()`, chưa có gì thì `pick()` |
| **Multiple Draw** | Hỏi số lượng N (≤ remaining của giải đang chọn) qua popup (`DrawModeCountPopup.tsx`) | Lặp lại ĐÚNG quy trình Single Draw (pick → chờ Wheel hiện xong → tự Confirm) N lần liên tiếp, nghỉ ngắn giữa mỗi người |
| **Quick Draw** | Hỏi số lượng N (≤ remaining của giải đang chọn) qua cùng 1 popup | Quay + Confirm ĐÚNG N người NGAY LẬP TỨC (không nghỉ giữa các lượt), tự mở Scoreboard khi xong |

Multiple/Quick đều BẮT BUỘC đã chọn 1 giải qua Prize Image/Prize Gallery (`sequence.selectedPrizeId`)
NGAY TỪ LÚC chọn mục trong dropdown — không phụ thuộc trang có UI chọn giải hay không (khác Single
Draw). `runMultipleDrawInternal`/`runQuickDrawInternal` (`useDrawSequence.ts`) tự gọi thẳng
`window.api.draw.pick`/`commit` (không tái dùng nội bộ `pick()`/`confirm()`), tự re-validate lại
count/remaining MỚI NHẤT ngay lúc bấm Draw (phòng trường hợp đổi từ lúc ARM tới lúc bấm, hoặc đổi
sang giải khác), và giữ `sequence.spinning = true` SUỐT quá trình — tái dùng nguyên vẹn mọi điểm khoá
"gần như mọi chức năng" đã có sẵn cho `spinning` thường, không cần thêm cờ khoá riêng. Trong lúc Quick
Draw đang chạy, Winner Name hiện `props.quickDrawText` (mặc định "Congratulations!") THAY VÌ tên
người trúng — Quick Draw ra nhiều người cùng lúc nên không có 1 tên "đúng" nào để hiện (xem
`WinnerNameProps.quickDrawText`, `DrawSequenceActions.quickDrawResult`).

## 7. Present Mode render khác Builder canvas thế nào

Cả 2 dùng chung `LandingRenderer.tsx`, khác nhau ở prop `interactive`:

- **`interactive=true`** (chỉ Present Mode): `sequence` thật (không phải `undefined`) được truyền
  xuống — Button mới bấm được, action mới chạy thật; `hiddenInBuilder` bị phớt lờ (khán giả luôn
  thấy đúng những gì config khai báo); Scoreboard vẽ như 1 modal riêng canh giữa màn hình, chỉ hiện
  khi `sequence.scoreboardVisible`.
- **`interactive=false`** (Builder canvas): `sequence` là `undefined` → Button tự disable (không
  bấm được, tránh chạy quay số thật lúc đang chỉnh sửa) — Scoreboard vẽ tại chỗ theo x/y như mọi
  component khác (để còn kéo/resize được). Lucky Wheel vẫn tự dò `results[0].id` như ở Present Mode,
  nhưng Builder không truyền `data` thật xuống Canvas nên trong thực tế nó luôn đứng yên ở đó.

## 8. Save / Discard / lưu trữ

`config` coi là "dirty" khi khác bản JSON đã Save gần nhất. Nút **Save** ghi xuống
`sessions.landing_config` qua `window.api.sessions.updateLandingConfig`; **Discard** hỏi xác nhận
rồi khôi phục nguyên bản JSON đã Save. Đóng cửa sổ khi còn dirty bị chặn bằng hộp thoại cảnh báo
native (Electron `BrowserWindow` `close` event).

Không có hệ thống migration hình thức cho `landing_config` — `parseLandingConfig()` chỉ kiểm tra
`version === 1` + `components` là mảng + có `canvas`, sai bất kỳ điều nào thì fallback thẳng về
`DEFAULT_LANDING_CONFIG` (rỗng) thay vì cố gắng chuyển đổi shape cũ. Component có `type` không còn
tồn tại trong `COMPONENT_REGISTRY` (vd landing lưu từ trước khi 1 loại component bị xoá khỏi app) bị
lọc bỏ ngay khi load ở cả 3 nơi đọc config (Builder/Present Mode/`LandingPage.tsx`) — xem mục 1.
Field mới thêm vào 1 loại component theo thời gian được xử lý ad hoc ở cấp type/view/panel (optional
field + fallback), không qua 1 cơ chế version-bump chung nào.

## 9. Thêm 1 loại component mới

Xem checklist đầy đủ (4 bước) ở đầu `src/lib/landing/types.ts`. Tóm tắt: 1) thêm type + interface
vào union `LandingComponent`; 2) thêm `views/XxxView.tsx`; 3) thêm `panels/XxxPanel.tsx`; 4) đăng ký
trong `componentRegistry.ts` (label, category cho Palette).

## 10. File liên quan

| File | Vai trò |
|---|---|
| `src/pages/LandingBuilderWindow.tsx` | Cửa sổ Builder — toolbar, Save/Discard |
| `src/pages/PresentMode.tsx` | Cửa sổ chiếu cho khán giả — chỉ render, poll config mỗi 2s |
| `src/components/landing/LandingCanvas.tsx` | Artboard 1920×1080 — chọn/kéo/resize/pan/zoom |
| `src/components/landing/LandingRenderer.tsx` | Painter thuần — dùng chung bởi Canvas lẫn Present Mode, switch theo `component.type` |
| `src/components/landing/PropertiesPanel.tsx` | Container Properties Panel — switch theo type + `SharedFields` |
| `src/components/landing/componentRegistry.ts` | `COMPONENT_REGISTRY` — nguồn DUY NHẤT cho Palette/canvas |
| `src/components/landing/ComponentPalette.tsx` | Menu "Add component" — kéo-thả tạo instance mới, gom nhóm theo `CATEGORY_ORDER` |
| `src/components/landing/componentIcons.tsx` | Icon dùng cho Palette |
| `src/components/landing/useDrawSequence.ts` | `pick()`/`confirm()`/`redo()`/`resetSession()`/... — cầu nối duy nhất từ Landing sang Draw Engine |
| `src/components/landing/views/ButtonView.tsx` | Chạy action của Button, xem mục 6 |
| `src/lib/landing/types.ts` | Toàn bộ type hệ thống + checklist thêm component mới |

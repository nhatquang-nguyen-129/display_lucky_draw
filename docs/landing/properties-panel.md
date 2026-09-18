# Properties Panel & nhóm component

## `ColorField.tsx` — mọi ô chọn màu đều dùng chung component này

`<input type="color">` trần tự vẽ 1 popup màu RIÊNG của Chromium (bánh xe màu + thanh hue + ô hex) —
KHÔNG phải DOM thường của trang, nên Ctrl/Cmd+V dán hex vào ô hex bên trong popup đó không hoạt động
(giới hạn của chính Chromium, không sửa được từ code trang web — chỉ gõ tay hoặc dùng eyedropper/bánh
xe màu native mới ăn). `ColorField.tsx` (`panels/ColorField.tsx`) là fix DUY NHẤT cho việc này: 1
swatch `<input type="color">` bé (vẫn giữ để chọn nhanh bằng mắt) đặt CẠNH 1 ô `<input type="text">`
THẬT của trang — gõ/dán hex trực tiếp vào ô text đó hoạt động bình thường như mọi input khác. Text
gõ dở (chưa đủ `#RRGGBB` hợp lệ) được giữ ở state cục bộ, chỉ `onChange` ra ngoài khi khớp
`/^#[0-9a-fA-F]{6}$/`, và tự đồng bộ lại theo giá trị thật mỗi khi nó đổi TỪ BÊN NGOÀI (Undo/Redo,
đổi component đang chọn).

Mọi ô chọn màu trong Properties Panel (Text/Winner/Lucky Wheel/Scoreboard/Button/Current Time/
Participant Count/Firework/Background — kể cả `PrizeEffectPicker.tsx`) đều dùng `ColorField`, KHÔNG
còn dùng thẳng `<input type="color">` nữa — thêm ô màu mới ở panel nào sau này cũng phải qua
`ColorField`, không quay lại pattern cũ.

## `DrawCycleFields.tsx` — khối "Interactions with Draw" dùng chung cho component TĨNH

`ImagePanel.tsx` và `TextPanel.tsx` đều render 1 component TĨNH do người dùng tự đặt (ảnh PNG/chuỗi
chữ, không đổi theo từng lượt quay) mà muốn tự ẩn/hiện đồng bộ quy trình quay — cả 2 dùng chung ĐÚNG 1
component `DrawCycleFields.tsx` (nhận `props: {syncWithDraw?, drawCycle?}` + `onChange`, tự SUY RA từ
đó — không cần biết đang ở Image hay Text) thay vì lặp lại JSX. Xem doc-comment
`DrawCycleConfig`/`DrawPhaseAction` trong `types.ts` và mục "`useDrawCycleVisibility` — model
Idle/Draw/Redraw" ở [present-mode.md](./present-mode.md) cho cơ chế đầy đủ (checkbox **Trigger with
Draw**, 3 mốc Idle/Draw/Redraw mỗi mốc 1 dropdown **Appearance** bị ràng buộc lẫn nhau). Thêm 1 loại
component TĨNH mới cũng cần "Interactions with Draw" thì tái dùng THẲNG component này, không viết lại.

Winner Name (`LiveTextPanel.tsx`) KHÔNG dùng `DrawCycleFields.tsx` — nội dung của nó (tên người trúng)
THẬT SỰ đổi theo từng lượt quay, không phải 1 thứ tĩnh hiện/ẩn nhị phân, nên giữ cơ chế
`useRevealed`/`useRevealTransition` riêng (xem `drawRevealHooks.ts`) — chỉ ĐỔI TÊN panel + bổ sung
mục **Idle** (Effect + Delay riêng cho lúc Reset, `WinnerNameProps.idleEffect`/`idleDelayMs`) để
ĐỒNG BỘ HÌNH DÁNG 3 mục Idle/Draw/Redraw với Image/Text, hành vi/timing của **Draw**/**Redraw** giữ
nguyên y hệt.

## Kiến trúc chốt: dropdown "Source" chọn cột Participant

Nhiều panel cho chọn 1 cột Participant làm nguồn dữ liệu (Lucky Wheel's Draw/Display/Winner display
field, Winner Name's Source, Button Open Link's Source...). Tất cả đi theo ĐÚNG 1 trong 2 nhánh sau —
KHÔNG có nhánh thứ 3, và KHÔNG panel nào được tự sáng tác cách riêng:

| Field có yêu cầu Data Type cụ thể? | Cách liệt kê | Ví dụ |
|---|---|---|
| **KHÔNG** — field nào cũng dùng được (chỉ cần đúng 1 tiêu chí phụ khác, hoặc không tiêu chí gì) | Liệt kê **TOÀN BỘ cột đang thực sự tồn tại** (core field còn dữ liệu thật + mọi cột `extra_data`) — KHÔNG lọc theo Data Type. Nếu có tiêu chí phụ (vd đúng số ký tự), đánh dấu **Eligible/not eligible** ngay trên từng option (`<option disabled title="lý do">`), không ẩn hẳn option không đạt | Lucky Wheel's Draw/Display field (không tiêu chí) và Digit Roller's Source field (tiêu chí: đúng `digitCount` ký tự) — `LuckyWheelPanel.tsx` |
| **CÓ** — field bắt buộc phải cùng ý nghĩa (Name/Phone/Email/URL...) mới dùng được, sai ý nghĩa là hỏng chức năng | Liệt kê ĐÚNG các cột đang gán Data Type đó (`listParticipantColumnsForType`, đã lọc thêm lớp "còn dữ liệu thật"). Rỗng → **KHÔNG hiện dropdown rỗng/option sai** — hiện `<select disabled>` với placeholder `"Set a column's Data Type to <Type> first."` | Winner Name's Source (Name) — `LiveTextPanel.tsx`; Button Open Link's Source (URL) — `ButtonPanel.tsx` |

**Vì sao 2 nhánh khác nhau**: 1 dropdown "field nào cũng dùng được" mà lọc theo Data Type sẽ SAI —
Digit Roller vốn không quan tâm cột đó "nghĩa là gì" (Name/Phone/Code đều chấp nhận được, miễn đúng
số ký tự), lọc theo type sẽ vô cớ loại bỏ những cột hợp lệ. Ngược lại, 1 dropdown "bắt buộc đúng ý
nghĩa" (Open Link cần 1 URL thật để mở, không phải 1 cái tên) mà liệt kê MỌI cột sẽ cho chọn nhầm 1
cột Name/Phone làm URL, khiến action luôn no-op mà không rõ vì sao.

**Bẫy đã gặp thật (đã sửa) — đừng lặp lại**: `LuckyWheelPanel.tsx` từng hardcode `hasDataForField("name")
=> true` vô điều kiện — 4 label chung "Name/Phone/Email/Code" (không phải cột thật, chỉ là bí danh
cho cột SQL lõi `participant.name/.phone/.email/.code`) vẫn hiện trong dropdown dù participant không
hề có field đó (từ khi import flow chuyển hẳn qua `extra_data`, xem
[`docs/participants/column-mapping.md`](../participants/column-mapping.md), 4 cột SQL lõi này gần
như luôn rỗng). Sửa bằng `computeActiveParticipantCoreFields` (đúng hàm Data Editor dùng cho
`isCoreFieldActive`) + `isPhantomGenericField` — 1 label chung CHỈ hợp lệ khi cột SQL lõi cùng tên
thật sự có dữ liệu, và KHÔNG áp dụng ngoại lệ "giữ nguyên lựa chọn đang chọn" cho riêng 4 label này
(khác cột `extra_data` thật tạm hết dữ liệu — trường hợp đó vẫn giữ nguyên lựa chọn, xem
`availableOptions`). Khi phát hiện field đang lưu là 1 label ảo, tự chuyển sang cột thật đầu tiên
(`useEffect` trong `LuckyWheelPanel.tsx`) — KHÔNG để nó nằm im chờ người dùng tự nhận ra.

Mọi dropdown "Source"/field-chọn-cột MỚI thêm sau này phải xếp vào ĐÚNG 1 trong 2 nhánh trên ngay từ
đầu — không hardcode danh sách field cố định, không tự đặt luật lọc riêng.

**Gốc của nhánh 2** (đã đúng từ trước, không phải sửa gì): dropdown "Source" trong popup Generate ▸
Display Phone của Data Editor (`DataEditorModal.tsx`'s `phoneColumns`, xem
[`docs/participants/data-editor.md`](../participants/data-editor.md)) — liệt kê mọi cột đang gán
Data Type = Phone, rỗng thì `<select disabled>` placeholder "Set a column's Data Type to Phone
first." Winner Name/Button Open Link ở trên đi theo ĐÚNG mẫu này.

## Properties Panel

`PropertiesPanel.tsx` là 1 switch thuần: chưa chọn gì → `BackgroundPanel` (nền trang); có chọn → 1
Panel riêng theo đúng `type` của component + `SharedFields.tsx` luôn hiện ở cuối.

`SharedFields.tsx` — dùng chung cho MỌI loại: **X/Y/Width/Height** (Height khoá "auto" nếu là Lucky
Wheel dùng template Digit Roller — chiều cao tự tính theo `digitCount`), **Effect** (fade/slide/pulse/
bounce khi component xuất hiện), nút **Delete component**. 2 ngoại lệ **Winner** và **Lucky Wheel**
(`hidePosition`/`hideEffect` truyền từ `PropertiesPanel.tsx`) TỰ gộp Position vào cuối "Basic options"
của panel riêng (`LiveTextPanel.tsx`/`LuckyWheelPanel.tsx`, đổi qua `onChangeComponent` — khác tầng dữ
liệu với `onChange` vốn chỉ patch `component.props`) và ẨN HẲN Effect chung — Effect entrance đó chỉ
chạy ĐÚNG 1 LẦN lúc cửa sổ Present Mode vừa mở (2 loại này không nằm trong `REMOUNT_ON_RESULT_TYPES`
ở `LandingRenderer.tsx`), không có ý nghĩa thực tế gì cho riêng chúng. `SharedFields.tsx` ở cuối mọi
panel vẫn LUÔN giữ nút Delete component dù 2 cờ trên có bật hay không.

| Panel file | Dùng cho |
|---|---|
| `BackgroundPanel.tsx` | Nền trang (khi chưa chọn component nào) |
| `TextPanel.tsx` | Text — Basic options + **"Interactions with Draw"** dùng CHUNG component `DrawCycleFields.tsx` với `ImagePanel.tsx` (xem hàng dưới) — `content` là 1 chuỗi TĨNH do người dùng tự đặt nên hợp với model chung, khác Winner Name (nội dung đổi theo lượt) |
| `ImagePanel.tsx` | Image — Basic options + **"Interactions with Draw"** (component dùng chung `DrawCycleFields.tsx`, checkbox **Trigger with Draw**, tắt = ảnh tĩnh như cũ). Mỗi mốc **Idle/Draw/Redraw** có dropdown **Appearance** riêng, gộp CHUNG với Effect/Delay ngay trong khối mốc đó: **Idle** chỉ 2 lựa chọn `Appear`/`Disappear` (không có None); **Draw** thêm `None`, dropdown TỰ VÔ HIỆU HOÁ lựa chọn TRÙNG Idle; **Redraw** cũng thêm `None`, dropdown tự vô hiệu hoá lựa chọn ĐỐI LẬP Idle (khác None thì tự động hiện lại bằng CHÍNH Effect của Draw ngay sau đó, không cấu hình lặp) — không có ô nào cấu hình sai hướng được, đổi Appearance của Idle thì Draw/Redraw đang lưu tự sửa lại nếu không còn hợp lệ — xem mục "`useDrawCycleVisibility` — model Idle/Draw/Redraw" ở [present-mode.md](./present-mode.md). Dùng khi cần 1 ảnh PNG tự ẩn/hiện đồng bộ với quy trình quay (vd 1 ảnh trang trí như Podium cần TÁCH KHỎI Background để không bị `BackgroundDimOverlay` dim theo mỗi lượt Draw) mà không cần tạo hẳn 1 loại component riêng, xem `ImageProps`/`ImageView.tsx` |
| `LuckyWheelPanel.tsx` | Lucky Wheel (cả 2 template `wheel`/`digitRoller`) — Basic options có X/Y/Width/Height ở CUỐI (Height khoá "auto" nếu là Digit Roller). Draw/Display field KHÔNG yêu cầu Data Type cụ thể, liệt kê MỌI cột thật; field **Source** (winner display/digit source, gộp chung tên nhãn cho cả 2 template) thêm tiêu chí phụ ở Digit Roller "đúng `digitCount` ký tự" (đánh dấu Eligible/not eligible, không ẩn hẳn) — xem nhánh 1 ở mục kiến trúc phía trên |
| `LiveTextPanel.tsx` | Winner — Basic options có thêm **Source** (dropdown mọi cột Data Type = Name **VÀ còn dữ liệu thật** trong Participants hiện tại, LUÔN hiện kể cả chỉ có 1 lựa chọn) để ghi đè cột Name mặc định cho ĐÚNG khung Winner Name này — xem `WinnerNameProps.nameSourceColumn` (`types.ts`) và `WinnerNameView.tsx`. Nhánh 2 ở mục kiến trúc phía trên — rỗng thì hiện `<select disabled>` placeholder, không dropdown trắng. "Interactions with Draw" LUÔN bật (không có checkbox — cả component chỉ tồn tại để phản ứng theo Draw), gồm 3 mục **Idle**/**Draw**/**Redraw** (2 mục sau đổi tên từ "When Revealed"/"When Disappear" cho khớp thuật ngữ chung với `DrawCycleFields.tsx`). **Idle** có dropdown **Appearance** giống Image/Text (đồng bộ hình dáng), nhưng Ý NGHĨA khác hẳn: `Disappear` (mặc định) = ẩn tên khi Reset (kèm **Effect**/**Delay (ms)** riêng — `idleEffect`/`idleDelayMs`, KHÁC `disappearEffect`/`disappearDelayMs` của Redraw vì Reset là sự kiện khác hẳn); `Appear` = GIỮ NGUYÊN tên đang hiện, Reset không xoá gì (Effect/Delay ẩn đi, không có tác dụng) — KHÔNG ảnh hưởng lúc mở lại landing (luôn rỗng lúc mount). **Draw**/**Redraw** mỗi mục CHỈ có **Effect** + **Delay (ms)**, KHÔNG dùng chung schema/component `DrawCycleFields.tsx` — nội dung Winner Name đổi theo từng lượt, không phải 1 thứ tĩnh nhị phân hiện/ẩn — xem mục "Winner Name (syncWithDraw luôn bật) — 3 trạng thái Idle/Revealed/Disappear" ở [present-mode.md](./present-mode.md) |
| `LiveImagePanel.tsx` | Prize |
| `CurrentTimePanel.tsx` | Current Time |
| `ParticipantCountPanel.tsx` | Participant Count |
| `ButtonPanel.tsx` | Button (chọn action + styling, xem [button-actions.md](./button-actions.md)) — action "Open Link" có thêm **Source**, cùng nhánh 2 (Data Type = URL) như Winner Name's Source |
| `ScoreboardPanel.tsx` | Scoreboard — "Columns" là bản multi-select của nhánh 1 (liệt kê MỌI cột thật, không lọc Data Type) nhưng KHÔNG có tiêu chí phụ nào (bảng hiện được bất kỳ cột nào), nên không có khái niệm Eligible/not eligible ở đây — mọi checkbox luôn bật được |
| `FireworkPanel.tsx` | Firework |

## Nhóm component (`ComponentPalette.tsx`)

Menu "Add component" gom nhóm theo `CATEGORY_ORDER` (`componentRegistry.ts`) — chỉ hiện icon + tên
mỗi dòng (mô tả đầy đủ xem qua tooltip hover), giúp tìm nhanh thay vì cuộn qua 1 danh sách phẳng dài.

| Nhóm | Component | Mô tả |
|---|---|---|
| **Basic** | Text | Nhãn/tiêu đề tĩnh |
| | Image | Logo, banner, ảnh trang trí |
| **Draw & Results** | Lucky Wheel | Vòng quay/Digit Roller gắn với Draw Engine — xem [lucky-wheel.md](./lucky-wheel.md) |
| | Winner | Tên người trúng gần nhất |
| | Prize | Ảnh giải vừa trúng gần nhất |
| | Scoreboard | Bảng người trúng đã confirm, hiện qua popup |
| **Live Info** | Current Time | Đồng hồ thời gian thực |
| | Participant Count | Số người tham gia trong session |
| **Interactive** | Button | Chạy 1 action cố định khi bấm ở Present Mode, xem [button-actions.md](./button-actions.md) |
| **Effects** | Firework | Pháo hoa thưa/nhẹ, gắn 1 giải cụ thể — bắn trong đúng khung của nó lúc giải đó vừa được công bố |

`COMPONENT_REGISTRY` (`componentRegistry.ts`) là nguồn DUY NHẤT "nối dây" 1 loại component vào cả
Palette lẫn Canvas (tạo instance mặc định khi thả) — xem checklist thêm component mới ở
[config-lifecycle.md](./config-lifecycle.md).

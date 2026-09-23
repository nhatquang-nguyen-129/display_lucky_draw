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
Participant Count — kể cả `PrizeEffectPicker.tsx`; Background không có ô màu nào, chỉ Image + Fit)
đều dùng `ColorField`, KHÔNG còn dùng
thẳng `<input type="color">` nữa — thêm ô màu mới ở panel nào sau này cũng phải qua `ColorField`,
không quay lại pattern cũ.

## `DrawCycleFields.tsx` — khối "Interactions with Draw" dùng chung cho component TĨNH

`ImagePanel.tsx`, `TextPanel.tsx` và `BackgroundPanel.tsx` đều render 1 component TĨNH do người dùng
tự đặt (ảnh PNG/chuỗi chữ/ảnh nền, không đổi theo từng lượt quay) mà muốn tự đổi Appearance đồng bộ
quy trình quay — cả 3 dùng chung ĐÚNG 1 component `DrawCycleFields.tsx` (nhận `props:
{syncWithDraw?, drawCycle?}` + `onChange`, tự SUY RA từ đó — không cần biết đang ở component nào) thay
vì lặp lại JSX. Appearance có 4 giá trị PEER — Appear/Disappear/Dim/Blur (xem doc-comment
`DrawRestState` trong `types.ts`) — nhưng KHÔNG PHẢI component nào cũng cho chọn cả 4: prop
`allowedStates` (mặc định `["appear", "disappear"]` nếu bỏ trống, giữ NGUYÊN hành vi cũ cho
Image/Text) khai báo domain riêng cho từng caller, Background truyền đủ cả 4 giá trị. Dim/Blur có thêm
field **Amount** (Dim % / Blur px, chỉ hiện khi Appearance đang chọn đúng 1 trong 2 giá trị đó) —
Image/Text không bao giờ đụng tới field này. Xem doc-comment `DrawCycleConfig`/`DrawPhaseAction` trong
`types.ts` và mục "`useDrawCycleVisibility` — model Idle/Draw/Redraw" ở
[present-mode.md](./present-mode.md) cho cơ chế đầy đủ (checkbox **Trigger with Draw**, 3 mốc
Idle/Draw/Redraw mỗi mốc 1 dropdown **Appearance** bị ràng buộc — không được trùng giá trị thật gần
nhất phía trước trong chuỗi, KHÔNG còn hardcode "đối lập nhị phân" như bản cũ, dù với domain 2 giá trị
thì 2 quy tắc cho ra kết quả giống hệt nhau). Thêm 1 loại component TĨNH mới cũng cần "Interactions
with Draw" thì tái dùng THẲNG component này, không viết lại.

Bước "reveal" của Redraw KHÔNG có field riêng — sau khi bước ẩn (`redrawEffect`) báo `onDone` xong
hẳn, code chờ thêm 1 window CỐ ĐỊNH `MIN_REDRAW_REVEAL_GAP_MS` (1s, hardcode trong
`drawRevealHooks.ts`, KHÔNG cấu hình được ở Properties Panel), rồi MỚI tính tiếp `drawEffect.delayMs`
(giá trị người dùng tự đặt ở Draw) trước khi chạy lại bằng CHÍNH `drawEffect` (xem
`useDrawCycleVisibility` ở [present-mode.md](./present-mode.md)). Tổng thời gian từ lúc "ẩn xong" tới
lúc "hiện lại" luôn = `1000 + drawEffect.delayMs` — đảm bảo tối thiểu 1s dù người dùng để Draw's Delay
= 0, mà KHÔNG cần Properties Panel validate/ràng buộc field nào cả (Draw's Delay vẫn tự do như cũ,
đúng nghĩa "trễ thêm bao nhiêu sau window 1s đó"). `redrawEffect.delayMs` không liên quan gì tới
khoảng cách này — nó chỉ quyết định lúc nào bắt đầu ẩn.

Bug đã sửa cùng lúc: bản trước ĐÃ có 1 window kiểu này nhưng lấy nhầm giá trị — bọc
`setTimeout(drawEffect.delayMs)` BÊN NGOÀI trước khi gọi `runStep(drawAction, drawEffect)`, trong khi
`runStep` đã tự áp đúng `drawEffect.delayMs` đó bên trong nó rồi, khiến độ trễ thật sự bị áp 2 LẦN (2×
`drawEffect.delayMs`, phụ thuộc vào giá trị người dùng đặt — có thể là 0) thay vì 1 window CỐ ĐỊNH
cộng thêm giá trị đó đúng 1 lần. Đã đổi `inDelay` từ `drawEffect.delayMs` sang hằng số
`MIN_REDRAW_REVEAL_GAP_MS`.

Winner Name (`LiveTextPanel.tsx`) KHÔNG dùng `DrawCycleFields.tsx` — nội dung của nó (tên người trúng)
THẬT SỰ đổi theo từng lượt quay, không phải 1 thứ tĩnh hiện/ẩn nhị phân, nên giữ cơ chế
`useRevealed`/`useRevealTransition` riêng (xem `drawRevealHooks.ts`) — chỉ ĐỔI TÊN panel + bổ sung
mục **Idle** (Effect + Delay riêng cho lúc Reset, `WinnerNameProps.idleEffect`/`idleDelayMs`) để
ĐỒNG BỘ HÌNH DÁNG 3 mục Idle/Draw/Redraw với Image/Text, hành vi/timing của **Draw**/**Redraw** giữ
nguyên y hệt.

## Spotlight/Dim — 2 lựa chọn Highlight bình thường, KHÔNG phải component riêng (và KHÔNG còn field tách riêng)

Từng thử 2 hiệu ứng "gắn với 1 giải, kích hoạt khi giải đó thắng" (Spotlight, Firework) làm component
ĐỨNG ĐỘC LẬP — đặt tay lên canvas rồi tự chọn 1 `prizeId` để gắn, giống hệt cách Prize Image hoạt
động. Vấn đề: gần như MỌI landing có nhiều giải đều cần hiệu ứng này cho TỪNG giải, nghĩa là phải đặt
thêm 1 component mới + chọn lại `prizeId` cho mỗi giải — không có gì tận dụng được vị trí/kích thước
CÓ SẴN của chính Prize Image đại diện giải đó, và khi có NHIỀU giải, Properties Panel cứ phình to theo
số lượng component thay vì theo số lượng giải thật cần cấu hình.

Hướng ĐÚNG (chốt sau 2 vòng, xem [prize.md](./prize.md) mục 4.1): Spotlight (và tương tự Dim, thay
`outOfStockDimAmount` cũ) là 1 effect BÌNH THƯỜNG của nhóm **Highlight** (`PrizeEffectName`,
`types.ts`), chọn được ở CẢ 4 mục Hover/Select/Won/Out of Stock trong `PrizeEffectPicker.tsx` — không
còn field tách riêng (`wonAmbientEffect`/`wonAmbientDelayMs` gắn cứng CHỈ `Won`, `outOfStockDimAmount`
gắn cứng CHỈ `Out of Stock` — CẢ 3 field này đã XOÁ HẲN khỏi `types.ts`). Spotlight tự động bám ĐÚNG
khung x/y/width/height của Prize Image đó, không cần đặt/định vị/chọn `prizeId` thêm lần nào nữa.
Phong cách (màu trắng, hình nón, độ mờ) CỐ ĐỊNH trong code (`PrizeImageView.tsx`) — panel chỉ có
dropdown chọn effect + **Delay (ms)** (field `delayMs`, CHỈ `PrizeGroupEffect` của Spotlight dùng —
trễ bao lâu SAU khi giai đoạn đó BẮT ĐẦU active mới hiện, tắt NGAY không delay khi hết active). Dim
dùng field `size` có sẵn (0-100%, nhãn "Dim amount (%)" trong panel).

Component `Spotlight` đứng độc lập (`SpotlightView.tsx`/`SpotlightPanel.tsx`, dùng model
Idle/Draw/Redraw như Image/Text — VÒNG KIẾN TRÚC ĐẦU TIÊN, trước cả `wonAmbientEffect`) đã BỊ XOÁ HẲN
— landing cũ có component này tự bị lọc bỏ khi mở lại (cùng cơ chế `COMPONENT_REGISTRY[c.type]` filter
dùng cho MỌI type đã gỡ, xem `LandingBuilderWindow.tsx`/`PresentMode.tsx`).

Component `Firework` đứng độc lập cũng đã BỊ XOÁ HẲN cùng đợt này (chưa có kiến trúc thay thế) —
landing cũ có component này cũng tự bị lọc bỏ tương tự.

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

`PropertiesPanel.tsx` là 1 switch thuần: chưa chọn gì → gợi ý chọn/thêm component; có chọn → 1
Panel riêng theo đúng `type` của component + `SharedFields.tsx` luôn hiện ở cuối. Background KHÔNG
còn là "nền trang" toàn cục nữa — nó là 1 loại component bình thường (kéo-thả từ Palette, category
Basic, giống Image ở Basic options — chuẩn bị sẵn cho mở rộng video sau này), giới hạn 1 cái/trang
(cùng cơ chế với Scoreboard/Lucky Wheel, xem `handleDropNewComponent` trong
`LandingBuilderWindow.tsx`). Phần canvas không được Background nào phủ tới LUÔN là màu đen cố định —
không còn config màu nền/letterbox riêng (xem `LandingRenderer.tsx`). Landing đã lưu ảnh nền kiểu cũ
tự động migrate thành 1 Background component khi mở lại (xem `migrateLegacyBackground` trong
`types.ts`). Tính năng dim nền cũ ("Dim background while Revealed", gắn với panel toàn cục) đã BỎ HẲN,
nhưng quay lại dưới dạng khác — gắn THẲNG vào Background component qua "Interactions with Draw" (Dim
hoặc Blur, xem `BackgroundPanel.tsx` bên dưới, dùng CHUNG `DrawCycleFields.tsx` với Image/Text), không
còn tách rời khỏi Background như bản cũ.

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
| `BackgroundPanel.tsx` | Background — Basic options (Image + Fit, không có border radius như Image) + **Self Interactions** (chưa có mục nào, để sẵn chỗ) + **Interactions with Draw** dùng THẲNG `DrawCycleFields.tsx` (KHÔNG viết riêng) với `allowedStates={["appear","disappear","dim","blur"]}` — Dim/Blur mỗi lựa chọn có thêm field **Amount** (Dim % mặc định 80, Blur px), Appear/Disappear thì không |
| `TextPanel.tsx` | Text — Basic options + **"Interactions with Draw"** dùng CHUNG component `DrawCycleFields.tsx` với `ImagePanel.tsx` (xem hàng dưới) — `content` là 1 chuỗi TĨNH do người dùng tự đặt nên hợp với model chung, khác Winner Name (nội dung đổi theo lượt) |
| `ImagePanel.tsx` | Image — Basic options + **"Interactions with Draw"** (component dùng chung `DrawCycleFields.tsx`, checkbox **Trigger with Draw**, tắt = ảnh tĩnh như cũ). Mỗi mốc **Idle/Draw/Redraw** có dropdown **Appearance** riêng, gộp CHUNG với Effect/Delay ngay trong khối mốc đó: **Idle** chỉ 2 lựa chọn `Appear`/`Disappear` (không có None); **Draw** thêm `None`, dropdown TỰ VÔ HIỆU HOÁ lựa chọn TRÙNG Idle; **Redraw** cũng thêm `None`, dropdown tự vô hiệu hoá lựa chọn ĐỐI LẬP Idle (khác None thì tự động hiện lại bằng CHÍNH Effect của Draw ngay sau đó, không cấu hình lặp) — không có ô nào cấu hình sai hướng được, đổi Appearance của Idle thì Draw/Redraw đang lưu tự sửa lại nếu không còn hợp lệ — xem mục "`useDrawCycleVisibility` — model Idle/Draw/Redraw" ở [present-mode.md](./present-mode.md). Dùng khi cần 1 ảnh PNG tự ẩn/hiện đồng bộ với quy trình quay (vd 1 ảnh trang trí như Podium, tách khỏi Background vì Background luôn tĩnh) mà không cần tạo hẳn 1 loại component riêng, xem `ImageProps`/`ImageView.tsx` |
| `LuckyWheelPanel.tsx` | Lucky Wheel (cả 2 template `wheel`/`digitRoller`) — Basic options có X/Y/Width/Height ở CUỐI (Height khoá "auto" nếu là Digit Roller). Draw/Display field KHÔNG yêu cầu Data Type cụ thể, liệt kê MỌI cột thật; field **Source** (winner display/digit source, gộp chung tên nhãn cho cả 2 template) thêm tiêu chí phụ ở Digit Roller "đúng `digitCount` ký tự" (đánh dấu Eligible/not eligible, không ẩn hẳn) — xem nhánh 1 ở mục kiến trúc phía trên. **KHÔNG có "Interactions with Draw"** — Wheel luôn gắn liền với Draw (không tắt `syncWithDraw` được như Image/Text/Background), nên MỌI field còn lại đều gộp vào **Self Interactions** với ĐÚNG 1 `<details>` tên **"Spin"**: Spin duration (ms)/Spin style (LUÔN hiện) + **Style** (Flicker/Reel, CHỈ Digit Roller). Timing (`revealTiming`) và Effect (`reelCardEffect`/`reelNumberEffect`/`landingEffect`) đã BỎ HẲN khỏi Panel (đơn giản hoá tối đa, chỉ còn đúng 3 field cấu hình được) — component MỚI tạo luôn dùng mặc định `sequential`/`pop` (xem `componentRegistry.ts`), landing CŨ đã tự chỉnh tay trước đó vẫn giữ nguyên giá trị đã lưu (field vẫn còn trong `LuckyWheelProps`/`DigitRollerTemplate.tsx`, chỉ không còn dropdown nào chỉnh được nữa) |
| `LiveTextPanel.tsx` | Winner — Basic options có thêm **Source** (dropdown mọi cột Data Type = Name **VÀ còn dữ liệu thật** trong Participants hiện tại, LUÔN hiện kể cả chỉ có 1 lựa chọn) để ghi đè cột Name mặc định cho ĐÚNG khung Winner Name này — xem `WinnerNameProps.nameSourceColumn` (`types.ts`) và `WinnerNameView.tsx`. Nhánh 2 ở mục kiến trúc phía trên — rỗng thì hiện `<select disabled>` placeholder, không dropdown trắng. Dưới Basic options là 2 nhóm, ĐÚNG thứ tự **Self Interactions** rồi **Interactions with Draw** (giống thứ tự chuẩn ở `LiveImagePanel.tsx`/`LuckyWheelPanel.tsx`). **Self Interactions** chỉ có ĐÚNG 1 mục **"Quick Draw"** (không tiền tố "When ") → field **Quick Draw text** (mặc định "Congratulations!") — hiện thay tên người trúng khi 1 Quick Draw vừa chạy xong (xem `WinnerNameProps.quickDrawText`, mục "3 chế độ Draw" ở [button-actions.md](./button-actions.md)); tách khỏi "Interactions with Draw" vì không thuộc khái niệm Idle/Draw/Redraw theo từng lượt. **Interactions with Draw** LUÔN bật (không có checkbox — cả component chỉ tồn tại để phản ứng theo Draw), gồm 3 mục **Idle**/**Draw**/**Redraw** (2 mục sau đổi tên từ "When Revealed"/"When Disappear" cho khớp thuật ngữ chung với `DrawCycleFields.tsx`). **Idle** có dropdown **Appearance** giống Image/Text (đồng bộ hình dáng), nhưng Ý NGHĨA khác hẳn: `Disappear` (mặc định) = ẩn tên khi Reset (kèm **Effect**/**Delay (ms)** riêng — `idleEffect`/`idleDelayMs`, KHÁC `disappearEffect`/`disappearDelayMs` của Redraw vì Reset là sự kiện khác hẳn); `Appear` = GIỮ NGUYÊN tên đang hiện, Reset không xoá gì (Effect/Delay ẩn đi, không có tác dụng) — KHÔNG ảnh hưởng lúc mở lại landing (luôn rỗng lúc mount). **Draw**/**Redraw** mỗi mục CHỈ có **Effect** + **Delay (ms)**, KHÔNG dùng chung schema/component `DrawCycleFields.tsx` — nội dung Winner Name đổi theo từng lượt, không phải 1 thứ tĩnh nhị phân hiện/ẩn — xem mục "Winner Name (syncWithDraw luôn bật) — 3 trạng thái Idle/Revealed/Disappear" ở [present-mode.md](./present-mode.md) |
| `LiveImagePanel.tsx` | Prize — "Self Interactions" gồm 4 mục `PrizeEffectPicker` GIỐNG HỆT NHAU (`Hover`/`Select`/`Won`/`Out of Stock` — tên KHÔNG còn tiền tố "When " nữa, bỏ cho gọn, và không còn mục nào có nội dung riêng), mỗi mục thứ tự **Appearance** (đặt LÊN ĐẦU) rồi mới tới Focus/Highlight/Motion (xem doc-comment `PrizeEffectPicker.tsx`). Nhóm **Highlight** có 4 lựa chọn: Glow/Sweep/Spotlight/Dim — Spotlight (nón sáng toàn cảnh, style cố định, chỉ có thêm field **Delay (ms)**) và Dim (tối đi, field **Amount (%)** tái dùng `size`) từng là 2 field TÁCH RIÊNG (`wonAmbientEffect` chỉ gắn `Won`, `outOfStockDimAmount` là field nền chỉ gắn `Out of Stock`) — đã GỘP thành effect bình thường của Highlight, dùng được ở CẢ 4 mục, xem mục "`PrizeEffectName`"/"Spotlight" ở [prize.md](./prize.md) mục 4 |
| `CurrentTimePanel.tsx` | Current Time |
| `ParticipantCountPanel.tsx` | Participant Count |
| `ButtonPanel.tsx` | Button (chọn action + styling, xem [button-actions.md](./button-actions.md)) — action "Open Link" có thêm **Source**, cùng nhánh 2 (Data Type = URL) như Winner Name's Source |
| `ScoreboardPanel.tsx` | Scoreboard — "Columns" là bản multi-select của nhánh 1 (liệt kê MỌI cột thật, không lọc Data Type) nhưng KHÔNG có tiêu chí phụ nào (bảng hiện được bất kỳ cột nào), nên không có khái niệm Eligible/not eligible ở đây — mọi checkbox luôn bật được |

## Nhóm component (`ComponentPalette.tsx`)

Menu "Add component" gom nhóm theo `CATEGORY_ORDER` (`componentRegistry.ts`) — chỉ hiện icon + tên
mỗi dòng (mô tả đầy đủ xem qua tooltip hover), giúp tìm nhanh thay vì cuộn qua 1 danh sách phẳng dài.

| Nhóm | Component | Mô tả |
|---|---|---|
| **Basic** | Text | Nhãn/tiêu đề tĩnh |
| | Image | Logo, banner, ảnh trang trí |
| | Background | Ảnh nền phủ canvas — kéo-thả/resize tự do như Image (không còn là "nền trang" toàn cục), tối đa 1 cái/trang, chuẩn bị sẵn cho mở rộng video sau này |
| **Draw** | Lucky Wheel | Vòng quay/Digit Roller gắn với Draw Engine — xem [lucky-wheel.md](./lucky-wheel.md) |
| | Winner | Tên người trúng gần nhất |
| | Prize | Ảnh giải vừa trúng gần nhất |
| | Scoreboard | Bảng người trúng đã confirm, hiện qua popup |
| **Live** | Current Time | Đồng hồ thời gian thực |
| | Participant Count | Số người tham gia trong session |
| **Interactive** | Button | Chạy 1 action cố định khi bấm ở Present Mode, xem [button-actions.md](./button-actions.md) |

`COMPONENT_REGISTRY` (`componentRegistry.ts`) là nguồn DUY NHẤT "nối dây" 1 loại component vào cả
Palette lẫn Canvas (tạo instance mặc định khi thả) — xem checklist thêm component mới ở
[config-lifecycle.md](./config-lifecycle.md).

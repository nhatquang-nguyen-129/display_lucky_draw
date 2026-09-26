# Lucky Wheel (2 template)

`LuckyWheelView.tsx` là dispatcher theo `props.template`, mỗi template tự quản lý animation riêng (cơ chế quay khác hẳn nhau nên không gộp logic), chỉ dùng chung phần binding dữ liệu.

## Template "wheel" (Wheel Circular)

`WheelTemplate.tsx` — vòng tròn chia segment theo từng participant (khử trùng theo `drawField`), quay bằng CSS `transform: rotate()` + `transition`, dừng đúng góc ứng với người trúng thật (đọc từ `data.results[0]`, KHÔNG tự chọn người trúng).

## Template "digitRoller" (Digit Roller)

`DigitRollerTemplate.tsx` — hiện N ô ký tự kiểu máy đánh số/slot-machine, nhấp nháy ngẫu nhiên rồi dừng ở giá trị thật.

**Định nghĩa quan trọng, đã đổi 1 lần trong quá trình phát triển — lưu ý khi đọc/sửa code này**:

> Digit Roll = quy ước về **số lượng ô ký tự (character slots)** hiển thị trên màn hình, KHÔNG phải kiểm tra dữ liệu có phải toàn số hay không.

Ban đầu code strip ký tự không phải số (`.replace(/\D/g, "")`) rồi mới đếm — nghĩa là `"ENFA0001"` bị coi là field "4-digit" (chỉ tính phần `"0001"`). Sau khi xác nhận lại với người yêu cầu, đổi thành: giá trị RAW (kể cả prefix chữ) phải dài ĐÚNG BẰNG `digitCount`, không cắt/lọc gì cả. `"ENFA0001"` (8 ký tự) hợp lệ cho 1 Digit Roll 8 ô, y hệt `"12345678"`.

Hệ quả: `DigitRollerTemplate` không còn `.replace(/\D/g, "")` — hiển thị **nguyên vẹn** giá trị thật; animation nhấp nháy lúc quay cũng đổi từ random digit (0-9) sang random ký tự chữ+số (`FLICKER_CHARS`), để không bị "lệch tông" khi giá trị thật có chữ cái.

Kích thước ô luôn tính từ khung kéo-thả trên canvas (`component.width`/`height`), không lệ thuộc 1 field "Font size" tách rời — giống hệt cách `WheelTemplate` lấy `size = min(width, height)`. Đây cũng là 1 quyết định sửa lại: ban đầu ô tính từ `fontSize` cố định, khiến khung mặc định (kế thừa 500×500 từ Wheel Circular) to hơn hẳn nội dung thật.

### Tốc độ quay — mô hình chung cho CẢ 2 rollStyle, luôn giảm tốc đều

Cả `rollStyle` "flicker" lẫn "reel" dùng CHUNG 1 mô hình tốc độ trong `DigitRollerTemplate.tsx` (không
phải 1 CSS easing string áp thẳng như `WheelTemplate.tsx`), chỉ khác cách hiển thị 1 "bước":

- **Mô hình chung** (`planSpinTiming`/`stepsTraveled`): mỗi ô có 3 pha vật lý kết thúc ĐÚNG lúc ô đó
  chốt (`stopAt[i]`) — tăng tốc đều (`ta`, ~8%), hành trình (`tc`, vận tốc `vc` không đổi), giảm tốc
  đều về 0 (`td`, ~28%). `unitDistance` (diện tích dưới đồ thị vận tốc chuẩn hoá) dùng để derive `vc`
  khớp ĐÚNG tổng quãng đường.
- **"reel"** — 1 bước = cuộn 1 hàng (giá trị thập phân, mượt). `vc = kMax / unitDistance` để dừng ĐÚNG
  ký tự thật.
- **"flicker"** — 1 bước = đổi sang 1 ký tự ngẫu nhiên (đổi mỗi khi phần nguyên số bước tăng). `vc`
  cố định = 1 bước / `FLICKER_STEP_MS` (40ms) ở pha hành trình; hết thời lượng thì chốt ký tự thật.

Với `revealTiming` "sequential", ô sau chỉ có tổng thời lượng dài hơn ô trước — VẪN có đủ pha giảm
tốc riêng.

`WheelTemplate.tsx` (Wheel Circular) cũng giảm tốc đều từ đầu tới lúc dừng — CSS
`cubic-bezier(0.333, 0.667, 0.667, 1)` (đúng đường cong 2t - t²), không dùng CSS `linear` (vận tốc
không đổi rồi đứng khựng lại tức khắc).

**Đã bỏ dropdown "Spin style" (`spinEasing`)**: từng có Linear/Fast Start and Slow Stop/Smooth Start
and Stop (sau đổi thành Slow Start and Fast Stop) đổi hình dạng pha giảm tốc — khi xem thật, khác biệt
giữa các kiểu không đáng kể nên bỏ hẳn, chỉ giữ giảm tốc đều. Landing cũ còn lưu `spinEasing` trong
JSON — bị bỏ qua, không cần migration.

**Bug đã sửa (đã gặp thật)**: Flicker từng dùng mô hình riêng 2 pha "waiting"/"settling", trong đó ô
i>0 chỉ được giảm tốc trong khoảng stagger ~150ms giữa `stopAt[i-1]` và `stopAt[i]` — chỉ ô đầu tiên
thật sự giảm tốc. Đã gộp Flicker vào mô hình chung với Reel ở trên.

### Digit Roller trong Quick Draw — quay xong CHỐT Ở "-", không hiện số của người trúng cuối

Quick Draw ra nhiều người trúng NGAY LẬP TỨC không nghỉ giữa các lượt (xem mục "3 chế độ Draw" ở
[button-actions.md](./button-actions.md)) — không có 1 người trúng "đúng" nào để Digit Roller quay
tới riêng lẻ, và `results[0].id` đổi liên tục theo từng người khiến nhiều lượt `startSpin()` chồng
lên nhau huỷ nhau dở dang nếu quay theo cách thường (bug đã gặp thật: ô số kẹt nửa-số-thật-nửa-nhấp-
nháy). Cách xử lý trong `DigitRollerTemplate.tsx`:

- Trong lúc `data.quickDrawActive` (đọc từ `effectiveData` — xem `useDrawSequence.ts`) đang bật: mọi
  candidate mới xuất hiện trong batch bị BỎ QUA hoàn toàn (không tự quay theo từng người), ô số đóng
  băng tĩnh ở `-`.
- Ngay khi Quick Draw dứt hẳn (`quickDrawActive` true → false), tự chạy ĐÚNG 1 lượt quay THẬT
  (`runRoll`) — đủ nguyên `spinDurationMs` đã cấu hình (không bị cắt ngang bởi candidate nào khác vì
  Quick Draw đã xong) — nhưng CHỐT ở `-` cho MỌI ô thay vì số điện thoại/mã của người trúng cuối cùng.
- Idle thật sự (chưa từng có kết quả nào trong session — vừa mở landing lần đầu, HOẶC vừa Reset xong)
  cũng đóng băng ở `-` — không còn hiện ký tự ngẫu nhiên như trước.

`rollStyle` "reel" cần lưu ý riêng: `wheelFor("-")` tự nó trả bảng chữ cái 1 ký tự (không digit/upper/
lower) → `kMax = 0` → KHÔNG cuộn gì cả nếu dùng thẳng, đứng hình ngay ở `-` bất kể `spinDurationMs`.
`planReelSlot`/`runRoll` nhận thêm `alphabetOverride` — CHỈ lượt quay chốt `-` sau Quick Draw truyền
`WHEEL_DIGITS + "-"` để ép có quãng đường mà cuộn (quay qua số rồi mới dừng ở `-`); lượt quay THẬT của
1 người trúng cụ thể (`startSpin()`) không truyền override, 1 dấu `-` xuất hiện tự nhiên trong dữ liệu
thật (vd số điện thoại định dạng gạch nối) vẫn đứng yên như cũ.

## Field validation trong LuckyWheelPanel — "field nào dùng được cho Digit Roll"

Draw/Display/Winner display field của Lucky Wheel là ví dụ nhánh 1 của quy tắc "Source picker" ở
[`docs/landing/properties-panel.md`](./properties-panel.md) — KHÔNG field nào bị lọc theo Data Type
(Name/Phone/Code/URL đều dùng được như nhau, kể cả trộn lẫn), vì Draw Engine chỉ cần 1 chuỗi bất kỳ
để làm khoá gom nhóm/hiển thị, không quan tâm chuỗi đó "nghĩa là gì". Danh sách field để chọn hợp
nhất **mọi cột SQL lõi (name/phone/code/email) đang THỰC SỰ có dữ liệu** (`computeActiveParticipantCoreFields`
— 4 label chung này KHÔNG hiện nếu cột SQL cùng tên rỗng, dù cột `extra_data` khác có gán Data Type
tương ứng; xem cảnh báo "bẫy đã gặp thật" ở properties-panel.md) với **mọi cột optional (`extra_data`)
đang thực sự xuất hiện ở participant** (`extraColumns`). Giá trị thật của mỗi field đọc qua
`resolveWheelField()` (`lib/landing/types.ts`) — tự resolve 4 label chung qua Data Type mapping
(`resolveParticipantDisplayField`) thay vì đọc cứng `participant.name/.phone/...`, cột optional đọc
thẳng `extra_data`.

`evaluateField(field, count)` trong `LuckyWheelPanel.tsx` — CHỈ áp dụng riêng cho **Source field của
Digit Roller** (tiêu chí phụ, không phải Data Type): field hợp lệ khi VÀ CHỈ KHI **100% participant**
có giá trị dài đúng bằng `count`. Sinh ra tối đa 3 lý do độc lập (không loại trừ nhau, có thể cùng
xảy ra), hiện qua `title` (tooltip HTML, hỗ trợ xuống dòng bằng `\n`) trên `<option disabled>`:

- Thiếu dữ liệu (`N participants have no value...`)
- Độ dài không đồng nhất giữa các participant (`Length is inconsistent...`)
- Độ dài không khớp `digitCount` đang chọn (`Values have X characters — need exactly N`)

Field không đạt vẫn HIỆN trong dropdown (chỉ `disabled` kèm lý do) — khác nhánh 2 (Data Type cụ thể),
nơi field sai hẳn ý nghĩa bị ẨN HOÀN TOÀN, không chỉ mờ đi.

Lucky Wheel không cần Button ra lệnh — cách nó tự phát hiện có candidate mới để bắt đầu quay được giải thích ở [button-actions.md](./button-actions.md).

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

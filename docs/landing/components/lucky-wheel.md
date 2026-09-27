# Lucky Wheel (`luckyWheel`) — nhóm Draw

> **Đã CHỐT cho production** (xem `CHANGELOG.md`) — chỉ sửa bug, không đổi hành vi/giao diện nếu
> không được yêu cầu rõ.

Hình ảnh "đang quay số" gắn với Draw Engine. **Tối đa 1 cái/trang** (mọi Wheel đọc chung 1 nguồn
candidate, cái thứ 2 chỉ quay ra đúng kết quả giống hệt). Mặc định 500×500. 2 template, chọn ở
**Template**:

- **Wheel** (`wheel`, `WheelTemplate.tsx`): vòng tròn chia segment theo participant.
- **Digit Roller** (`digitRoller`, `DigitRollerTemplate.tsx`): N ô ký tự kiểu máy đánh số.

`LuckyWheelView.tsx` chỉ là dispatcher theo `props.template`; mỗi template tự quản lý animation, chỉ
dùng chung phần binding dữ liệu.

## Nguyên tắc chung của cả 2 template

- **KHÔNG tự chọn người trúng** — luôn dừng ở người thật do Draw Engine trả về (`results[0]`).
- **Không cần Button ra lệnh**: tự phát hiện có candidate LIVE mới (`results[0].id` đổi và là
  `pending-*`) rồi tự quay — kể cả lượt "quay lại" từ action Draw khi đang có candidate chờ Confirm.
  Dừng đúng lúc animation thật sự kết thúc. Kết quả cũ từ DB khi mở lại phiên không kích hoạt quay.
- **Luôn giảm tốc đều tới lúc dừng**, không dừng khựng.
- Field hiển thị resolve qua Data Type của cột (`resolveWheelField`), không đọc cứng `participant.name`.
- Chỉ quay ở Present Mode; Builder không có kết quả LIVE nên đứng yên.

## Properties Panel (`LuckyWheelPanel.tsx`)

**Basic options** (Position gộp ở cuối, ẩn Effect entrance chung):

| Field | Prop | Template | Ghi chú |
|---|---|---|---|
| Template | `template` | cả 2 | Wheel / Digit Roller |
| Draw field (identifies each segment) | `drawField` | Wheel | Khoá gom nhóm/khử trùng segment: Participant ID / Code / Phone / Email / cột `extra_data` |
| Display field (shown on the wheel) | `displayField` | Wheel | Chữ trên từng segment: Name / Phone / Email / Code / cột `extra_data` |
| Mask phone numbers | `maskSensitiveData` | Wheel | Che số điện thoại khi field hiển thị là phone |
| Source | `winnerDisplayField` | cả 2 | Wheel: tên công bố; Digit Roller: nguồn ký tự |
| Digit count | `digitCount` | Digit Roller | Số ô ký tự |
| Font / Font size / Color | `fontFamily`/`fontSize`/`fontColor` | cả 2 | Font: Sans / Serif / Monospace |
| X / Y / Width / Height | | cả 2 | Digit Roller: Height khoá "(auto)" |

**Self Interactions** → **Spin**: **Spin duration (ms)** (`spinDurationMs`, mặc định 4000) + **Style**
(`rollStyle`: Flicker / Reel — chỉ Digit Roller). Không có "Interactions with Draw" (Wheel luôn gắn với
Draw, không tắt được).

### Chọn field — nhánh 1 của quy tắc Source

Draw/Display/Source không lọc theo Data Type (Draw Engine chỉ cần 1 chuỗi làm khoá/hiển thị) —
[builder.md mục 7](../builder.md#dropdown-source-chọn-cột-participant--đúng-1-trong-2-nhánh). Danh sách =
4 nhãn chung Name/Phone/Email/Code (CHỈ khi cột SQL lõi cùng tên có dữ liệu thật,
`computeActiveParticipantCoreFields`) + mọi cột `extra_data` đang xuất hiện. Nhãn "ảo" đang lưu (cột lõi
rỗng) thì panel tự chuyển sang cột thật đầu tiên.

**Source của Digit Roller có tiêu chí phụ** (`evaluateField(field, count)`): hợp lệ khi VÀ CHỈ KHI 100%
participant có giá trị dài đúng `digitCount`. Option không đạt vẫn HIỆN nhưng `disabled`, tooltip ghi
tối đa 3 lý do: thiếu dữ liệu (`N participants have no value...`), độ dài không đồng nhất
(`Length is inconsistent...`), không khớp số ô (`Values have X characters — need exactly N`).

## Template Wheel

Vòng tròn chia segment theo participant (khử trùng theo `drawField`), quay bằng CSS
`transform: rotate()` + `transition`, dừng đúng góc của người trúng. Easing
`cubic-bezier(0.333, 0.667, 0.667, 1)` = đúng đường cong giảm tốc đều `2t − t²` (không dùng `linear` —
vận tốc không đổi rồi đứng khựng). Kích thước `size = min(width, height)`.

## Template Digit Roller

**Định nghĩa (đã đổi 1 lần, lưu ý khi sửa)**: Digit Roll = **số ô ký tự hiển thị**, KHÔNG phải kiểm tra
dữ liệu có toàn số. Giá trị RAW (kể cả prefix chữ) phải dài ĐÚNG `digitCount`, không cắt/lọc gì —
`"ENFA0001"` hợp lệ cho 8 ô y như `"12345678"`. Ký tự nhấp nháy lúc quay lấy từ chữ + số
(`FLICKER_CHARS`) để không lệch tông khi giá trị thật có chữ.

**Kích thước ô** tính từ khung kéo-thả (`width`), không từ 1 field font size riêng. Height tự khớp
theo width + `digitCount` (`computeDigitRollerFitHeight`: khe 8px, tỉ lệ ô 0.7:1) — Builder áp lại sau
mọi thay đổi, người dùng không chỉnh tay.

### Tốc độ quay — mô hình chung cho cả Flicker lẫn Reel

- **Mô hình 3 pha mỗi ô** (`planSpinTiming`/`stepsTraveled`), kết thúc ĐÚNG lúc ô đó chốt (`stopAt[i]`):
  tăng tốc đều (~8%) → hành trình vận tốc không đổi → giảm tốc đều về 0 (~28% cuối). `unitDistance`
  (diện tích dưới đồ thị vận tốc chuẩn hoá) để suy ra vận tốc khớp đúng tổng quãng đường.
- **Reel**: 1 bước = cuộn 1 hàng (giá trị thập phân, mượt), vận tốc chọn để dừng đúng ký tự thật.
- **Flicker**: 1 bước = đổi sang 1 ký tự ngẫu nhiên, ~40ms/bước ở pha hành trình (`FLICKER_STEP_MS`);
  hết thời lượng thì chốt ký tự thật.
- Dừng **lần lượt từng ô** (`revealTiming: "sequential"`, ô sau trễ ~`revealStaggerMs` × 70–130%) — mỗi ô
  có đủ pha giảm tốc riêng. **Bug đã sửa**: Flicker từng dùng mô hình 2 pha riêng, chỉ ô đầu thật sự
  giảm tốc, các ô sau chạy nhanh rồi dừng đột ngột.
- Hiệu ứng khi 1 ô chốt: Flicker dùng `landingEffect` (pop); Reel dùng `reelCardEffect` (khung "pop") +
  `reelNumberEffect` (ký tự "bounce") — CSS trong `digitRollerEffects.css`.

### Quick Draw — quay xong CHỐT Ở "-"

Quick Draw ra nhiều người liên tục không nghỉ → không có 1 người "đúng" để quay tới, và `results[0].id`
đổi liên tục khiến nhiều lượt quay chồng nhau huỷ dở (bug đã gặp: ô kẹt nửa số thật nửa nhấp nháy):
- Trong lúc `data.quickDrawActive`: bỏ qua mọi candidate mới, ô đóng băng ở `-`.
- Quick Draw vừa xong: chạy đúng 1 lượt quay thật đủ `spinDurationMs` nhưng chốt `-` cho mọi ô.
- Idle thật (vừa mở landing lần đầu, hoặc vừa Reset) cũng đứng ở `-`.
- Reel: `wheelFor("-")` chỉ có 1 ký tự nên không có quãng để cuộn → lượt chốt `-` sau Quick Draw truyền
  `alphabetOverride = WHEEL_DIGITS + "-"` để cuộn qua số rồi mới dừng ở `-`. Lượt quay thật của 1 người
  không truyền override (dấu `-` tự nhiên trong dữ liệu, vd số điện thoại có gạch, vẫn đứng yên).

## Đã bỏ khỏi Properties Panel (field vẫn còn trong props)

- **Spin style** (`spinEasing` — Linear / Fast Start and Slow Stop / …): khác biệt không đáng kể khi xem
  thật, chỉ giữ giảm tốc đều. JSON cũ còn field này bị bỏ qua.
- **Timing** (`revealTiming`) và **Effect** (`reelCardEffect`/`reelNumberEffect`/`landingEffect`), ô
  `revealStaggerMs`: component MỚI luôn dùng `sequential`/`pop`/`bounce`/150ms
  (`componentRegistry.ts`); landing CŨ giữ giá trị đã lưu.

## Hướng mở rộng

Thêm template: giá trị mới trong `LuckyWheelTemplate` + 1 file trong `luckyWheelTemplates/` + 1 case ở
`LuckyWheelView.tsx` + option trong `LuckyWheelPanel.tsx` — không đụng 2 template đã chốt.

## File liên quan

`src/lib/landing/types.ts` (`LuckyWheelProps`, `resolveWheelField`, `computeDigitRollerFitHeight`,
`computeWheelRevealDelayMs`), `views/LuckyWheelView.tsx`, `luckyWheelTemplates/WheelTemplate.tsx`,
`luckyWheelTemplates/DigitRollerTemplate.tsx`, `luckyWheelTemplates/displayValue.ts`,
`luckyWheelTemplates/digitRollerEffects.css`, `panels/LuckyWheelPanel.tsx`.

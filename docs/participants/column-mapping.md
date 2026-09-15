# Gán nhãn cột — Data Type là cơ chế DUY NHẤT

> **Lịch sử thiết kế**: bản đầu tiên của tính năng generic-import có 2 cơ chế riêng — "Data Type"
> (nhãn validation) và "Use as" (di chuyển dữ liệu vào cột SQL lõi). Sau khi dùng thử, 2 cơ chế này
> bị nhận ra là **trùng logic** (cùng trả lời câu hỏi "cột này nghĩa là gì"), nên "Use as" đã bị BỎ
> HẲN — `mapColumnToCoreFieldCommand` không còn tồn tại. Giờ **chỉ còn Data Type**, và toàn bộ phần
> còn lại của app (Draw Engine, Winner Name, Scoreboard...) tự đọc động theo Data Type thay vì đọc
> cứng cột SQL — xem [`docs/architecture/draw-engine.md`](../architecture/draw-engine.md).

## Cách hoạt động

Sau khi [import generic](./import.md), mọi cột (dù từ file hay tự thêm tay) đều bình đẳng — không cột nào "quan trọng hơn" cột nào về mặt lưu trữ. Gán ý nghĩa cho 1 cột (Name/Phone/Email/Code/URL/Text) qua đúng 1 chỗ: dropdown "Data type" khi click ▾ ở header cột (`DataEditorModal.tsx`).

**Không có bước di chuyển dữ liệu nào cả.** Gán Data Type = "Name" cho 1 cột lạ tên (vd "Hãy cho KidsPlaza biết đầy đủ Họ và Tên của Mẹ nha!") là XONG — dữ liệu vẫn nằm nguyên tại cột đó (`extra_data`), không copy đi đâu. `sessions.participant_column_types` (`{ [tênCột]: ColumnType }`) chỉ lưu đúng 1 việc: cột nào đang mang ý nghĩa gì.

## Data Type dùng cho 2 việc

1. **Validate định dạng** (đã có từ đầu) — `validateState()` (`validate.ts`) áp đúng quy tắc theo type của cột:
   - `phone` → `isValidVietnamesePhone` (bắt đầu bằng 0, 10-11 chữ số).
   - `email` → regex email chuẩn.
   - `url` → `isValidUrl`.
   - `name` → so khớp "kiểu viết hoa phổ biến nhất trong cột" (không ép Title Case cứng).
2. **Xác định "cột nào là Name/Phone của participant"** cho phần còn lại của app (`resolveColumnForType()` trong `validate.ts`, và bản sao cho renderer/main process — xem bên dưới). Đây là phần MỚI, thay thế hẳn việc đọc cứng `participant.name`/`participant.phone`.

## `resolveColumnForType` — tìm "cột nào là Name" (hoặc Phone/Code/Email)

```ts
export function resolveColumnForType(
  state: EditorState,
  columnTypes: Record<string, ColumnType>,
  type: ColumnType
): string | undefined {
  for (const col of CORE_FIELDS) {
    if (!isCoreFieldActive(col, state)) continue; // core field chỉ tính nếu ĐANG có dữ liệu thật
    if ((columnTypes[col] ?? defaultColumnType(col)) === type) return col;
  }
  for (const col of state.columns) {
    if (columnTypes[col] === type) return col; // cột phụ CHỈ tính khi có override tay rõ ràng
  }
  return undefined;
}
```

Thứ tự ưu tiên: core field (`name`/`phone`/`code`/`email`) trước — NHƯNG chỉ tính nếu nó đang thực sự có dữ liệu ở ít nhất 1 dòng (dữ liệu cũ từ trước khi đổi thiết kế import, hoặc participant tạo/sửa thủ công). Sau đó mới tới cột phụ đầu tiên được gán tay đúng type đó. Import generic mới luôn để 4 core field trống → không match ở bước 1 → cột phụ do người dùng gán mới là "cột thật".

## Core field ẩn khi không có dữ liệu

`isCoreFieldActive(col, state)` — core field chỉ HIỆN trong bảng khi có dữ liệu thật ở ít nhất 1 dòng. Ngay sau khi import generic, cả 4 core field đều trống → **không hiện cột nào trong 4 cột này cả** — bảng chỉ hiện đúng các cột từ file gốc, không có gì "mặc định sẵn". Gán Data Type cho 1 cột phụ KHÔNG làm nó biến mất hay tạo thêm cột nào — nó vẫn là chính nó, chỉ giờ mang thêm ý nghĩa Name/Phone/....

Core field chỉ "sống lại" (hiện ra) nếu dữ liệu thật xuất hiện ở đó — trong thực tế, với luồng import generic mới, điều này gần như không bao giờ xảy ra (không còn bước nào ghi vào core field nữa) — 4 cột này giờ chỉ còn ý nghĩa **tương thích ngược cho session tạo từ trước khi đổi thiết kế**.

## 2 field LUÔN bắt buộc, SAU KHI đã có cột nào đó đóng vai trò đó

```ts
const nameCol = resolveColumnForType(state, columnTypes, "name");
const phoneCol = resolveColumnForType(state, columnTypes, "phone");
state.rows.forEach((r) => {
  if (nameCol && !getCell(r, nameCol).trim()) issues.push({ rowId: r.id, col: nameCol, message: "Missing Name" });
  if (phoneCol && !getCell(r, phoneCol).trim()) issues.push({ rowId: r.id, col: phoneCol, message: "Missing Phone" });
});
```

Chưa gán Data Type = Name cho cột nào cả → `nameCol` là `undefined` → KHÔNG có issue "Missing Name" nào cả (chưa có gì để coi là thiếu). Ngay khi gán xong, validate bắt đầu chạy đúng trên cột đó, dòng nào rỗng ở đúng cột đó mới bị flag — đúng tinh thần "generic trước, label sau, chỉ báo lỗi cụ thể SAU khi đã gán nhãn".

## Cùng 1 logic, 3 bản sao (do ranh giới build khác nhau)

| Nơi dùng | File | Vì sao không dùng chung 1 hàm |
|---|---|---|
| Data Editor | `src/lib/dataEditor/validate.ts` (`resolveColumnForType`) | Thao tác trên `EditorState`/`EditorRow` (đang sửa dở, chưa lưu) |
| Renderer (Winner Name, Scoreboard đang chờ Confirm) | `src/lib/landing/types.ts` (`resolveParticipantDisplayField`) | Thao tác trên `Participant` thật (đã lưu, `extra_data` là JSON string chứ không phải object) |
| Main process (Draw Engine, kết quả đã Confirm) | `electron/participantFields.ts` (`resolveParticipantField`) | `electron/` là project TS biên dịch riêng (`rootDir` khác), không import được từ `src/` |

Đổi logic resolve (vd thêm ưu tiên khác) phải sửa cả 3 nơi — mỗi file đều có comment trỏ chéo sang 2 file còn lại.

## Column Label — khái niệm KHÁC, KHÔNG liên quan

`sessions.participant_column_labels` (`{ [tênCột]: "Nhãn hiển thị" }`) chỉ đổi **tên hiển thị** của core field trong Data Editor (vd đổi header "Phone" thành "Số điện thoại") — không liên quan gì tới việc gán ý nghĩa dữ liệu (Data Type). Đừng nhầm 2 khái niệm này.

## Trùng lặp (duplicate) — cũng tách riêng, và LUÔN LIVE theo selection

Không gắn với Data Type — cột nào xác định trùng lặp (compound key, có thể nhiều cột) lấy TRỰC TIẾP từ cột đang bôi chọn trên bảng (`targetColumns`) NGAY LÚC ĐÓ, dùng chung cho cả chip "Duplicated Rows" ở status bar lẫn preset "Data ▸ Deduplicate ▸ Remove Duplicated Rows" (xem [data-editor.md](./data-editor.md)) — 2 nơi này luôn ra CÙNG 1 con số vì cùng gọi `findDuplicateIdsToRemove` (chip) / `findDuplicateGroups` (preset — bản đầy đủ nhóm, dùng cho popup chọn dòng giữ lại thủ công, xem data-editor.md). Chưa bôi cột nào thì không có gì để tính trùng cả — chip biến mất, preset yêu cầu bôi cột trước khi chạy.

Từng có `sessions.participant_duplicate_columns` (JSON `string[]`, lưu riêng) làm nguồn cho việc này — đã BỎ khỏi luồng app (cột DB vẫn còn trong schema cho tương thích ngược, chỉ không còn ai ghi/đọc nữa) vì gây bug: đổi selection trên bảng không tự cập nhật config đã lưu, và chỉ cần MỞ preset dedup ra xem (dù sau đó Cancel) cũng đã âm thầm ghi đè config, để lại chip đỏ sai mà bôi lại cột khác không cách nào tự hết.

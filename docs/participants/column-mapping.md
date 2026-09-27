# Data Type — cơ chế DUY NHẤT gán ý nghĩa cho cột

Sau khi [import generic](./import.md), mọi cột bình đẳng. Gán ý nghĩa **Name / Phone / Email / Code /
URL / Text** cho 1 cột qua đúng 1 chỗ: dropdown **Data type** khi bấm ▾ ở header cột trong Data Editor.

- **Không di chuyển dữ liệu**: gán Data Type = Name cho cột "Hãy cho KidsPlaza biết đầy đủ Họ và Tên
  của Mẹ nha!" là xong — dữ liệu vẫn nằm nguyên trong `extra_data`.
- `sessions.participant_column_types` (JSON `{ [tênCột]: ColumnType }`) chỉ lưu "cột nào mang ý nghĩa
  gì".
- **Lịch sử**: bản đầu có thêm thao tác "Use as" (chép dữ liệu vào cột SQL lõi). Nhận ra trùng logic với
  Data Type nên đã **bỏ hẳn** (`mapColumnToCoreFieldCommand` không còn). Đừng làm lại.

## Data Type dùng cho 2 việc

1. **Validate định dạng** (`validateState()`, `src/lib/dataEditor/validate.ts`): Phone →
   `isValidVietnamesePhone` (bắt đầu 0, 10–11 chữ số); Email → regex; URL → `isValidUrl`; Name → không
   chứa số + kiểu viết hoa theo số đông của cột. Danh sách chip lỗi: [data-editor.md](./data-editor.md#6-validate--issues).
2. **Xác định "cột nào là Name/Phone/Code/Email của participant"** cho phần còn lại của app — Draw
   Engine hiển thị tên người trúng, Winner, Scoreboard, Lucky Wheel, Button Open Link… đều đọc động theo
   Data Type, không đọc cứng `participant.name`/`.phone`.

## `resolveColumnForType` — tìm "cột nào là Name"

```ts
for (const col of CORE_FIELDS) {                 // name/phone/code/email
  if (!isCoreFieldActive(col, state)) continue;  // cột lõi CHỈ tính khi đang có dữ liệu thật
  if ((columnTypes[col] ?? defaultColumnType(col)) === type) return col;
}
for (const col of state.columns) {               // rồi tới cột phụ được gán tay đúng type
  if (columnTypes[col] === type) return col;
}
return undefined;
```

Cột lõi (dữ liệu cũ từ trước khi đổi thiết kế import) được ưu tiên — nhưng chỉ khi có dữ liệu thật ở ít
nhất 1 dòng. Import mới luôn để 4 cột lõi trống, nên cột phụ do người dùng gán mới là "cột thật".

**Cột lõi ẩn khi không có dữ liệu** (`isCoreFieldActive`): ngay sau import generic, Data Editor chỉ
hiện đúng các cột từ file, không có 4 cột lõi trống. 4 cột này giờ chỉ còn ý nghĩa **tương thích ngược**
cho session tạo từ trước.

**Missing Name / Missing Phone** chỉ báo SAU KHI đã có cột được gán Data Type đó — dòng nào rỗng ở đúng
cột đó mới bị flag ("generic trước, gán nhãn sau, chỉ báo lỗi cụ thể sau khi đã gán nhãn").

## Cùng 1 logic, 3 bản sao

| Nơi dùng | File | Vì sao không dùng chung |
|---|---|---|
| Data Editor | `src/lib/dataEditor/validate.ts` (`resolveColumnForType`) | Chạy trên `EditorState` đang sửa dở, chưa lưu |
| Renderer (Landing: Winner, Lucky Wheel, candidate chưa Confirm) | `src/lib/landing/types.ts` (`resolveParticipantDisplayField`, `listParticipantColumnsForType`) | Chạy trên `Participant` đã lưu (`extra_data` là JSON string) |
| Main process (Draw Engine, kết quả đã Confirm) | `electron/participantFields.ts` (`resolveParticipantField`) | `electron/` là project TS riêng, không import được `src/` |

Đổi logic resolve phải sửa cả 3 nơi — mỗi file có comment trỏ chéo sang 2 file kia. Quy tắc dựng
dropdown chọn cột ở Landing Builder (lọc theo Data Type hay liệt kê mọi cột):
[`docs/landing/builder.md`](../landing/builder.md) mục 7.

## Khái niệm dễ nhầm

- **Column Label** (`sessions.participant_column_labels`, `{ [tênCột]: "Nhãn" }`): chỉ đổi **tên hiển
  thị** của cột lõi trong Data Editor (vd "Phone" → "Số điện thoại"). Không liên quan Data Type.
- **Trùng lặp (duplicate)**: không gắn với Data Type — xác định theo cột đang bôi chọn trên bảng, xem
  [data-editor.md](./data-editor.md#chip-trùng-lặp--live-theo-cột-đang-bôi).
- **Đổi Data Type/Label không phải 1 Command** (không vào Undo của bảng): ghi thẳng xuống DB qua IPC ngay
  khi chọn, vì là metadata của session chứ không phải dữ liệu của 1 dòng.

## Bug đã sửa: gán Data Type xong, mở lại Data Editor thì mất

`updateColumnTypes`/`updateColumnLabels` ghi thẳng xuống DB, nhưng Data Editor `load()` lại cấu hình từ
prop `session` giữ trong bộ nhớ — bản cũ chưa biết thay đổi vừa ghi. Dữ liệu không mất thật trong DB, chỉ
UI đọc nhầm bản cũ. Sửa: gọi `onSessionRefresh()` (do `DataEditorWindow.tsx` truyền vào, fetch lại
`sessions:get`) ngay sau khi 2 API này lưu xong.

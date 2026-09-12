# Data Editor

`src/components/DataEditorModal.tsx` (component chính, rất lớn) + `src/lib/dataEditor/` (logic thuần, không JSX: `types.ts`, `commands.ts`, `validate.ts`, `transforms.ts`, `history.ts`).

## Ý tưởng

Trình soạn thảo bảng tính rút gọn (giống Excel/Google Sheets thu nhỏ) ngay trong app — sửa từng ô, thêm/xoá hàng-cột, tìm & thay thế, phát hiện trùng lặp, sinh mã tự động, **Undo/Redo cho MỌI thao tác kể cả thao tác hàng loạt**.

## Mô hình dữ liệu (`types.ts`)

```ts
export const CORE_FIELDS = ["name", "phone", "code", "email"] as const;

interface EditorRow {
  id: string;
  name: string; phone: string; code: string; email: string; // 4 core field — LUÔN là property riêng
  status: string; created_at: string;
  extra: Record<string, string>; // mọi cột khác (kể cả cột import generic chưa gán nhãn)
  __isNew?: boolean; // dòng vừa "Add Row", chưa tồn tại trong DB tới khi Save
}

interface EditorState {
  columns: string[]; // tên các cột PHỤ hiện có — KHÔNG gồm 4 core field
  rows: EditorRow[];
}
```

`getCell(row, col)` / `withCell(row, col, value)` là 2 hàm trung tâm — tự route đọc/ghi vào đúng property core hay vào `row.extra[col]`, để phần lớn code (command, validate, render bảng) không cần biết `col` là core hay phụ.

## Command Pattern — trục xương sống

Mọi thao tác sửa dữ liệu là 1 object thuần:

```ts
interface Command {
  label: string;                                  // hiện trong panel History
  execute: (state: EditorState) => EditorState;    // pure, KHÔNG side-effect
  undo: (state: EditorState) => EditorState;
}
```

`useCommandHistory` (`history.ts`) giữ `pastRef`/`futureRef` (2 mảng `Command[]`, không phải state React trực tiếp) — nhờ vậy `jumpTo(targetLength)` (bấm 1 mốc bất kỳ trong panel "History" để rollback thẳng tới đó) chỉ chạy 1 vòng `undo`/`execute` liên tiếp trên biến cục bộ.

**Thêm 1 thao tác mới** → viết 1 hàm `xxxCommand(state, ...) => Command` trong `commands.ts`, gọi qua `history.run(xxxCommand(...))` trong component. Không sửa trực tiếp `history.state` — phá vỡ Undo/Redo.

Danh sách command hiện có (`commands.ts`):

| Nhóm | Command | Ghi chú |
|---|---|---|
| Edit | `editCellCommand`, `insertRowCommand`/`insertRowsCommand`, `deleteRowsCommand`, `addColumnCommand`/`insertColumnsCommand`, `removeColumnCommand`, `renameColumnCommand`, `pasteBlockCommand`, `reorderRowsCommand` | Cột lõi không xoá được hẳn — "xoá cột lõi" = clear giá trị (`removeColumnCommand`) |
| Format/Clean | `batchTransformCommand` (khung dùng chung), `findEmptyRowIds`, `removeEmptyColumnsCommand`, `findDuplicateIdsToRemove` | Transform cụ thể (upper/lower/title case, trim, normalize) nằm ở `transforms.ts` |
| Generate | `generateIdCommand`, `runningNumberCommand`, `displayPhoneCommand`, `combineColumnsCommand` | Dùng chung helper `setColumnValuesCommand` |
| Meta | `combineCommands` | Gộp nhiều Command thành 1 bước Undo duy nhất |

## Toolbar — "động từ thuần", phạm vi lấy từ selection

4 nhóm menu (`Edit`/`Format`/`Data`/`Generate`) không chứa dropdown chọn cột/dòng bên trong — phạm vi tác động luôn lấy từ selection người dùng đã bôi trực tiếp trên bảng (`targetColumns` = cột đang bôi ở header, hoặc cột chứa ô đang chọn). Quyết định thiết kế này để tránh menu phình to với "Apply to column" + checkbox list (từng có, đã bỏ — xem lịch sử commit "Rework the Data Editor menus into pure actions").

## Validate & Issues

`validateState(state, columnTypes, duplicateColumns)` (`validate.ts`) chạy lại mỗi khi state đổi, trả `CellIssue[]` hiển thị dạng chip ở status bar (bấm chip để lọc bảng theo đúng loại lỗi đó). Chi tiết rule theo `ColumnType` xem [column-mapping.md](./column-mapping.md).

**Ngoại lệ của Command Pattern**: đổi "Data type" 1 cột (`updateColumnType`) KHÔNG phải 1 `Command` — ghi thẳng vào `sessions.participant_column_types` qua IPC ngay khi chọn, không qua `history.run()`. Có chủ đích: đây là **metadata của session** (thuộc tính của cột, giống `participant_column_labels`/`participant_duplicate_columns`), không phải dữ liệu của 1 dòng cụ thể — không cần/không nên chung 1 dòng lịch sử Undo với việc sửa ô dữ liệu.

## Autosave + Save

- Autosave sau `AUTOSAVE_DELAY_MS = 20000` (20s) kể từ lần sửa cuối, nếu `history.dirty`.
- `handleSave()`: so từng dòng với `originalRows` (snapshot lúc load) — dòng nào thật sự đổi mới gọi `participants:update`; dòng mới (`__isNew`) gọi `participants:create`; dòng bị xoá khỏi state → `participants:bulkDelete`. Cuối cùng `participants:reorder` để ghi lại `sort_order` hiện tại (kể cả khi không kéo-thả gì, để không bị lệch thứ tự sau khi reload).
- Đóng modal khi đang dirty → `confirm()` hỏi có muốn bỏ thay đổi chưa lưu không.

## Cột lõi vs cột phụ trong UI

- Cột lõi (`name`/`phone`/`code`/`email`) **chỉ hiện khi đang có dữ liệu thật** (`isCoreFieldActive`, xem [column-mapping.md](./column-mapping.md)) — không còn hiện sẵn 4 cột trống mặc định như thiết kế cũ. Cột nào đang được coi là "Name"/"Phone" (đánh dấu `*` ở header) được tính bằng `resolveColumnForType`, KHÔNG cố định là literal cột `name`/`phone`. "Xoá cột" trên core field chỉ clear giá trị (không drop được cột), và vì hiển thị giờ phụ thuộc dữ liệu, clear hết giá trị sẽ tự ẩn cột đó ngay sau đó — không cần state "đã xoá" riêng để theo dõi.
- Cột phụ (bao gồm mọi cột vừa import — xem [import.md](./import.md)) tự do thêm/xoá/đổi tên/kéo-thả thứ tự. Gán ý nghĩa cho 1 cột phụ (Name/Phone/...) chỉ qua dropdown "Data type" — không có thao tác "chuyển thành core field" nào nữa (xem [column-mapping.md](./column-mapping.md)).
- Bàn hoàn toàn trống (chưa import, chưa có dòng nào) → "+ Add first row" tự tạo kèm 2 cột gợi ý "Name"/"Phone" (cột phụ bình thường, không đặc biệt) để không rơi vào bảng trắng không gõ được gì.

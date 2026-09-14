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
| Format/Clean | `batchTransformCommand` (khung dùng chung) | Transform cụ thể (upper/lower/title case, trim, normalize) nằm ở `transforms.ts` |
| Automate | `findEmptyRowIds`, `findEmptyColumns`, `removeEmptyColumnsCommand`, `findDuplicateIdsToRemove` | Preset xoá hàng loạt theo tiêu chí tự động — xem mục "Automate menu" bên dưới |
| Automate ▸ Generate | `generateNumberCommand`, `displayPhoneCommand`, `combineColumnsCommand` | Dùng chung helper `setColumnValuesCommand`; `Generate` là 1 submenu NẰM TRONG `Automate`, không còn là menu cấp cao nhất riêng — xem "Automate ▸ Generate" bên dưới |
| Meta | `combineCommands` | Gộp nhiều Command thành 1 bước Undo duy nhất |

## Toolbar — "động từ thuần", phạm vi lấy từ selection

3 nhóm menu cấp cao nhất — `Edit`/`Format`/`Automate` — không chứa dropdown chọn cột/dòng bên trong — phạm vi tác động luôn lấy từ selection người dùng đã bôi trực tiếp trên bảng (`targetColumns` = cột đang bôi ở header, hoặc cột chứa ô đang chọn). Quyết định thiết kế này để tránh menu phình to với "Apply to column" + checkbox list (từng có, đã bỏ — xem lịch sử commit "Rework the Data Editor menus into pure actions").

Mỗi menu là 1 dropdown 2 cấp kiểu Google Sheets (`renderSubmenu` trong `DataEditorModal.tsx`): mục cấp 1 nào gom nhiều hành động cùng nhóm (vd `Format ▸ Change Case`, `Automate ▸ Deduplicate`, `Automate ▸ Generate`) thì hover mở flyout cấp 2 bên phải chứa các hành động cụ thể. Tên MỌI mục trong menu đều ở dạng động từ/câu hành động (`Add`, `Delete`, `Change Case`, `Deduplicate`, `Generate Number...` — không còn danh từ trần như `Deduplication`/`Text Capitalization` cũ). Không menu nào hiển thị lại tên cột/dòng đang chọn bằng text — màu highlight ngay trên bảng đã đủ. `Edit`/`Format` vẫn `disabled` nút nào không dùng được (chưa chọn cột/dòng); riêng `Automate` thì KHÔNG — xem lý do ở mục "Automate menu" ngay bên dưới.

`Edit ▸ Add` (Add Row.../Add Column...) và mỗi mục trong `Automate ▸ Generate` đều mở 1 **popup riêng** (center màn hình + dim nền, click ra ngoài/nút ✕ để đóng — KHÁC hẳn flyout cấp 2 thường bám theo vị trí hover) để nhập số lượng/tuỳ chọn rồi Confirm/Cancel hoặc Apply. Field bên trong popup luôn theo đúng 1 khuôn: nhãn cố định bên trái, control (input/select) bên phải cùng hàng (`renderPopupField(label, control)`), field ĐẦU TIÊN của mọi popup Generate luôn là **Name** (tên cột mới — mọi popup Generate đều tạo 1 cột hoàn toàn mới, không ghi đè cột có sẵn).

## Automate menu — preset xoá hàng loạt, luôn hỏi qua popup riêng trước khi chạy

`Edit`/`Format` giữ tinh thần generic (chạy đúng lệnh người dùng chọn trên đúng selection họ bôi, không tự suy luận gì thêm). `Automate` khác hẳn: mỗi mục trong `Automate ▸ Deduplicate` là 1 **preset tự động** tự quét toàn bảng theo 1 tiêu chí cố định (rỗng/trùng) rồi xoá hàng loạt. Cả 3 mục (Remove Empty Rows / Remove Empty Columns / Remove Duplicated Rows) đều **luôn available** — không có mục nào bị `disabled` theo số lượng tìm thấy hay theo cột đang chọn. Bấm vào là đếm ngay lúc đó rồi hiện `automatePopup` (state riêng trong `DataEditorModal.tsx`, KHÔNG dùng chung `toast`/status bar — status bar chỉ dành báo tình trạng dữ liệu theo Data Type, xem "Validate & Issues" bên dưới):

- **0 kết quả** → popup thông tin thuần, chỉ có nút ✕ để đóng (vd "Found 0 empty row."), không có Confirm/Cancel vì không có gì để làm.
- **≥ 1 kết quả** → popup "Found N ..." kèm 2 nút **Confirm**/**Cancel**, chỉ thật sự xoá khi bấm Confirm.

Riêng **Remove Duplicated Rows** khi chưa bôi cột nào trên bảng cũng đi qua đúng `automatePopup` này (popup thông tin thuần, yêu cầu bôi cột trước) thay vì bị khoá bằng `disabled` — nhất quán với "luôn available", không có mục nào trong menu bị mờ sẵn từ trước khi bấm.

`Automate ▸ Deduplicate`:

| Mục | Tiêu chí | Ghi chú |
|---|---|---|
| Remove Empty Rows | `findEmptyRowIds` — dòng rỗng cả 4 core field lẫn mọi cột `extra` | Label hiện kèm số lượng hiện tại nếu > 0 (`emptyRowCount`, tính lại bằng `useMemo` mỗi khi state đổi) |
| Remove Empty Columns | `findEmptyColumns` — cột `extra` rỗng ở mọi dòng | Tương tự, `emptyColumnCount` |
| Remove Duplicated Rows | `findDuplicateIdsToRemove` trên đúng các cột đang bôi ở header (`targetColumns`) — bôi > 1 cột thì phải trùng **TẤT CẢ** các cột đó cùng lúc mới tính là 1 nhóm trùng (compound key), giữ lại dòng có nhiều field điền nhất trong mỗi nhóm | `duplicateRowCount` = 0 khi chưa bôi cột nào (không tính được, không phải "không có trùng") |

Từng có preset "Quick Clean" (Trim + Normalize cố định trên 2 cột SQL `name`/`phone`) — đã BỎ HẲN vì hardcode literal `"name"`/`"phone"` thay vì resolve qua Data Type (`resolveColumnForType`), dễ vỡ khi luồng generic import (xem [column-mapping.md](./column-mapping.md)) để trống 2 cột này và dữ liệu Name/Phone thật nằm ở cột `extra` khác.

## Automate ▸ Generate — 3 mục, mỗi mục 1 popup, luôn tạo cột MỚI

`Automate ▸ Generate` (KHÔNG phải menu cấp cao nhất riêng — trước đây từng là, đã dời vào trong `Automate` cho gọn thanh toolbar) có 3 mục, mỗi mục mở 1 popup riêng (xem quy ước popup ở mục "Toolbar" phía trên):

| Mục | Field (theo đúng thứ tự trên popup) | Command |
|---|---|---|
| **Generate Number...** | Name → Type (Sequential with Plain Number / Sequential with Zero-padded Number) → Start → Prefix (tuỳ chọn) | `generateNumberCommand` |
| **Generate Display Phone...** | Name → Pattern (3 kiểu che số) | `displayPhoneCommand` |
| **Combine Columns...** | Name → Separator | `combineColumnsCommand`, nguồn ghép = cột đang bôi ở header (`targetColumns`) |

**Generate Number** GỘP 2 tính năng cũ ("Generate ID" và "Generate Running Number") làm 1 — cùng bản chất "đếm tuần tự từ `Start`, có thể đệm số 0, có thể có tiền tố":

- `Prefix` để TRỐNG → y hệt "Running Number" cũ (thuần số, `plain` không đệm hoặc `padded` đệm số 0 cho đủ chữ số theo giá trị lớn nhất sẽ xuất hiện = `Start + số dòng - 1`).
- `Prefix` có giá trị → y hệt "Generate ID" cũ (vd `Start=1`, Type = Zero-padded, Prefix = `"KH"` → `KH001, KH002...`). Độ rộng đệm chỉ tính phần SỐ, không tính Prefix.
- Chế độ **Random** của "Generate ID" cũ đã BỎ HẲN — cân nhắc lại thấy không gian ký tự-số cố định 6 ký tự (base36) khó tuỳ biến "độ dài mong muốn" mà không phải thêm hẳn 1 field riêng, không đáng so với lợi ích, và không có cách nào làm 2 biến thể Plain/Zero-padded của Random THẬT SỰ khác nhau nếu vẫn giữ dạng chữ+số cũ (đã luôn cố định 6 ký tự sẵn).

## Phím tắt (Undo/Redo/Save) — tự focus khi mở

`Ctrl/Cmd+Z` (Undo), `Ctrl/Cmd+Y` hoặc `Ctrl/Cmd+Shift+Z` (Redo), `Ctrl/Cmd+S` (Save), `Delete` (xoá dòng đang chọn) — xử lý trong `handleKeyDown()`, tự bỏ qua khi `editingCell` đang set (để trình duyệt xử lý undo/redo NGAY TRONG ô đang gõ, không đụng lịch sử của cả bảng).

`Modal.tsx` không tự focus nội dung khi mở, nên container bắt phím (`containerRef`, `tabIndex={0}`) phải tự `.focus()` ngay khi `open && !loading` (container chỉ THẬT SỰ mount lúc đó — trước đó vẫn đang hiện "Loading data..."). Thiếu bước này thì mở Data Editor lên bấm Ctrl+Z ngay không có phản ứng gì, phải click chuột vào bảng trước mới bắt đầu nhận phím tắt (bug đã gặp thật). Effect này chạy lại sau mỗi lần Save (`load()` khiến `loading` bật/tắt lại) — chủ đích, giữ phím tắt luôn sẵn sàng ngay sau khi tải/lưu xong.

## Validate & Issues

`validateState(state, columnTypes, targetColumns)` (`validate.ts`) chạy lại mỗi khi state HOẶC selection đổi, trả `CellIssue[]` hiển thị dạng chip ở status bar (bấm chip để lọc bảng theo đúng loại lỗi đó — `groupIssuesByMessage` gom theo đúng text `message`, đếm số dòng distinct, sort giảm dần theo count). Chip "All issues (N)" là tổng, không phải 1 message riêng. Tham số thứ 3 tên là `duplicateColumns` trong chữ ký hàm nhưng giá trị TRUYỀN VÀO chính là `targetColumns` (cột đang bôi trên bảng) — xem chip `Duplicated Rows` bên dưới.

Toàn bộ message hiện có (rút gọn cố ý, không kèm giải thích dài trong chip — chi tiết rule đầy đủ theo `ColumnType` xem [column-mapping.md](./column-mapping.md)):

| Chip | Data Type áp dụng | Sinh ra khi nào |
|---|---|---|
| `Missing Name` | Name | Cột đang đóng vai trò Name (`resolveColumnForType`) bị rỗng ở dòng đó — chỉ tính SAU KHI đã có cột nào được gán Data Type = Name |
| `Missing Phone` | Phone | Tương tự `Missing Name`, cho cột Phone |
| `Invalid Phone Format` | Phone | `isValidVietnamesePhone` fail — không bắt đầu bằng `0`, hoặc không đủ 10-11 chữ số |
| `Invalid Email Format` | Email | Không khớp regex email cơ bản (`user@domain.tld`) |
| `Invalid URL Format` | URL | `isValidUrl` fail |
| `Capitalization Inconsistent` | Name | Xem thuật toán bên dưới |
| `Duplicated Rows on N selected column(s)` (`DUPLICATE_ISSUE_PREFIX`) | Không gắn Data Type nào — LIVE theo cột đang bôi chọn (`targetColumns`), không phải config đã lưu | Xem mục "Chip trùng lặp LIVE theo selection" ngay bên dưới |

### Chip trùng lặp LIVE theo selection

Khác mọi chip khác trong bảng trên (chỉ phụ thuộc `state`), chip `Duplicated Rows` còn phụ thuộc **cột đang bôi chọn trên bảng NGAY LÚC ĐÓ** (`targetColumns`), KHÔNG phải 1 config đã lưu (`sessions.participant_duplicate_columns` — cột DB này vẫn còn trong schema nhưng không còn ai ghi/đọc nữa, xem [column-mapping.md](./column-mapping.md)):

- **Chưa bôi cột nào** → `targetColumns = []` → `findDuplicateIssues` trả `[]` ngay từ đầu → chip biến mất hoàn toàn khỏi status bar, không phải "chip hiện 0".
- **Đã bôi ≥ 1 cột** → chip hiện đúng bằng số dòng `findDuplicateIdsToRemove` (`commands.ts`) trả về trên chính bộ cột đó — hàm DÙNG CHUNG với preset `Automate ▸ Deduplicate ▸ Remove Duplicated Rows`, nên 2 con số LUÔN khớp nhau tuyệt đối, không có 2 công thức đếm khác nhau. Số này chỉ tính dòng THỪA sẽ bị xoá (dòng "giữ lại" — hoàn chỉnh nhất trong mỗi nhóm trùng — không bị tính là issue).
- Đổi selection (bôi cột khác, hoặc bỏ chọn) → chip tự cập nhật ngay lập tức theo `useMemo`, không cần chạy lại bất kỳ hành động nào.

Thiết kế trước dùng `sessions.participant_duplicate_columns` (lưu riêng, độc lập selection) — đã bỏ vì gây bug: đổi/bỏ selection trên bảng không tự cập nhật con số đã lưu, và chỉ cần MỞ preset dedup ra xem (dù sau đó bấm Cancel) cũng âm thầm ghi đè config, để lại chip sai không cách nào tự hết ngoài việc chạy lại preset với 1 bộ cột khác.

**Thuật toán `Capitalization Inconsistent`** (dòng ~172-186 `validate.ts`) — dựa trên **số đông trong chính cột đó**, không ép theo 1 chuẩn cố định nào:

1. Mỗi ô được phân vào 1 trong 4 "kiểu viết hoa" (`caseShapeOf`): `upper` (VD `NGUYỄN VĂN A`), `lower` (`nguyễn văn a`), `title` (đúng chuẩn Title Case, `Nguyễn Văn A`), hoặc `other` (không khớp 3 kiểu trên, VD `Đỗ thi lưu`). Ô rỗng/không có chữ cái thì bỏ qua.
2. Đếm số ô theo từng kiểu trong toàn cột, kiểu có số lượng nhiều nhất là `majorityShape`.
3. Dòng nào có kiểu khác `majorityShape` thì bị gắn `Capitalization Inconsistent`.

Hệ quả: cột toàn bộ cùng 1 kiểu (kể cả toàn chữ HOA) sẽ KHÔNG có issue nào — validate không có khái niệm "đúng chuẩn", chỉ báo dòng nào LỆCH so với phần còn lại của chính cột đó. Vì vậy kết quả phụ thuộc dữ liệu hiện có, sửa/xoá dòng có thể đổi luôn `majorityShape` và đổi luôn tập hợp dòng bị flag ở lần validate kế tiếp.

**Ngoại lệ của Command Pattern**: đổi "Data type" 1 cột (`updateColumnType`) KHÔNG phải 1 `Command` — ghi thẳng vào `sessions.participant_column_types` qua IPC ngay khi chọn, không qua `history.run()`. Có chủ đích: đây là **metadata của session** (thuộc tính của cột, giống `participant_column_labels`), không phải dữ liệu của 1 dòng cụ thể — không cần/không nên chung 1 dòng lịch sử Undo với việc sửa ô dữ liệu. (`participant_duplicate_columns` từng cùng nhóm với 2 field này nhưng đã bỏ khỏi luồng app — xem "Chip trùng lặp LIVE theo selection" ở trên.)

## Autosave + Save

- Autosave sau `AUTOSAVE_DELAY_MS = 20000` (20s) kể từ lần sửa cuối, nếu `history.dirty`.
- `handleSave()`: so từng dòng với `originalRows` (snapshot lúc load) — dòng nào thật sự đổi mới gọi `participants:update`; dòng mới (`__isNew`) gọi `participants:create`; dòng bị xoá khỏi state → `participants:bulkDelete`. Cuối cùng `participants:reorder` để ghi lại `sort_order` hiện tại (kể cả khi không kéo-thả gì, để không bị lệch thứ tự sau khi reload).
- Đóng modal khi đang dirty → `confirm()` hỏi có muốn bỏ thay đổi chưa lưu không.

## Cột lõi vs cột phụ trong UI

- Cột lõi (`name`/`phone`/`code`/`email`) **chỉ hiện khi đang có dữ liệu thật** (`isCoreFieldActive`, xem [column-mapping.md](./column-mapping.md)) — không còn hiện sẵn 4 cột trống mặc định như thiết kế cũ. Cột nào đang được coi là "Name"/"Phone" (đánh dấu `*` ở header) được tính bằng `resolveColumnForType`, KHÔNG cố định là literal cột `name`/`phone`. "Xoá cột" trên core field chỉ clear giá trị (không drop được cột), và vì hiển thị giờ phụ thuộc dữ liệu, clear hết giá trị sẽ tự ẩn cột đó ngay sau đó — không cần state "đã xoá" riêng để theo dõi.
- Cột phụ (bao gồm mọi cột vừa import — xem [import.md](./import.md)) tự do thêm/xoá/đổi tên/kéo-thả thứ tự. Gán ý nghĩa cho 1 cột phụ (Name/Phone/...) chỉ qua dropdown "Data type" — không có thao tác "chuyển thành core field" nào nữa (xem [column-mapping.md](./column-mapping.md)).
- Bàn hoàn toàn trống (chưa import, chưa có dòng nào) → "+ Add first row" tự tạo kèm 2 cột gợi ý "Name"/"Phone" (cột phụ bình thường, không đặc biệt) để không rơi vào bảng trắng không gõ được gì.

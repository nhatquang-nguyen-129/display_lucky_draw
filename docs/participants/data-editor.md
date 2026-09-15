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
| Format/Clean | `batchTransformCommand` (khung dùng chung) | Transform cụ thể (upper/lower/title case, trim) nằm ở `transforms.ts` |
| Data | `findEmptyRowIds`, `findEmptyColumns`, `removeEmptyColumnsCommand`, `findDuplicateGroups`/`findDuplicateIdsToRemove` | Preset xoá/normalize hàng loạt — xem mục "Data menu" bên dưới |
| Data ▸ Normalize | `normalizePhoneResult`, `normalizeNameResult` (`transforms.ts`) + `applyChangesCommand` (`commands.ts`) | Trả `null` cho ô "không tự tin xử lý được" thay vì áp sai — xem "Data ▸ Normalize" bên dưới |
| Data ▸ Generate | `generateNumberCommand`, `displayPhoneCommand`, `combineColumnsCommand` | Dùng chung helper `setColumnValuesCommand`; `Generate` là 1 submenu NẰM TRONG `Data`, không còn là menu cấp cao nhất riêng — xem "Data ▸ Generate" bên dưới |
| Meta | `combineCommands`, `applyChangesCommand` | `combineCommands` gộp nhiều Command thành 1 bước Undo; `applyChangesCommand` áp thẳng 1 danh sách before/after ĐÃ TÍNH SẴN (không tự tính lại transform) — dùng khi popup preview để người dùng tick chọn dòng trước khi Confirm (Normalize) |

## Toolbar — "động từ thuần", phạm vi lấy từ selection

3 nhóm menu cấp cao nhất — `Edit`/`Format`/`Data` (đổi tên từ `Automate` — vẫn cùng 1 menu, chỉ đổi nhãn hiển thị cho gọn) — không chứa dropdown chọn cột/dòng bên trong — phạm vi tác động luôn lấy từ selection người dùng đã bôi trực tiếp trên bảng (`targetColumns` = cột đang bôi ở header, hoặc cột chứa ô đang chọn). Quyết định thiết kế này để tránh menu phình to với "Apply to column" + checkbox list (từng có, đã bỏ — xem lịch sử commit "Rework the Data Editor menus into pure actions").

Mỗi menu là 1 dropdown 2 cấp kiểu Google Sheets (`renderSubmenu` trong `DataEditorModal.tsx`): mục cấp 1 nào gom nhiều hành động cùng nhóm (vd `Format ▸ Change Case`, `Data ▸ Deduplicate`, `Data ▸ Generate`, `Data ▸ Normalize`) thì hover mở flyout cấp 2 bên phải chứa các hành động cụ thể. Tên MỌI mục trong menu đều ở dạng động từ/câu hành động (`Add`, `Delete`, `Change Case`, `Deduplicate`, `Generate Number...` — không còn danh từ trần như `Deduplication`/`Text Capitalization` cũ). Không menu nào hiển thị lại tên cột/dòng đang chọn bằng text — màu highlight ngay trên bảng đã đủ. `Edit`/`Format` vẫn `disabled` nút nào không dùng được (chưa chọn cột/dòng); riêng `Data` thì KHÔNG — xem lý do ở mục "Data menu" ngay bên dưới.

`Edit ▸ Add` (Add Row.../Add Column...) và mỗi mục trong `Data ▸ Generate` đều mở 1 **popup nhỏ** (center màn hình + dim nền, click ra ngoài/nút ✕ để đóng — KHÁC hẳn flyout cấp 2 thường bám theo vị trí hover) để nhập số lượng/tuỳ chọn rồi Confirm/Cancel hoặc Apply. Field bên trong popup luôn theo đúng 1 khuôn: nhãn cố định bên trái, control (input/select) bên phải cùng hàng (`renderPopupField(label, control)`), field ĐẦU TIÊN của mọi popup Generate luôn là **Name** (tên cột mới — mọi popup Generate đều tạo 1 cột hoàn toàn mới, không ghi đè cột có sẵn). Control (`popupRowInput`) có `truncate` — option/giá trị dài hơn bề rộng popup (`max-w-xs`) bị cắt kèm `…` thay vì tràn vỡ layout.

`Data ▸ Deduplicate ▸ Remove Duplicated Rows` và cả 2 mục trong `Data ▸ Normalize` lại mở 1 **popup preview lớn** khác hẳn (`max-w-2xl`/`max-w-3xl`, có bảng cuộn dọc bên trong) — xem 2 mục riêng bên dưới, đừng nhầm với popup nhỏ ở trên.

## Data menu — preset xoá/normalize hàng loạt, luôn cho xem trước trong popup riêng trước khi chạy

`Edit`/`Format` giữ tinh thần generic (chạy đúng lệnh người dùng chọn trên đúng selection họ bôi, không tự suy luận gì thêm). `Data` khác hẳn: mỗi mục là 1 **preset tự động** tự quét toàn bảng theo 1 tiêu chí cố định (rỗng/trùng/định dạng) rồi xử lý hàng loạt. Mọi mục đều **luôn available** — không có mục nào bị `disabled` theo số lượng tìm thấy hay theo cột đang chọn. Bấm vào là tính ngay lúc đó rồi hiện popup xem trước (KHÔNG dùng chung `toast`/status bar — status bar chỉ dành báo tình trạng dữ liệu theo Data Type, xem "Validate & Issues" bên dưới); 2 loại popup:

- **Popup nhỏ** (`automatePopup`, dùng cho Remove Empty Rows/Columns) — 0 kết quả → chỉ có nút ✕ để đóng (vd "Found 0 empty row."); ≥ 1 kết quả → "Found N ..." kèm 2 nút **Confirm**/**Cancel**, chỉ thật sự xoá khi bấm Confirm.
- **Popup preview lớn** (`dedupPreview`/`normalizePreview`, dùng cho Remove Duplicated Rows và Normalize) — hiện DANH SÁCH đầy đủ để người dùng tự cuộn xem/chọn trước khi Confirm, xem 2 mục ngay bên dưới.

`Data ▸ Deduplicate`, chưa bôi cột nào trên bảng thì cả `Remove Empty Rows`/`Remove Empty Columns`/`Remove Duplicated Rows` đều đi qua đúng popup nhỏ ở trên (nếu cần, vd "Select at least 1 column header first...") thay vì bị khoá bằng `disabled` — nhất quán với "luôn available", không có mục nào trong menu bị mờ sẵn từ trước khi bấm.

| Mục | Tiêu chí | Ghi chú |
|---|---|---|
| Remove Empty Rows | `findEmptyRowIds` — dòng rỗng cả 4 core field lẫn mọi cột `extra` | Label hiện kèm số lượng hiện tại nếu > 0 (`emptyRowCount`, tính lại bằng `useMemo` mỗi khi state đổi) |
| Remove Empty Columns | `findEmptyColumns` — cột `extra` rỗng ở mọi dòng | Tương tự, `emptyColumnCount` |
| Remove Duplicated Rows | `findDuplicateGroups` trên đúng các cột đang bôi ở header (`duplicateColumns`) — bôi > 1 cột thì phải trùng **TẤT CẢ** các cột đó cùng lúc mới tính là 1 nhóm trùng (compound key) | Xem "Remove Duplicated Rows — popup chọn dòng giữ lại" bên dưới. `duplicateRowCount` (status bar) vẫn dùng `findDuplicateIdsToRemove` = 0 khi chưa bôi cột nào |

Từng có preset "Quick Clean" (Trim + Normalize cố định trên 2 cột SQL `name`/`phone`) — đã BỎ HẲN vì hardcode literal `"name"`/`"phone"` thay vì resolve qua Data Type (`resolveColumnForType`), dễ vỡ khi luồng generic import (xem [column-mapping.md](./column-mapping.md)) để trống 2 cột này và dữ liệu Name/Phone thật nằm ở cột `extra` khác. `Data ▸ Normalize` (Phone/Name, xem bên dưới) là bản thay thế ĐÚNG kiểu resolve theo Data Type.

### Remove Duplicated Rows — popup chọn dòng giữ lại

Khác thiết kế cũ (tự động giữ dòng "đầy đủ thông tin nhất", xoá thẳng phần còn lại sau khi bấm Confirm trên popup đếm số lượng), giờ đây bấm mục này mở popup preview lớn (`dedupPreview`) liệt kê TỪNG NHÓM trùng, mỗi dòng trong nhóm có 1 **radio button** (chỉ chọn được đúng 1 dòng/nhóm) kèm tóm tắt mọi cột đang có dữ liệu của dòng đó (`summarizeDedupRow`, theo đúng thứ tự cột trên bảng — `columnOrder`) để phân biệt. Mặc định tick sẵn dòng "đầy đủ thông tin nhất" (`defaultKeepId`, tính bởi `findDuplicateGroups`, cùng thuật toán cũ) nhưng người dùng có thể tự đổi sang dòng khác trong nhóm trước khi Confirm. Bấm Confirm mới `deleteRowsCommand` các dòng KHÔNG được chọn trong mỗi nhóm.

## Data ▸ Normalize — popup preview + tick chọn dòng, báo "Unable to resolve" khi không tự tin xử lý

2 mục **Normalize Phone**/**Normalize Name** LUÔN áp vào đúng cột đã được gán Data Type tương ứng (`phoneCol`/`nameCol`, xem `resolveColumnForType` — [column-mapping.md](./column-mapping.md)), KHÔNG phải cột đang bôi tuỳ ý (`targetColumns`) như `Format`. Bấm vào (`openNormalizePreview`) tính trước toàn bộ before/after rồi mở popup preview lớn (`normalizePreview`, `max-w-2xl`) — KHÔNG áp dụng ngay:

- Bảng 2 cột **Current value**/**Proposed value**, mỗi dòng có **checkbox** bên trái (mặc định tick sẵn cho dòng resolve được, kèm checkbox "chọn tất cả" ở header) — Confirm chỉ áp cho dòng đang tick, dùng `applyChangesCommand` (áp thẳng danh sách before/after đã tính sẵn trong popup, KHÔNG tính lại transform).
- Ô nào transform trả về `null` (`normalizePhoneResult`/`normalizeNameResult`, `transforms.ts`) được đánh dấu `unresolved: true` — hiện **"Unable to resolve"** (chữ nghiêng, mờ) ở cột Proposed value, checkbox bị disable, và LUÔN bị loại khỏi phần áp dụng dù trạng thái tick là gì.
  - `normalizePhoneResult`: trả `null` khi ô chứa ≥ 2 số điện thoại dính nhau qua dấu phân cách (`/ , ; |`), mỗi phần đều đủ dài (≥ 7 chữ số) để tự nó là 1 số — ép về 1 chuỗi số dài sẽ ra kết quả sai.
  - `normalizeNameResult`: trả `null` khi ô chứa dấu câu bất thường với 1 cái tên (`( ) [ ] { } < > , . : ; " ' \` ~ @ # $ % ^ & * _ + = | \ /` — vd ô bị dán kèm link/ghi chú), vì Title Case sẽ cho ra kết quả vô nghĩa lên cả phần không phải tên.
- 0 dòng cần đổi (kể cả unresolved) → popup nhỏ thông tin thuần "Found 0 row(s) needing ...", không mở popup preview lớn.

## Data ▸ Generate — 3 mục, mỗi mục 1 popup nhỏ, luôn tạo cột MỚI

`Data ▸ Generate` (KHÔNG phải menu cấp cao nhất riêng — trước đây từng là, đã dời vào trong `Data` cho gọn thanh toolbar) có 3 mục, mỗi mục mở 1 popup nhỏ (xem quy ước popup ở mục "Toolbar" phía trên):

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

`Modal` mở KHÔNG có tiêu đề (`title=""` — `Modal.tsx` bỏ hẳn `<h2>` khi `title` rỗng, chỉ còn nút ✕) để đỡ tốn 1 dòng cho 1 cái tên đã hiển nhiên (đang mở từ nút "Data Editor"). Góc phải toolbar: dòng chữ nhỏ **"Last saved at HH:MM:SS"** (`lastSavedAt`, set lại sau MỌI lần save thành công — kể cả auto-save âm thầm) đứng cạnh **History (N)** rồi tới nút **Save** (chỉ còn chữ "Save", bỏ hint phím tắt "(Ctrl+S)" cho gọn — phím tắt vẫn hoạt động bình thường) — không còn chip trạng thái "Saved"/"Unsaved" riêng như thiết kế cũ.

## Dropdown filter/sort cột — `fixed` theo toạ độ thật, KHÔNG `absolute` lồng trong `<th>`

Dropdown "Sort A→Z/Z→A / Search in column / Data type" mở từ nút `▾` trên mỗi header cột (`openColumnMenu`) render ở **top-level** của component (`fixed`, đặt cạnh khối `contextMenu`), định vị bằng toạ độ thật của nút bấm (`getBoundingClientRect()`, lưu vào state `{ col, left, top }`) — **KHÔNG** render `absolute` ngay bên trong `<th>` như bản đầu.

Lý do: `<thead>` của bảng này là `position: sticky` (để đứng yên khi cuộn dọc), và `<tbody>` cuộn NGAY BÊN DƯỚI trong CÙNG 1 vùng scroll (`overflow-auto`). Chromium có bug lâu năm: nội dung tràn ra khỏi 1 phần tử `position: sticky` (ở đây là dropdown, tràn xuống dưới hàng header) bị vẽ/clip sai lớp so với nội dung khác đang cuộn trong cùng container đó — dù z-index và background đều đúng, dữ liệu dòng `tbody` bên dưới vẫn "lộ" xuyên qua dropdown (dễ thấy nhất ngay sau 1 thao tác đổi hàng loạt như Normalize, buộc trình duyệt vẽ lại nhiều). Menu chuột phải (`contextMenu`) không dính lỗi này vì nó vốn đã `fixed` ở ngoài vùng scroll ngay từ đầu — nên khi thêm dropdown mới tương tự trong tương lai, LUÔN theo pattern `fixed` + toạ độ thật này, đừng đặt `absolute` lồng trong `<th>`/`<td>` của bảng đang cuộn.

## Validate & Issues

`validateState(state, columnTypes, duplicateColumns)` (`validate.ts`) chạy lại mỗi khi state HOẶC selection đổi, trả `CellIssue[]` hiển thị dạng chip ở status bar (bấm chip để lọc bảng theo đúng loại lỗi đó — `groupIssuesByMessage` gom theo đúng text `message`, đếm số dòng distinct, sort giảm dần theo count). Chip "All issues (N)" là tổng, không phải 1 message riêng. Tham số thứ 3 TRUYỀN VÀO là biến `duplicateColumns` trong `DataEditorModal.tsx` — CHỈ tính từ cột đang bôi Ở HEADER (`selectedColKeys`), KHÔNG dùng chung `targetColumns` (biến dùng cho Format/Clean, có fallback về cột chứa ô con trỏ đang chọn) — xem chip `Duplicated Rows` bên dưới.

Toàn bộ message hiện có (rút gọn cố ý, không kèm giải thích dài trong chip — chi tiết rule đầy đủ theo `ColumnType` xem [column-mapping.md](./column-mapping.md)):

| Chip | Data Type áp dụng | Sinh ra khi nào |
|---|---|---|
| `Missing Name` | Name | Cột đang đóng vai trò Name (`resolveColumnForType`) bị rỗng ở dòng đó — chỉ tính SAU KHI đã có cột nào được gán Data Type = Name |
| `Missing Phone` | Phone | Tương tự `Missing Name`, cho cột Phone |
| `Invalid Phone Format` | Phone | `isValidVietnamesePhone` fail — không bắt đầu bằng `0`, hoặc không đủ 10-11 chữ số |
| `Invalid Email Format` | Email | Không khớp regex email cơ bản (`user@domain.tld`) |
| `Invalid URL Format` | URL | `isValidUrl` fail |
| `Name Contains Number` | Name | Giá trị khớp `/\d/` (có ít nhất 1 chữ số) — bắt được cả trường hợp gán NHẦM 1 cột không phải Name (SĐT, mã số...) làm Data Type = Name, thứ mà `Capitalization Inconsistent` không phát hiện được (chuỗi toàn số không có chữ cái nào để so kiểu viết hoa) |
| `Capitalization Inconsistent` | Name | Xem thuật toán bên dưới |
| `Duplicated Rows on N selected column(s)` (`DUPLICATE_ISSUE_PREFIX`) | Không gắn Data Type nào — LIVE theo cột đang bôi Ở HEADER (`duplicateColumns`), không phải config đã lưu | Xem mục "Chip trùng lặp LIVE theo selection" ngay bên dưới |

### Chip trùng lặp LIVE theo selection

Khác mọi chip khác trong bảng trên (chỉ phụ thuộc `state`), chip `Duplicated Rows` còn phụ thuộc **cột đang bôi Ở HEADER NGAY LÚC ĐÓ** (`duplicateColumns`), KHÔNG phải 1 config đã lưu (`sessions.participant_duplicate_columns` — cột DB này vẫn còn trong schema nhưng không còn ai ghi/đọc nữa, xem [column-mapping.md](./column-mapping.md)). **Cố ý KHÔNG dùng chung `targetColumns`** (biến dùng cho mọi action Format/Data khác, fallback về cột chứa ô con trỏ đang chọn khi chưa bôi header nào) — click 1 ô bất kỳ để sửa/xem dữ liệu là thao tác xảy ra liên tục, không phải ý định "kiểm tra trùng lặp trên cột này"; dùng chung sẽ khiến chip tự bật ngầm chỉ vì vừa click sửa 1 ô (bug đã gặp thật).

- **Chưa bôi cột nào Ở HEADER** → `duplicateColumns = []` → `findDuplicateIssues` trả `[]` ngay từ đầu → chip biến mất hoàn toàn khỏi status bar, không phải "chip hiện 0" — kể cả khi đang có 1 ô đơn lẻ được chọn (con trỏ) ở bất kỳ đâu trên bảng.
- **Đã bôi ≥ 1 cột** → chip hiện đúng bằng số dòng `findDuplicateIdsToRemove` (`commands.ts`, wrapper mỏng của `findDuplicateGroups` — luôn tính theo `defaultKeepId` của mỗi nhóm) trên chính bộ cột đó — DÙNG CHUNG nền tảng với preset `Data ▸ Deduplicate ▸ Remove Duplicated Rows`, nên 2 con số này khớp nhau **nếu** người dùng không tự đổi dòng giữ lại trên popup preview (xem "Remove Duplicated Rows — popup chọn dòng giữ lại"). Số này chỉ tính dòng THỪA sẽ bị xoá theo mặc định (dòng "giữ lại" — hoàn chỉnh nhất trong mỗi nhóm trùng — không bị tính là issue).
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

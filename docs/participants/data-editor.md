# Data Editor

**Ý tưởng sản phẩm**: 1 trình soạn thảo bảng tính rút gọn (Excel/Google Sheets thu nhỏ) ngay trong app,
để người tổ chức dọn dữ liệu participant trước khi quay mà không phải rời app — sửa ô, thêm/xoá
hàng-cột, tìm trùng, chuẩn hoá, sinh mã, **Undo/Redo cho MỌI thao tác kể cả hàng loạt**.

Code: `src/components/DataEditorModal.tsx` (component chính, rất lớn) + `src/lib/dataEditor/` (logic
thuần, không JSX: `types.ts`, `commands.ts`, `validate.ts`, `transforms.ts`, `history.ts`).

## 1. Cửa sổ

- Mở qua nút **Edit** ở trang Participants (`window.api.dataEditor.open(sessionId)`) → 1 **cửa sổ
  Electron riêng** (`src/pages/DataEditorWindow.tsx`, route `/data-editor/:sessionId`), cùng kiểu Landing
  Builder/Present Mode ([`docs/architecture/ipc-and-windows.md`](../architecture/ipc-and-windows.md)).
- Route này không có `SessionProvider` → `DataEditorWindow` tự fetch `sessions:get` và truyền `session` +
  `onSessionRefresh` xuống `DataEditorModal` qua props.
- Tiêu đề "Data Editor" nằm ở tiêu đề cửa sổ thật (`getWindowTitle("Editor", …)`); đóng bằng nút X của
  cửa sổ. Còn thay đổi chưa lưu → renderer báo `editor.reportDirty(true)`, **main process chặn đóng** và
  hỏi.
- Trang Participants ở cửa sổ chính poll `participants:list` mỗi 2s để thấy thay đổi đã lưu từ Editor.
- Góc phải toolbar: "Last saved at HH:MM:SS" (cập nhật sau mọi lần lưu, kể cả autosave) — **History (N)**
  — **Save**.

## 2. Mô hình dữ liệu (`types.ts`)

```ts
const CORE_FIELDS = ["name", "phone", "code", "email"] as const;

interface EditorRow {
  id: string;
  name: string; phone: string; code: string; email: string; // 4 cột lõi — property riêng
  status: string; created_at: string;
  extra: Record<string, string>;  // mọi cột khác
  __isNew?: boolean;              // dòng vừa thêm, chưa có trong DB tới khi Save
}
interface EditorState { columns: string[] /* chỉ cột phụ */; rows: EditorRow[] }
```

`getCell(row, col)` / `withCell(row, col, value)` tự route đọc/ghi vào property lõi hay `row.extra[col]` —
phần lớn code (command, validate, render) không cần biết cột là lõi hay phụ.

**Cột lõi vs cột phụ trong UI**:
- Cột lõi chỉ hiện khi đang có dữ liệu thật (`isCoreFieldActive`, xem
  [column-mapping.md](./column-mapping.md)). "Xoá" cột lõi = xoá hết giá trị (có hỏi xác nhận), xoá xong
  cột tự ẩn.
- Cột phụ (mọi cột import) thêm/xoá/đổi tên/kéo-thả thứ tự tự do. Cột đang đóng vai Name/Phone (theo
  Data Type) đánh dấu `*` ở header.
- **Không cho 2 cột phụ trùng tên**: đổi tên (double-click header) trùng cột đang có → không đổi, hiện
  toast `Column "…" already exists — choose a different name.` (trùng key trong `row.extra` sẽ ghi đè dữ
  liệu lẫn nhau). Đổi NHÃN cột lõi thì không chặn (chỉ là hiển thị). Add/Insert Column tự sinh tên không
  trùng (`nextColumnNames`: "Column 1", "Column 2"…).
- Bảng hoàn toàn trống → nút **"+ Add first row"** thêm 1 dòng kèm 1 cột trống "Column 1" (không gợi ý
  "Name"/"Phone" — đó là ý nghĩa, để người dùng tự gán qua Data Type).

## 3. Command Pattern — trục xương sống

Mọi thao tác sửa dữ liệu là 1 object thuần:

```ts
interface Command {
  label: string;                                  // hiện trong panel History
  execute: (state: EditorState) => EditorState;   // pure, không side-effect
  undo: (state: EditorState) => EditorState;
}
```

`useCommandHistory` (`history.ts`) giữ `pastRef`/`futureRef` (mảng `Command[]`, không phải React state)
→ `jumpTo(n)` (bấm 1 mốc trong panel History để rollback thẳng tới đó) chỉ là 1 vòng undo/execute trên
biến cục bộ.

**Thêm thao tác mới** → viết `xxxCommand(state, …) => Command` trong `commands.ts`, gọi qua
`history.run(…)`. Không sửa trực tiếp `history.state` — phá Undo/Redo.

| Nhóm | Command |
|---|---|
| Edit | `editCellCommand`, `insertRowCommand`/`insertRowsCommand`, `deleteRowsCommand`, `addColumnCommand`/`insertColumnsCommand`, `removeColumnCommand`, `renameColumnCommand`, `pasteBlockCommand`, `reorderRowsCommand` |
| Format | `batchTransformCommand` + transform ở `transforms.ts` (upper/lower/title case, trim, find & replace) |
| Data | `findEmptyRowIds`, `findEmptyColumns`, `removeEmptyColumnsCommand`, `findDuplicateGroups`/`findDuplicateIdsToRemove`, `normalizePhoneResult`/`normalizeNameResult` |
| Generate | `generateNumberCommand`, `displayPhoneCommand` (chung helper `setColumnValuesCommand`) |
| Meta | `combineCommands` (gộp nhiều command thành 1 bước Undo), `applyChangesCommand` (áp thẳng danh sách before/after đã tính sẵn trong popup preview) |

**Ngoại lệ**: đổi Data Type / nhãn cột KHÔNG phải Command — ghi thẳng DB qua IPC (metadata của session,
không chung lịch sử Undo với dữ liệu dòng). Xem [column-mapping.md](./column-mapping.md).

## 4. Toolbar — động từ thuần, phạm vi lấy từ selection

3 menu **Edit / Format / Data**, dropdown 2 cấp kiểu Google Sheets (`renderSubmenu`). Menu KHÔNG có
dropdown chọn cột/dòng bên trong — phạm vi luôn là selection trên bảng: `targetColumns` = cột đang bôi ở
header, hoặc cột chứa ô đang chọn. Mọi mục đặt tên dạng động từ (`Add`, `Delete`, `Change Case`,
`Deduplicate`, `Generate Number…`).

| Menu | Mục chính |
|---|---|
| **Edit** | Add ▸ Add Row… / Add Column… (popup nhỏ nhập số lượng); Delete ▸ Delete Rows / Delete Columns; Find & replace… (trên cột đang chọn) |
| **Format** | Change Case ▸ UPPER CASE / lower case / Title Case; Trim whitespace |
| **Data** | Deduplicate ▸ Remove Empty Rows / Remove Empty Columns / Remove Duplicated Rows; Generate ▸ Generate Number… / Generate Display Phone…; Normalize ▸ Normalize Phone / Normalize Name |

Insert dòng/cột (trên/dưới, trái/phải) nằm ở **menu chuột phải** trên bảng. Edit/Format `disabled` mục
chưa có selection phù hợp.

**2 loại popup**:
- **Popup nhỏ** (giữa màn hình, nền tối, ✕ hoặc click ra ngoài để đóng): Add Row/Column, 2 mục Generate,
  kết quả Remove Empty. Field theo 1 khuôn: nhãn trái, control phải (`renderPopupField`); giá trị dài bị
  cắt `…`.
- **Popup preview lớn** (có bảng cuộn): Remove Duplicated Rows, Normalize — xem trước và chọn dòng trước
  khi Confirm.

## 5. Data menu — preset tự quét, luôn xem trước khi chạy

Khác Edit/Format (chạy đúng lệnh trên đúng selection), mỗi mục Data là **preset tự quét toàn bảng**
theo 1 tiêu chí cố định rồi xử lý hàng loạt. Deduplicate/Generate **luôn bấm được** — bấm là tính ngay và
hiện popup (0 kết quả / chưa bôi cột → popup nhỏ báo lý do). Riêng Normalize Phone/Name bị `disabled`
(tooltip "Set a column's Data Type to … first.") khi chưa có cột nào gán Data Type tương ứng.

| Mục | Tiêu chí | Xử lý |
|---|---|---|
| Remove Empty Rows | `findEmptyRowIds` — rỗng ở mọi cột lõi lẫn phụ | "Found N …" + Confirm/Cancel. Nhãn kèm số lượng hiện tại nếu > 0 |
| Remove Empty Columns | `findEmptyColumns` — cột phụ rỗng ở mọi dòng | Như trên |
| Remove Duplicated Rows | `findDuplicateGroups` trên các cột đang bôi ở header — bôi nhiều cột = phải trùng TẤT CẢ (compound key) | Popup chọn dòng giữ lại (bên dưới) |
| Normalize Phone / Name | Cột đang gán Data Type Phone/Name (`resolveColumnForType`), KHÔNG phải cột đang bôi | Popup before/after (bên dưới) |

**Remove Duplicated Rows — chọn dòng giữ lại**: popup liệt kê từng nhóm trùng thành 1 bảng chung (mỗi
cột dữ liệu 1 cột bảng, giá trị dài bị cắt + tooltip đầy đủ; ô dạng URL gạch chân, **Ctrl/Cmd+Click** mở
bằng trình duyệt ngoài qua `shell:openExternal` — cơ chế này có cả ở bảng chính). Mỗi dòng có 1 radio
(đúng 1 dòng/nhóm); mặc định chọn dòng "đầy đủ thông tin nhất" (`defaultKeepId`). Confirm → xoá các dòng
KHÔNG được chọn.

**Normalize — tick chọn dòng**: bảng **Current value / Proposed value**, checkbox mỗi dòng (mặc định tick
dòng resolve được + checkbox chọn tất cả). Confirm áp đúng dòng đang tick bằng `applyChangesCommand`. Ô
transform trả `null` hiện **"Unable to resolve"**, checkbox bị khoá, luôn bị loại:
- `normalizePhoneResult`: ô chứa ≥ 2 số điện thoại dính nhau qua `/ , ; |` (mỗi phần ≥ 7 chữ số) — ép
  thành 1 chuỗi số sẽ sai.
- `normalizeNameResult`: ô có dấu câu bất thường với 1 cái tên (ngoặc, `, . : ; @ # / …` — vd dán kèm
  link/ghi chú) — Title Case sẽ ra kết quả vô nghĩa.

0 dòng cần đổi → popup nhỏ "Found 0 row(s) needing …".

Đã bỏ: preset **Quick Clean** (trim + normalize cố định trên literal cột SQL `name`/`phone` — sai với
import generic, thay bằng Normalize theo Data Type).

### Generate — luôn tạo cột MỚI

Field đầu tiên của mọi popup Generate là **Name** (tên cột mới), không ghi đè cột có sẵn.

| Mục | Field | Ghi chú |
|---|---|---|
| **Generate Number…** | Name → Type (Plain / Zero-padded) → Start → Prefix (tuỳ chọn) | Đếm tuần tự từ Start. Prefix trống = "Running Number" cũ; có Prefix = "Generate ID" cũ (vd `KH001`). Độ rộng đệm chỉ tính phần số. Chế độ Random cũ đã bỏ |
| **Generate Display Phone…** | Name → Source → Pattern (3 kiểu che số) | Source = mọi cột Data Type Phone, luôn hiện kể cả chỉ có 1 lựa chọn; chưa có → disabled "Set a column's Data Type to Phone first.". Đọc qua `getCell(row, sourceCol)`, không đọc cứng `row.phone` |

## 6. Validate & Issues

`validateState(state, columnTypes, duplicateColumns)` chạy lại mỗi khi dữ liệu hoặc selection đổi, trả
`CellIssue[]` hiện thành chip ở status bar. Bấm chip để lọc bảng theo đúng loại lỗi đó (gom theo
`message`, đếm dòng distinct, sắp giảm dần); chip "All issues (N)" là tổng.

| Chip | Data Type | Khi nào |
|---|---|---|
| `Missing Name` / `Missing Phone` | Name / Phone | Ô rỗng ở cột đang đóng vai trò đó — chỉ sau khi đã gán Data Type |
| `Invalid Phone Format` | Phone | Không bắt đầu bằng 0 hoặc không đủ 10–11 chữ số |
| `Invalid Email Format` | Email | Không khớp `user@domain.tld` |
| `Invalid URL Format` | URL | `isValidUrl` fail |
| `Name Contains Number` | Name | Có chữ số — bắt cả trường hợp gán NHẦM cột SĐT/mã làm Name |
| `Capitalization Inconsistent` | Name | Lệch kiểu viết hoa so với số đông của cột (bên dưới) |
| `Duplicated Rows on N selected column(s)` | — | Theo cột đang bôi ở header (bên dưới) |

**Capitalization Inconsistent** — theo **số đông trong chính cột**, không ép chuẩn cố định: mỗi ô phân
vào `upper` / `lower` / `title` / `other` (`caseShapeOf`, bỏ ô không có chữ), kiểu nhiều nhất là chuẩn,
ô khác kiểu bị flag. Cột toàn chữ HOA → không có lỗi. Sửa dữ liệu có thể đổi "số đông" và đổi tập dòng
bị flag.

### Chip trùng lặp — LIVE theo cột đang bôi

- Tính trên `duplicateColumns` = **chỉ cột đang bôi ở HEADER**, cố ý KHÔNG dùng `targetColumns` (có
  fallback về cột của ô đang chọn) — click sửa 1 ô là thao tác liên tục, không phải ý định kiểm tra trùng
  (từng gây bug chip tự bật khi vừa click 1 ô).
- Chưa bôi cột nào → chip biến mất hẳn. Bôi ≥ 1 cột → số dòng THỪA sẽ bị xoá theo mặc định
  (`findDuplicateIdsToRemove`), cùng nền tảng với Remove Duplicated Rows nên 2 con số khớp nhau (trừ khi
  người dùng tự đổi dòng giữ lại trong popup). Đổi selection → cập nhật ngay.
- Thiết kế cũ lưu cột trùng vào `sessions.participant_duplicate_columns` — đã bỏ vì đổi selection không
  tự cập nhật config, và chỉ mở preset ra xem (rồi Cancel) cũng âm thầm ghi đè, để lại chip sai.

## 7. Lưu

- **Save** (nút hoặc `Ctrl/Cmd+S`) — `handleSave()` so từng dòng với snapshot lúc load: dòng đổi →
  `participants:update`; dòng mới (`__isNew`) → `participants:create`; dòng bị xoá khỏi state →
  `participants:bulkDelete` (soft-delete, xem [schema.md](./schema.md)); cuối cùng `participants:reorder`
  ghi lại `sort_order`.
- **Autosave** 20s (`AUTOSAVE_DELAY_MS`) sau lần sửa cuối nếu đang có thay đổi.

## 8. Phím tắt

`Ctrl/Cmd+Z` Undo · `Ctrl/Cmd+Y` hoặc `Ctrl/Cmd+Shift+Z` Redo · `Ctrl/Cmd+S` Save · `Delete` xoá dòng đang
chọn. Bỏ qua khi đang gõ trong 1 ô (để undo/redo hoạt động ngay trong ô đó).

Container bắt phím (`tabIndex={0}`) tự `.focus()` khi dữ liệu tải xong (và sau mỗi lần lưu) — thiếu bước
này thì mở Editor bấm Ctrl+Z không phản ứng, phải click vào bảng trước (bug đã gặp).

## 9. Quy tắc UI rút ra từ bug thật

- **Dropdown ▾ ở header cột** (Sort A→Z/Z→A, Search in column, Data type) render `fixed` ở top-level theo
  toạ độ thật của nút (`getBoundingClientRect()`), KHÔNG `absolute` lồng trong `<th>`. Lý do: `<thead>` là
  `position: sticky` trong cùng vùng cuộn với `<tbody>` — bug Chromium khiến nội dung tràn khỏi phần tử
  sticky bị vẽ sai lớp, dữ liệu dòng lộ xuyên qua dropdown. Dropdown mới trong bảng cuộn PHẢI theo pattern
  này.
- **`draggable={false}` cho mọi `<input>`/`<textarea>` lồng trong phần tử kéo-thả được**: `<tr>` (kéo
  dòng) và `<th>` (kéo cột) đều `draggable`; input sửa ô/đổi tên cột thiếu `draggable={false}` thì
  double-click có xê dịch chuột nhẹ bị hiểu thành bắt đầu kéo → input không hiện con trỏ gõ ("thi thoảng"
  không gõ được). Đặt ở chính input, không đặt ở `<tr>`/`<th>` (vẫn cần kéo được).

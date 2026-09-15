import { CORE_FIELDS, EditorState, getCell } from "./types";
import { findDuplicateIdsToRemove } from "./commands";
import { isValidUrl, isValidVietnamesePhone, toTitleCase } from "./transforms";

export interface CellIssue {
  rowId: string;
  col: string;
  message: string;
}

export type ColumnType = "text" | "name" | "phone" | "email" | "code" | "url";

export const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  text: "None",
  name: "Name",
  phone: "Phone",
  email: "Email",
  code: "Code",
  url: "URL",
};

/** Hint shown under the "Data type" dropdown — explains the validation rule applied to the selected type. */
export const COLUMN_TYPE_HINTS: Record<ColumnType, string> = {
  text: "No format validation.",
  name: "Flags values containing digits, and rows whose capitalization differs from the most common style in the column (does not force Title Case).",
  phone: "Applies Vietnamese phone rules: starts with 0, 10-11 digits. Select this column on the table header to check for duplicates (Automate ▸ Deduplication).",
  email: "Must be a valid email format with a domain (e.g. name@example.com).",
  code: "No format validation.",
  url: "Must be a valid URL (e.g. https://example.com).",
};

/** Loại mặc định của 1 cột khi chưa được gán tay — core field có type cố định theo đúng bản chất field. */
export function defaultColumnType(col: string): ColumnType {
  if (col === "name") return "name";
  if (col === "phone") return "phone";
  if (col === "email") return "email";
  if (col === "code") return "code";
  return "text";
}

/** Core field (name/phone/code/email) coi là "đang dùng" khi có dữ liệu thật ở ÍT NHẤT 1 dòng —
 * import generic để trống hoàn toàn 4 field này (xem docs/participants/import.md), nên chỉ hiện/
 * validate core field nào thực sự có dữ liệu (dữ liệu cũ trước khi đổi thiết kế), tránh 4 cột rỗng
 * mặc định gây rối mắt. Cột phụ (extra) không cần hàm này — luôn hiện vì đã nằm trong state.columns. */
export function isCoreFieldActive(col: (typeof CORE_FIELDS)[number], state: EditorState): boolean {
  return state.rows.some((r) => r[col]?.trim());
}

/**
 * Tìm cột nào đang thực sự đóng vai trò 1 ColumnType cụ thể (vd "cột nào là Name") — đây là cơ chế
 * DUY NHẤT xác định "trường Name/Phone" của participant, thay cho việc đọc cứng participant.name.
 * Ưu tiên core field (theo đúng bản chất, chỉ tính nếu đang có dữ liệu thật — xem isCoreFieldActive),
 * sau đó tới cột phụ đầu tiên được gán TAY đúng type này (cột phụ mặc định luôn là "text" nên chỉ
 * tính khi có override rõ ràng). Không tìm thấy → undefined, nghĩa là chưa ai gán nhãn này cả.
 */
export function resolveColumnForType(
  state: EditorState,
  columnTypes: Record<string, ColumnType>,
  type: ColumnType
): string | undefined {
  for (const col of CORE_FIELDS) {
    if (!isCoreFieldActive(col, state)) continue;
    if ((columnTypes[col] ?? defaultColumnType(col)) === type) return col;
  }
  for (const col of state.columns) {
    if (columnTypes[col] === type) return col;
  }
  return undefined;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type CaseShape = "title" | "upper" | "lower" | "other";

/** Phân loại "kiểu viết hoa" của 1 giá trị — null nghĩa là không có chữ cái nào để xét. */
function caseShapeOf(v: string): CaseShape | null {
  if (!/\p{L}/u.test(v)) return null;
  if (v === v.toUpperCase() && v !== v.toLowerCase()) return "upper";
  if (v === v.toLowerCase() && v !== v.toUpperCase()) return "lower";
  if (v === toTitleCase(v)) return "title";
  return "other";
}

/** Prefix cố định cho issue trùng lặp — message thật còn kèm "on N selected column(s)" (động theo
 * số cột đang chọn), nên nơi cần nhận diện dòng trùng phải dùng `.startsWith(DUPLICATE_ISSUE_PREFIX)`,
 * KHÔNG so sánh bằng (===) như các message tĩnh khác. */
export const DUPLICATE_ISSUE_PREFIX = "Duplicated Rows";

/**
 * Kiểm tra trùng lặp theo compound key trên đúng các cột đang được TRUYỀN VÀO (xem `validateState`
 * — nguồn là cột đang bôi chọn trên bảng NGAY LÚC NÀY, không phải 1 config đã lưu sẵn). Chọn 1 cột
 * → trùng theo đúng cột đó; chọn nhiều cột → phải trùng TẤT CẢ các cột đó cùng lúc mới tính là trùng.
 * Dùng CHUNG `findDuplicateIdsToRemove` (commands.ts) với preset "Automate ▸ Remove Duplicated Rows"
 * — cố ý để 2 nơi luôn ra CÙNG 1 con số (chỉ tính dòng THỪA sẽ bị xoá, dòng "giữ lại" — hoàn chỉnh
 * nhất trong mỗi nhóm — không bị tính là issue).
 */
function findDuplicateIssues(state: EditorState, duplicateColumns: string[]): CellIssue[] {
  if (duplicateColumns.length === 0) return [];
  const ids = findDuplicateIdsToRemove(state, duplicateColumns);
  if (ids.length === 0) return [];
  const n = duplicateColumns.length;
  const message = `${DUPLICATE_ISSUE_PREFIX} on ${n} selected column${n === 1 ? "" : "s"}`;
  const issues: CellIssue[] = [];
  ids.forEach((id) => {
    duplicateColumns.forEach((col) => issues.push({ rowId: id, col, message }));
  });
  return issues;
}

/**
 * Validate tổng quát theo type đã gán cho từng cột — không chỉ giới hạn ở 2 core field
 * name/phone như bản cũ. Cột nào được gán type "phone" (kể cả cột optional lạ tên như
 * "Số ĐT liên hệ") đều được áp đúng quy tắc định dạng của phone. Trùng lặp là 1 khái niệm
 * tách riêng, không còn gắn với type — xem findDuplicateIssues.
 *
 * `duplicateColumns` PHẢI là cột đang bôi chọn trên bảng NGAY LÚC validate chạy (không phải config
 * đã lưu trong DB) — chưa chọn cột nào thì mảng rỗng, chip "Duplicated Rows" biến mất hoàn toàn khỏi
 * status bar. Từng dùng `sessions.participant_duplicate_columns` (config lưu riêng) cho việc này,
 * đã bỏ vì gây lệch: đổi selection trên bảng không làm chip tự cập nhật, và bấm mở preset dedup dù
 * chỉ xem thử/Cancel cũng âm thầm đổi config, để lại chip sai không cách nào tự hết.
 */
export function validateState(
  state: EditorState,
  columnTypes: Record<string, ColumnType>,
  duplicateColumns: string[] = []
): CellIssue[] {
  const issues: CellIssue[] = [];

  // Tên & SĐT bắt buộc phải có giá trị — nhưng CHỈ SAU KHI đã có 1 cột nào đó thực sự đóng vai trò
  // Name/Phone (xem resolveColumnForType). Chưa gán nhãn nào cả thì chưa có gì để coi là "thiếu" —
  // đúng tinh thần "generic trước, label sau" (xem docs/participants/column-mapping.md).
  const nameCol = resolveColumnForType(state, columnTypes, "name");
  const phoneCol = resolveColumnForType(state, columnTypes, "phone");
  state.rows.forEach((r) => {
    if (nameCol && !getCell(r, nameCol).trim()) issues.push({ rowId: r.id, col: nameCol, message: "Missing Name" });
    if (phoneCol && !getCell(r, phoneCol).trim()) issues.push({ rowId: r.id, col: phoneCol, message: "Missing Phone" });
  });

  issues.push(...findDuplicateIssues(state, duplicateColumns));

  const allColumns = [...CORE_FIELDS.filter((c) => isCoreFieldActive(c, state)), ...state.columns];

  allColumns.forEach((col) => {
    const type = columnTypes[col] ?? defaultColumnType(col);

    if (type === "phone") {
      state.rows.forEach((r) => {
        const value = getCell(r, col);
        if (value.trim() && !isValidVietnamesePhone(value)) {
          issues.push({ rowId: r.id, col, message: "Invalid Phone Format" });
        }
      });
    }

    if (type === "email") {
      state.rows.forEach((r) => {
        const value = getCell(r, col);
        if (value.trim() && !EMAIL_RE.test(value.trim())) {
          issues.push({ rowId: r.id, col, message: "Invalid Email Format" });
        }
      });
    }

    if (type === "url") {
      state.rows.forEach((r) => {
        const value = getCell(r, col);
        if (value.trim() && !isValidUrl(value)) {
          issues.push({ rowId: r.id, col, message: "Invalid URL Format" });
        }
      });
    }

    if (type === "name") {
      // "Name Contains Number" — Name không được chứa ký tự số, bắt được ngay cả khi gán nhầm 1 cột
      // không phải Name (vd SĐT, mã số) làm Name, thứ mà check "Capitalization Inconsistent" bên dưới
      // không phát hiện được (chuỗi toàn số không có chữ cái nào để so kiểu viết hoa — caseShapeOf trả
      // về null, bị lọc khỏi `shaped`, không tạo ra issue nào cả).
      state.rows.forEach((r) => {
        const value = getCell(r, col);
        if (/\d/.test(value)) {
          issues.push({ rowId: r.id, col, message: "Name Contains Number" });
        }
      });

      // Không ép theo 1 quy tắc case cố định (vd Title Case) — chỉ báo dòng nào LỆCH so với
      // kiểu viết hoa phổ biến nhất đang có trong chính cột đó. Cột toàn bộ cùng 1 kiểu (kể cả
      // toàn chữ HOA) thì không có gì để cảnh báo.
      const shaped = state.rows
        .map((r) => ({ id: r.id, shape: caseShapeOf(getCell(r, col)) }))
        .filter((s): s is { id: string; shape: CaseShape } => s.shape !== null);
      const counts = new Map<CaseShape, number>();
      shaped.forEach((s) => counts.set(s.shape, (counts.get(s.shape) ?? 0) + 1));
      if (counts.size > 1) {
        const majorityShape = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
        shaped.forEach((s) => {
          if (s.shape !== majorityShape) {
            issues.push({ rowId: s.id, col, message: "Capitalization Inconsistent" });
          }
        });
      }
    }
  });

  return issues;
}

export function groupIssuesByRow(issues: CellIssue[]): Map<string, CellIssue[]> {
  const map = new Map<string, CellIssue[]>();
  issues.forEach((i) => {
    if (!map.has(i.rowId)) map.set(i.rowId, []);
    map.get(i.rowId)!.push(i);
  });
  return map;
}

/** Gom issue theo message để hiển thị dạng chip "Thiếu tên (12)" trong toolbar Validate. */
export function groupIssuesByMessage(issues: CellIssue[]): { message: string; count: number; rowIds: Set<string> }[] {
  const map = new Map<string, Set<string>>();
  issues.forEach((i) => {
    if (!map.has(i.message)) map.set(i.message, new Set());
    map.get(i.message)!.add(i.rowId);
  });
  return Array.from(map.entries())
    .map(([message, rowIds]) => ({ message, count: rowIds.size, rowIds }))
    .sort((a, b) => b.count - a.count);
}

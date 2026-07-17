import { CORE_FIELDS, EditorState, getCell } from "./types";
import { isValidUrl, isValidVietnamesePhone, toTitleCase } from "./transforms";

export interface CellIssue {
  rowId: string;
  col: string;
  message: string;
}

export type ColumnType = "text" | "name" | "phone" | "email" | "code" | "url";

export const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  text: "Văn bản (không kiểm tra)",
  name: "Tên",
  phone: "Số điện thoại (VN)",
  email: "Email",
  code: "Mã",
  url: "URL",
};

/** Hint hiển thị dưới dropdown "Loại dữ liệu" — giải thích quy tắc cảnh báo đang áp cho type đang chọn. */
export const COLUMN_TYPE_HINTS: Record<ColumnType, string> = {
  text: "Không kiểm tra định dạng.",
  name: "Cảnh báo nếu chưa viết hoa đúng chuẩn Title Case (VD: Nguyễn Văn An).",
  phone: "Áp đầu số Việt Nam: bắt đầu 0, đủ 10-11 số. Kiểm tra định dạng + trùng lặp trong cột.",
  email: "Phải đúng định dạng email, có đuôi tên miền (VD: ten@vidu.com).",
  code: "Không kiểm tra định dạng.",
  url: "Phải đúng định dạng URL (VD: https://vidu.com).",
};

/** Loại mặc định của 1 cột khi chưa được gán tay — core field có type cố định theo đúng bản chất field. */
export function defaultColumnType(col: string): ColumnType {
  if (col === "name") return "name";
  if (col === "phone") return "phone";
  if (col === "email") return "email";
  if (col === "code") return "code";
  return "text";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Validate tổng quát theo type đã gán cho từng cột — không chỉ giới hạn ở 2 core field
 * name/phone như bản cũ. Cột nào được gán type "phone" (kể cả cột optional lạ tên như
 * "Số ĐT liên hệ") đều được áp đúng quy tắc định dạng + trùng lặp của phone.
 */
export function validateState(state: EditorState, columnTypes: Record<string, ColumnType>): CellIssue[] {
  const issues: CellIssue[] = [];

  // Tên & SĐT là 2 field bắt buộc phải có giá trị — gắn liền với việc đủ điều kiện quay số,
  // không phụ thuộc vào việc user có đổi type hay không.
  state.rows.forEach((r) => {
    if (!r.name.trim()) issues.push({ rowId: r.id, col: "name", message: "Thiếu tên" });
    if (!r.phone.trim()) issues.push({ rowId: r.id, col: "phone", message: "Thiếu SĐT" });
  });

  const allColumns = [...CORE_FIELDS, ...state.columns];

  allColumns.forEach((col) => {
    const type = columnTypes[col] ?? defaultColumnType(col);

    if (type === "phone") {
      state.rows.forEach((r) => {
        const value = getCell(r, col);
        if (value.trim() && !isValidVietnamesePhone(value)) {
          issues.push({ rowId: r.id, col, message: "Sai định dạng SĐT (phải bắt đầu 0, đủ 10-11 số)" });
        }
      });
      const groups = new Map<string, string[]>();
      state.rows.forEach((r) => {
        const key = getCell(r, col).replace(/\D/g, "");
        if (!key) return;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(r.id);
      });
      groups.forEach((ids) => {
        if (ids.length > 1) ids.forEach((id) => issues.push({ rowId: id, col, message: "Giá trị trùng lặp" }));
      });
    }

    if (type === "email") {
      state.rows.forEach((r) => {
        const value = getCell(r, col);
        if (value.trim() && !EMAIL_RE.test(value.trim())) {
          issues.push({ rowId: r.id, col, message: "Sai định dạng email" });
        }
      });
    }

    if (type === "url") {
      state.rows.forEach((r) => {
        const value = getCell(r, col);
        if (value.trim() && !isValidUrl(value)) {
          issues.push({ rowId: r.id, col, message: "Sai định dạng URL" });
        }
      });
    }

    // Chỉ kiểm tra case (Title Case), không đụng khoảng trắng — toTitleCase() giữ nguyên
    // whitespace gốc nên mismatch ở đây chắc chắn là do viết hoa/thường sai.
    if (type === "name") {
      state.rows.forEach((r) => {
        const value = getCell(r, col);
        if (value.trim() && toTitleCase(value) !== value) {
          issues.push({ rowId: r.id, col, message: "Chưa viết hoa đúng chuẩn (Title Case)" });
        }
      });
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

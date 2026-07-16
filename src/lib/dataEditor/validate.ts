import { EditorState } from "./types";
import { isValidVietnamesePhone } from "./transforms";

export interface CellIssue {
  rowId: string;
  col: string;
  message: string;
}

export function validateState(state: EditorState): CellIssue[] {
  const issues: CellIssue[] = [];
  const phoneGroups = new Map<string, string[]>();

  state.rows.forEach((r) => {
    if (!r.name.trim()) issues.push({ rowId: r.id, col: "name", message: "Thiếu tên" });

    if (!r.phone.trim()) {
      issues.push({ rowId: r.id, col: "phone", message: "Thiếu SĐT" });
    } else if (!isValidVietnamesePhone(r.phone)) {
      issues.push({ rowId: r.id, col: "phone", message: "SĐT không hợp lệ (phải bắt đầu 0, đủ 10-11 số)" });
    }

    const key = r.phone.replace(/\D/g, "");
    if (key) {
      if (!phoneGroups.has(key)) phoneGroups.set(key, []);
      phoneGroups.get(key)!.push(r.id);
    }
  });

  phoneGroups.forEach((ids) => {
    if (ids.length > 1) ids.forEach((id) => issues.push({ rowId: id, col: "phone", message: "SĐT trùng lặp" }));
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

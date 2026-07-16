// Kiểu dữ liệu trung tâm của Data Editor — độc lập với Participant của DB,
// vì editor cần thêm __isNew (dòng chưa lưu) mà bản ghi DB thật không có.

export const CORE_FIELDS = ["name", "phone", "code", "email"] as const;
export type CoreField = (typeof CORE_FIELDS)[number];

export interface EditorRow {
  id: string;
  name: string;
  phone: string;
  code: string;
  email: string;
  status: string;
  created_at: string;
  extra: Record<string, string>;
  __isNew?: boolean; // dòng vừa Add Row, chưa tồn tại trong DB cho tới khi Save
}

export interface EditorState {
  columns: string[]; // các cột optional (nằm trong extra), KHÔNG gồm 4 core field cố định
  rows: EditorRow[];
}

export function isCoreField(col: string): col is CoreField {
  return (CORE_FIELDS as readonly string[]).includes(col);
}

export function getCell(row: EditorRow, col: string): string {
  return isCoreField(col) ? row[col] ?? "" : row.extra[col] ?? "";
}

export function withCell(row: EditorRow, col: string, value: string): EditorRow {
  return isCoreField(col) ? { ...row, [col]: value } : { ...row, extra: { ...row.extra, [col]: value } };
}

export function makeEmptyRow(): EditorRow {
  return {
    id: `new-${Math.random().toString(36).slice(2, 10)}`,
    name: "",
    phone: "",
    code: "",
    email: "",
    status: "active",
    created_at: new Date().toISOString(),
    extra: {},
    __isNew: true,
  };
}

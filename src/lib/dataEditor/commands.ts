import { Command } from "./history";
import { EditorRow, EditorState, getCell, isCoreField, makeEmptyRow, withCell } from "./types";
import { maskPhone, PhoneMaskPattern } from "./transforms";

/* COMPOSITE */

/** Gộp nhiều command thành 1 bước Undo/Redo duy nhất — dùng cho Quick Actions. */
export function combineCommands(label: string, commands: (Command | null)[]): Command | null {
  const valid = commands.filter((c): c is Command => !!c);
  if (valid.length === 0) return null;
  return {
    label,
    execute: (s) => valid.reduce((acc, c) => c.execute(acc), s),
    undo: (s) => [...valid].reverse().reduce((acc, c) => c.undo(acc), s),
  };
}

export function reorderRowsCommand(state: EditorState, fromIndex: number, toIndex: number): Command | null {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return null;
  if (fromIndex >= state.rows.length || toIndex >= state.rows.length) return null;
  return {
    label: "Reorder rows",
    execute: (s) => {
      const rows = [...s.rows];
      const [moved] = rows.splice(fromIndex, 1);
      rows.splice(toIndex, 0, moved);
      return { ...s, rows };
    },
    undo: (s) => {
      const rows = [...s.rows];
      const [moved] = rows.splice(toIndex, 1);
      rows.splice(fromIndex, 0, moved);
      return { ...s, rows };
    },
  };
}

/* EDIT */

export function editCellCommand(state: EditorState, rowId: string, col: string, newValue: string): Command | null {
  const row = state.rows.find((r) => r.id === rowId);
  if (!row) return null;
  const oldValue = getCell(row, col);
  if (oldValue === newValue) return null;
  return {
    label: `Edit cell "${col}"`,
    execute: (s) => ({ ...s, rows: s.rows.map((r) => (r.id === rowId ? withCell(r, col, newValue) : r)) }),
    undo: (s) => ({ ...s, rows: s.rows.map((r) => (r.id === rowId ? withCell(r, col, oldValue) : r)) }),
  };
}

export function insertRowCommand(atIndex: number): Command {
  const newRow = makeEmptyRow();
  return {
    label: "Add row",
    execute: (s) => {
      const rows = [...s.rows];
      rows.splice(Math.max(0, Math.min(atIndex, rows.length)), 0, newRow);
      return { ...s, rows };
    },
    undo: (s) => ({ ...s, rows: s.rows.filter((r) => r.id !== newRow.id) }),
  };
}

export function addRowCommand(): Command {
  return insertRowCommand(Number.MAX_SAFE_INTEGER);
}

/** Chèn nhiều dòng trống cùng lúc tại 1 vị trí — 1 bước Undo duy nhất, dùng cho right-click "Chèn N dòng". */
export function insertRowsCommand(atIndex: number, count: number): Command {
  const newRows = Array.from({ length: count }, () => makeEmptyRow());
  const newIds = new Set(newRows.map((r) => r.id));
  return {
    label: `Insert ${count} row(s)`,
    execute: (s) => {
      const rows = [...s.rows];
      rows.splice(Math.max(0, Math.min(atIndex, rows.length)), 0, ...newRows);
      return { ...s, rows };
    },
    undo: (s) => ({ ...s, rows: s.rows.filter((r) => !newIds.has(r.id)) }),
  };
}

export function deleteRowsCommand(state: EditorState, rowIds: string[]): Command | null {
  const idSet = new Set(rowIds);
  const removed = state.rows
    .map((row, index) => ({ row, index }))
    .filter((r) => idSet.has(r.row.id));
  if (removed.length === 0) return null;
  return {
    label: `Delete ${removed.length} row(s)`,
    execute: (s) => ({ ...s, rows: s.rows.filter((r) => !idSet.has(r.id)) }),
    undo: (s) => {
      const rows = [...s.rows];
      removed
        .slice()
        .sort((a, b) => a.index - b.index)
        .forEach(({ row, index }) => rows.splice(Math.min(index, rows.length), 0, row));
      return { ...s, rows };
    },
  };
}

export function addColumnCommand(name: string): Command {
  return {
    label: `Add column "${name}"`,
    execute: (s) => ({ ...s, columns: [...s.columns, name] }),
    undo: (s) => ({
      columns: s.columns.filter((c) => c !== name),
      rows: s.rows.map((r) => {
        const { [name]: _drop, ...rest } = r.extra;
        return { ...r, extra: rest };
      }),
    }),
  };
}

/** Sinh tên cột mới không trùng cột đã có — "Column 1", "Column 2", "Column 3"... LUÔN đánh số ngay
 * từ cột đầu tiên (không có "Column" trơn không số) — dùng CHUNG cho mọi nơi tự sinh cột trống: right-
 * click "Insert column", Edit > Add > Add Column..., và Add Row... lúc bàn hoàn toàn trống (xem
 * addFirstRow/applyAddPrompt trong DataEditorModal.tsx). */
export function nextColumnNames(existing: string[], count: number): string[] {
  const taken = new Set(existing);
  const names: string[] = [];
  let n = 1;
  while (names.length < count) {
    const candidate = `Column ${n}`;
    if (!taken.has(candidate)) {
      names.push(candidate);
      taken.add(candidate);
    }
    n++;
  }
  return names;
}

/** Chèn nhiều cột trống cùng lúc — 1 bước Undo duy nhất, dùng cho right-click "Chèn N cột". */
export function insertColumnsCommand(names: string[]): Command {
  return {
    label: `Insert ${names.length} column(s)`,
    execute: (s) => ({ ...s, columns: [...s.columns, ...names] }),
    undo: (s) => ({
      columns: s.columns.filter((c) => !names.includes(c)),
      rows: s.rows.map((r) => {
        const extra = { ...r.extra };
        names.forEach((n) => delete extra[n]);
        return { ...r, extra };
      }),
    }),
  };
}

export function removeColumnCommand(state: EditorState, name: string): Command {
  // Cột lõi (name/phone/code/email): cột SQL cố định, không drop được — "xoá cột" = clear sạch giá trị
  // về "" ở mọi dòng (Save sẽ ghi name="" / phone|code|email=NULL). Việc ẩn cột khỏi editor do
  // component tự quản (droppedCoreCols), ở đây chỉ lo dữ liệu để Undo khôi phục lại được.
  if (isCoreField(name)) {
    const before = new Map(state.rows.map((r) => [r.id, r[name]]));
    return {
      label: `Delete column "${name}" (clears all values)`,
      execute: (s) => ({ ...s, rows: s.rows.map((r) => ({ ...r, [name]: "" })) }),
      undo: (s) => ({ ...s, rows: s.rows.map((r) => ({ ...r, [name]: before.get(r.id) ?? "" })) }),
    };
  }
  const before = new Map(state.rows.map((r) => [r.id, r.extra[name]]));
  return {
    label: `Delete column "${name}"`,
    execute: (s) => ({
      ...s,
      columns: s.columns.filter((c) => c !== name),
      rows: s.rows.map((r) => {
        const { [name]: _drop, ...rest } = r.extra;
        return { ...r, extra: rest };
      }),
    }),
    undo: (s) => ({
      ...s,
      columns: [...s.columns, name],
      rows: s.rows.map((r) => {
        const v = before.get(r.id);
        return v === undefined ? r : { ...r, extra: { ...r.extra, [name]: v } };
      }),
    }),
  };
}

export function renameColumnCommand(oldName: string, newName: string): Command {
  const rename = (extra: Record<string, string>, from: string, to: string) => {
    if (!(from in extra)) return extra;
    const { [from]: v, ...rest } = extra;
    return { ...rest, [to]: v };
  };
  return {
    label: `Rename column "${oldName}" → "${newName}"`,
    execute: (s) => ({
      columns: s.columns.map((c) => (c === oldName ? newName : c)),
      rows: s.rows.map((r) => ({ ...r, extra: rename(r.extra, oldName, newName) })),
    }),
    undo: (s) => ({
      columns: s.columns.map((c) => (c === newName ? oldName : c)),
      rows: s.rows.map((r) => ({ ...r, extra: rename(r.extra, newName, oldName) })),
    }),
  };
}

export function pasteBlockCommand(
  state: EditorState,
  startRowId: string,
  startCol: string,
  colOrder: string[],
  grid: string[][]
): Command | null {
  const startRowIndex = state.rows.findIndex((r) => r.id === startRowId);
  const startColIndex = colOrder.indexOf(startCol);
  if (startRowIndex === -1 || startColIndex === -1) return null;

  const changes: { rowId: string; col: string; before: string; after: string }[] = [];
  grid.forEach((rowValues, dr) => {
    const row = state.rows[startRowIndex + dr];
    if (!row) return;
    rowValues.forEach((value, dc) => {
      const col = colOrder[startColIndex + dc];
      if (!col) return;
      const before = getCell(row, col);
      if (before !== value) changes.push({ rowId: row.id, col, before, after: value });
    });
  });
  if (changes.length === 0) return null;

  return {
    label: `Paste data (${changes.length} cells)`,
    execute: (s) => ({
      ...s,
      rows: s.rows.map((r) => {
        const cs = changes.filter((c) => c.rowId === r.id);
        return cs.reduce((acc, c) => withCell(acc, c.col, c.after), r);
      }),
    }),
    undo: (s) => ({
      ...s,
      rows: s.rows.map((r) => {
        const cs = changes.filter((c) => c.rowId === r.id);
        return cs.reduce((acc, c) => withCell(acc, c.col, c.before), r);
      }),
    }),
  };
}

/* CLEAN */

/** Khung dùng chung cho mọi thao tác Clean áp lên 1 cột — chỉ ghi lại Ô THỰC SỰ thay đổi. */
export function batchTransformCommand(
  state: EditorState,
  label: string,
  col: string,
  transform: (value: string) => string
): Command | null {
  const changes = state.rows
    .map((r) => ({ id: r.id, before: getCell(r, col) }))
    .map((c) => ({ ...c, after: transform(c.before) }))
    .filter((c) => c.before !== c.after);
  if (changes.length === 0) return null;
  const changeMap = new Map(changes.map((c) => [c.id, c]));
  return {
    label: `${label} (${changes.length} row(s))`,
    execute: (s) => ({
      ...s,
      rows: s.rows.map((r) => {
        const c = changeMap.get(r.id);
        return c ? withCell(r, col, c.after) : r;
      }),
    }),
    undo: (s) => ({
      ...s,
      rows: s.rows.map((r) => {
        const c = changeMap.get(r.id);
        return c ? withCell(r, col, c.before) : r;
      }),
    }),
  };
}

/**
 * Áp 1 danh sách before/after ĐÃ TÍNH SẴN (vd popup preview Normalize sau khi người dùng tick chọn
 * dòng nào muốn áp) — khác batchTransformCommand ở chỗ không tự tính lại transform, chỉ ghi thẳng
 * đúng những dòng được truyền vào.
 */
export function applyChangesCommand(
  label: string,
  col: string,
  changes: { rowId: string; before: string; after: string }[]
): Command | null {
  if (changes.length === 0) return null;
  const changeMap = new Map(changes.map((c) => [c.rowId, c]));
  return {
    label: `${label} (${changes.length} row(s))`,
    execute: (s) => ({
      ...s,
      rows: s.rows.map((r) => {
        const c = changeMap.get(r.id);
        return c ? withCell(r, col, c.after) : r;
      }),
    }),
    undo: (s) => ({
      ...s,
      rows: s.rows.map((r) => {
        const c = changeMap.get(r.id);
        return c ? withCell(r, col, c.before) : r;
      }),
    }),
  };
}

export function findEmptyRowIds(state: EditorState): string[] {
  return state.rows
    .filter(
      (r) =>
        !r.name.trim() &&
        !r.phone.trim() &&
        !r.code.trim() &&
        !r.email.trim() &&
        Object.values(r.extra).every((v) => !v?.trim())
    )
    .map((r) => r.id);
}

export function findEmptyColumns(state: EditorState): string[] {
  return state.columns.filter((col) => state.rows.every((r) => !r.extra[col]?.trim()));
}

export function removeEmptyColumnsCommand(state: EditorState): Command | null {
  const emptyCols = findEmptyColumns(state);
  if (emptyCols.length === 0) return null;
  const before = new Map(emptyCols.map((col) => [col, new Map(state.rows.map((r) => [r.id, r.extra[col]]))]));
  return {
    label: `Delete ${emptyCols.length} empty column(s)`,
    execute: (s) => ({
      columns: s.columns.filter((c) => !emptyCols.includes(c)),
      rows: s.rows.map((r) => {
        const extra = { ...r.extra };
        emptyCols.forEach((c) => delete extra[c]);
        return { ...r, extra };
      }),
    }),
    undo: (s) => ({
      columns: [...s.columns, ...emptyCols],
      rows: s.rows.map((r) => {
        const extra = { ...r.extra };
        emptyCols.forEach((c) => {
          const v = before.get(c)!.get(r.id);
          if (v !== undefined) extra[c] = v;
        });
        return { ...r, extra };
      }),
    }),
  };
}

export interface DuplicateGroup {
  rows: EditorRow[];
  /** Dòng "đầy đủ thông tin nhất" trong nhóm, tick sẵn cho popup chọn dòng giữ lại — người dùng
   * vẫn có thể tự chọn dòng khác trước khi Confirm. */
  defaultKeepId: string;
}

/**
 * Nhóm các dòng trùng theo compound key trên duplicateColumns (cột người dùng đang chọn trên
 * bảng). Mỗi nhóm kèm sẵn defaultKeepId (dòng đầy đủ thông tin nhất) để popup Remove Duplicated
 * Rows tick sẵn — người dùng vẫn tự chọn dòng khác muốn giữ lại trước khi Confirm.
 */
export function findDuplicateGroups(state: EditorState, duplicateColumns: string[]): DuplicateGroup[] {
  if (duplicateColumns.length === 0) return [];
  const groups = new Map<string, EditorRow[]>();
  state.rows.forEach((r) => {
    const values = duplicateColumns.map((col) => getCell(r, col).trim());
    if (values.every((v) => !v)) return;
    const key = values.join("\u0001");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  });
  const result: DuplicateGroup[] = [];
  groups.forEach((rows) => {
    if (rows.length < 2) return;
    const scored = rows.map((row) => ({
      row,
      score: [row.name, row.code, row.phone, row.email, ...Object.values(row.extra)].filter((v) => v?.trim())
        .length,
    }));
    scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.row.created_at.localeCompare(b.row.created_at)));
    result.push({ rows, defaultKeepId: scored[0].row.id });
  });
  return result;
}

/** Dùng cho status bar/issue count (validate.ts) — không cần chọn thủ công, luôn lấy theo
 * defaultKeepId (dòng đầy đủ thông tin nhất). */
export function findDuplicateIdsToRemove(state: EditorState, duplicateColumns: string[]): string[] {
  return findDuplicateGroups(state, duplicateColumns).flatMap((g) =>
    g.rows.filter((r) => r.id !== g.defaultKeepId).map((r) => r.id)
  );
}

/* GENERATE */

function setColumnValuesCommand(
  state: EditorState,
  label: string,
  col: string,
  valueFor: (row: EditorRow, index: number) => string
): Command {
  const columnExists = isCoreField(col) || state.columns.includes(col);
  const before = new Map(state.rows.map((r) => [r.id, getCell(r, col)]));
  return {
    label,
    execute: (s) => ({
      columns: columnExists || isCoreField(col) ? s.columns : [...s.columns, col],
      rows: s.rows.map((r, i) => withCell(r, col, valueFor(r, i))),
    }),
    undo: (s) => ({
      columns: columnExists || isCoreField(col) ? s.columns : s.columns.filter((c) => c !== col),
      rows: s.rows.map((r) => withCell(r, col, before.get(r.id) ?? "")),
    }),
  };
}

/** Generate ID (Sequential + Prefix) và Running Number (Plain/Zero-padded + Start) đã GỘP LÀM 1 —
 * cùng bản chất "đếm tuần tự từ `startAt`, có thể đệm số 0, có thể có tiền tố". Prefix rỗng = đúng
 * hành vi Running Number cũ; có Prefix = đúng hành vi Generate ID cũ (Random đã bỏ hẳn, xem lịch sử
 * commit "Merge Generate ID into Generate Number" — không gian ký tự-số cũ khó customize thêm field
 * cho vừa "độ dài mong muốn" mà không nhồi thêm 1 field riêng, không đáng, xem thảo luận trong đó).
 *
 * "plain" = đếm thường 1, 2, 3...10...100 (độ dài số tăng dần tự nhiên). "padded" = đệm số 0 để MỌI
 * dòng cùng số chữ số, tính theo giá trị LỚN NHẤT thực tế sẽ xuất hiện (startAt + số dòng - 1) — vd
 * bắt đầu từ 1, 999 dòng → giá trị lớn nhất là 999 (3 chữ số) → 001, 002...999. Prefix không tính
 * vào độ rộng đệm — chỉ đệm phần SỐ, prefix luôn giữ nguyên trước nó (vd "KH" + "001" = "KH001"). */
export function generateNumberCommand(
  state: EditorState,
  col: string,
  mode: "plain" | "padded",
  prefix: string
): Command {
  const startAt = 1;
  const maxValue = startAt + Math.max(0, state.rows.length - 1);
  const digitWidth = String(Math.max(1, maxValue)).length;
  return setColumnValuesCommand(state, `Generate Number → "${col}"`, col, (_row, i) => {
    const value = startAt + i;
    const numberPart = mode === "padded" ? String(value).padStart(digitWidth, "0") : String(value);
    return `${prefix}${numberPart}`;
  });
}

/** `sourceCol` đọc theo cột nào đang được Data Editor gán Data Type = Phone (xem
 * DataEditorModal.tsx's phoneColumns/displayPhoneSourceCol) — KHÔNG đọc cứng `row.phone` như trước
 * (vi phạm nguyên tắc "không có field cố định", xem CLAUDE.md), vì 1 session có thể có nhiều hơn 1
 * cột kiểu Phone và/hoặc cột Phone thật nằm ở `extra` chứ không phải cột SQL `phone`. */
export function displayPhoneCommand(state: EditorState, col: string, sourceCol: string, pattern: PhoneMaskPattern): Command {
  return setColumnValuesCommand(state, `Display Phone → "${col}"`, col, (row) => maskPhone(getCell(row, sourceCol), pattern));
}
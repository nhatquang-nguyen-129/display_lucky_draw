import { Command } from "./history";
import { EditorRow, EditorState, getCell, isCoreField, makeEmptyRow, withCell } from "./types";
import { maskPhone, PhoneMaskPattern } from "./transforms";

/* ==================== COMPOSITE ==================== */

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

/* ==================== EDIT ==================== */

export function editCellCommand(state: EditorState, rowId: string, col: string, newValue: string): Command | null {
  const row = state.rows.find((r) => r.id === rowId);
  if (!row) return null;
  const oldValue = getCell(row, col);
  if (oldValue === newValue) return null;
  return {
    label: `Sửa ô "${col}"`,
    execute: (s) => ({ ...s, rows: s.rows.map((r) => (r.id === rowId ? withCell(r, col, newValue) : r)) }),
    undo: (s) => ({ ...s, rows: s.rows.map((r) => (r.id === rowId ? withCell(r, col, oldValue) : r)) }),
  };
}

export function insertRowCommand(atIndex: number): Command {
  const newRow = makeEmptyRow();
  return {
    label: "Thêm dòng",
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

export function deleteRowsCommand(state: EditorState, rowIds: string[]): Command | null {
  const idSet = new Set(rowIds);
  const removed = state.rows
    .map((row, index) => ({ row, index }))
    .filter((r) => idSet.has(r.row.id));
  if (removed.length === 0) return null;
  return {
    label: `Xoá ${removed.length} dòng`,
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
    label: `Thêm cột "${name}"`,
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

export function removeColumnCommand(state: EditorState, name: string): Command {
  const before = new Map(state.rows.map((r) => [r.id, r.extra[name]]));
  return {
    label: `Xoá cột "${name}"`,
    execute: (s) => ({
      columns: s.columns.filter((c) => c !== name),
      rows: s.rows.map((r) => {
        const { [name]: _drop, ...rest } = r.extra;
        return { ...r, extra: rest };
      }),
    }),
    undo: (s) => ({
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
    label: `Đổi tên cột "${oldName}" → "${newName}"`,
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
    label: `Dán dữ liệu (${changes.length} ô)`,
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

/* ==================== CLEAN ==================== */

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
    label: `${label} (${changes.length} dòng)`,
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

export function removeEmptyColumnsCommand(state: EditorState): Command | null {
  const emptyCols = state.columns.filter((col) => state.rows.every((r) => !r.extra[col]?.trim()));
  if (emptyCols.length === 0) return null;
  const before = new Map(emptyCols.map((col) => [col, new Map(state.rows.map((r) => [r.id, r.extra[col]]))]));
  return {
    label: `Xoá ${emptyCols.length} cột rỗng`,
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

/** Giữ dòng "đầy đủ thông tin nhất" mỗi nhóm trùng SĐT, xoá phần còn lại — tái dùng deleteRowsCommand. */
export function findDuplicatePhoneIdsToRemove(state: EditorState): string[] {
  const groups = new Map<string, EditorRow[]>();
  state.rows.forEach((r) => {
    const key = r.phone.replace(/\D/g, "");
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  });
  const toRemove: string[] = [];
  groups.forEach((rows) => {
    if (rows.length < 2) return;
    const scored = rows.map((row) => ({
      row,
      score: [row.name, row.code, row.phone, row.email, ...Object.values(row.extra)].filter((v) => v?.trim())
        .length,
    }));
    scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.row.created_at.localeCompare(b.row.created_at)));
    scored.slice(1).forEach((s) => toRemove.push(s.row.id));
  });
  return toRemove;
}

/* ==================== GENERATE ==================== */

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

export function generateIdCommand(
  state: EditorState,
  col: string,
  mode: "sequential" | "random",
  prefix: string
): Command {
  return setColumnValuesCommand(state, `Generate ID → "${col}" (${state.rows.length} dòng)`, col, (_row, i) =>
    mode === "sequential"
      ? `${prefix}${String(i + 1).padStart(4, "0")}`
      : `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  );
}

export function runningNumberCommand(state: EditorState, col: string, startAt: number): Command {
  return setColumnValuesCommand(state, `Running Number → "${col}"`, col, (_row, i) => String(startAt + i));
}

export function displayPhoneCommand(state: EditorState, col: string, pattern: PhoneMaskPattern): Command {
  return setColumnValuesCommand(state, `Display Phone → "${col}"`, col, (row) => maskPhone(row.phone, pattern));
}

export function combineColumnsCommand(
  state: EditorState,
  newCol: string,
  sourceCols: string[],
  separator: string
): Command {
  return setColumnValuesCommand(state, `Combine columns → "${newCol}"`, newCol, (row) =>
    sourceCols.map((c) => getCell(row, c)).filter(Boolean).join(separator)
  );
}

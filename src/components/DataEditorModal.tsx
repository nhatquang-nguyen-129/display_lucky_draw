import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { Participant, Session } from "@/types";
import { CORE_FIELDS, EditorRow, EditorState, getCell, isCoreField } from "@/lib/dataEditor/types";
import { useCommandHistory } from "@/lib/dataEditor/history";
import {
  batchTransformCommand,
  combineColumnsCommand,
  combineCommands,
  deleteRowsCommand,
  displayPhoneCommand,
  findDuplicateIdsToRemove,
  findEmptyRowIds,
  editCellCommand,
  generateIdCommand,
  insertColumnsCommand,
  insertRowsCommand,
  nextColumnNames,
  pasteBlockCommand,
  removeColumnCommand,
  removeEmptyColumnsCommand,
  renameColumnCommand,
  reorderRowsCommand,
  runningNumberCommand,
} from "@/lib/dataEditor/commands";
import { findReplaceTransform, normalizeNameValue, normalizePhoneValue, toLowerCase, toTitleCase, toUpperCase, trimSpace } from "@/lib/dataEditor/transforms";
import {
  ColumnType,
  COLUMN_TYPE_HINTS,
  COLUMN_TYPE_LABELS,
  defaultColumnType,
  DUPLICATE_ISSUE_MESSAGE,
  groupIssuesByMessage,
  groupIssuesByRow,
  validateState,
} from "@/lib/dataEditor/validate";

interface DataEditorModalProps {
  open: boolean;
  sessionId: string;
  session: Session | null;
  onClose: () => void;
  onSaved: () => void;
}

type Group = "edit" | "generate";
const GROUPS: { key: Group; label: string }[] = [
  { key: "edit", label: "Edit" },
  { key: "generate", label: "Generate" },
];

const COLUMN_LABELS: Record<string, string> = { name: "Name", phone: "Phone", code: "Code", email: "Email" };
const AUTOSAVE_DELAY_MS = 20000;
const CHECKBOX_COL_WIDTH = 32;
const DEFAULT_COLUMN_WIDTH = 160;
const MIN_COLUMN_WIDTH = 60;

function safeParseExtra(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function rowFromParticipant(p: Participant): EditorRow {
  return {
    id: p.id,
    name: p.name,
    phone: p.phone ?? "",
    code: p.code ?? "",
    email: p.email ?? "",
    status: p.status,
    created_at: p.created_at,
    extra: safeParseExtra(p.extra_data),
  };
}

function sameRow(a: EditorRow, b: EditorRow): boolean {
  return (
    a.name === b.name &&
    a.phone === b.phone &&
    a.code === b.code &&
    a.email === b.email &&
    JSON.stringify(a.extra) === JSON.stringify(b.extra)
  );
}

export default function DataEditorModal({ open, sessionId, session, onClose, onSaved }: DataEditorModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [originalRows, setOriginalRows] = useState<EditorRow[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const history = useCommandHistory({ columns: [], rows: [] } as EditorState);

  const [activeGroup, setActiveGroup] = useState<Group>("edit");
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; col: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; col: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [renamingColumn, setRenamingColumn] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextMenu, setContextMenu] = useState<
    | { x: number; y: number; type: "row"; rowId: string; rowIndex: number }
    | { x: number; y: number; type: "column"; col: string }
    | null
  >(null);
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);

  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const [generateMenuOpen, setGenerateMenuOpen] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [selectedColKeys, setSelectedColKeys] = useState<Set<string>>(new Set());
  const [lastSelectedCol, setLastSelectedCol] = useState<string | null>(null);

  const [cleanColumn, setCleanColumn] = useState("phone");
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);

  const [genAction, setGenAction] = useState<"id" | "running" | "displayPhone" | "combine">("id");
  const [genIdMode, setGenIdMode] = useState<"sequential" | "random">("sequential");
  const [genIdPrefix, setGenIdPrefix] = useState("");
  const [runningCol, setRunningCol] = useState("stt");
  const [runningStart, setRunningStart] = useState(1);
  const [displayPhoneCol, setDisplayPhoneCol] = useState("display_phone");
  const [displayPhonePattern, setDisplayPhonePattern] = useState<"last3" | "maskLast3" | "maskMost">("maskMost");
  const [combineCol, setCombineCol] = useState("combined");
  const [combineSources, setCombineSources] = useState<string[]>([]);
  const [combineSeparator, setCombineSeparator] = useState(" - ");

  const [issueFilter, setIssueFilter] = useState<string | null>(null); // null = không lọc, "__any__" = mọi lỗi, hoặc đúng message 1 loại lỗi
  const [columnTypes, setColumnTypes] = useState<Record<string, ColumnType>>({});
  const [duplicateColumns, setDuplicateColumns] = useState<string[]>([]);

  // Thứ tự hiển thị cột — riêng biệt với history (kéo-thả cột chỉ là view, không cần Undo).
  // Đồng bộ lại mỗi khi có cột optional được thêm/xoá qua command.
  const [columnOrder, setColumnOrder] = useState<string[]>([...CORE_FIELDS]);
  useEffect(() => {
    setColumnOrder((prev) => {
      const all = [...CORE_FIELDS, ...history.state.columns];
      const kept = prev.filter((c) => all.includes(c));
      const missing = all.filter((c) => !kept.includes(c));
      return [...kept, ...missing];
    });
  }, [history.state.columns]);

  const [dragColKey, setDragColKey] = useState<string | null>(null);
  const [dragRowIndex, setDragRowIndex] = useState<number | null>(null);
  // Độ rộng cột — chỉ là view state như columnOrder, không cần lưu DB/Undo.
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  function handleColumnResizeStart(col: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[col] ?? DEFAULT_COLUMN_WIDTH;
    function onMove(ev: MouseEvent) {
      const next = Math.max(MIN_COLUMN_WIDTH, startWidth + (ev.clientX - startX));
      setColumnWidths((prev) => ({ ...prev, [col]: next }));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  const [openColumnMenu, setOpenColumnMenu] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const hasActiveFilterOrSort = sortColumn !== null || Object.values(columnFilters).some((v) => v.trim());

  const containerRef = useRef<HTMLDivElement>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const list = await window.api.participants.list(sessionId);
    const rows = list.map(rowFromParticipant);
    const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r.extra))));
    setOriginalRows(rows);
    history.reset({ columns, rows });
    setSelectedRowIds(new Set());
    setSelectedCell(null);
    if (session?.participant_column_types) {
      try {
        setColumnTypes(JSON.parse(session.participant_column_types));
      } catch {
        setColumnTypes({});
      }
    } else {
      setColumnTypes({});
    }
    if (session?.participant_duplicate_columns) {
      try {
        setDuplicateColumns(JSON.parse(session.participant_duplicate_columns));
      } catch {
        setDuplicateColumns([]);
      }
    } else {
      setDuplicateColumns([]);
    }
    setLoading(false);
  }

  function updateColumnType(col: string, type: ColumnType) {
    setColumnTypes((prev) => {
      const next = { ...prev, [col]: type };
      window.api.sessions.updateColumnTypes({ id: sessionId, columnTypes: next });
      return next;
    });
  }

  function toggleDuplicateColumn(col: string) {
    setDuplicateColumns((prev) => {
      const next = prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col];
      window.api.sessions.updateDuplicateColumns({ id: sessionId, duplicateColumns: next });
      return next;
    });
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId]);

  useEffect(() => {
    window.api.editor.reportDirty(open && history.dirty);
  }, [open, history.dirty]);
  useEffect(() => () => window.api.editor.reportDirty(false), []);

  useEffect(() => {
    if (!open || !history.dirty) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => handleSave(true), AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.state, open]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  const issues = useMemo(
    () => validateState(history.state, columnTypes, duplicateColumns),
    [history.state, columnTypes, duplicateColumns]
  );
  const issuesByRow = useMemo(() => groupIssuesByRow(issues), [issues]);
  const issueGroups = useMemo(() => groupIssuesByMessage(issues), [issues]);
  const duplicateRowIds = useMemo(
    () => new Set(issues.filter((i) => i.message === DUPLICATE_ISSUE_MESSAGE).map((i) => i.rowId)),
    [issues]
  );
  const visibleRows = useMemo(() => {
    let rows = history.state.rows;
    if (issueFilter === "__any__") {
      rows = rows.filter((r) => issuesByRow.has(r.id));
    } else if (issueFilter) {
      rows = rows.filter((r) => issuesByRow.get(r.id)?.some((i) => i.message === issueFilter));
    }
    const activeFilters = Object.entries(columnFilters).filter(([, v]) => v.trim());
    if (activeFilters.length > 0) {
      rows = rows.filter((r) =>
        activeFilters.every(([col, term]) => getCell(r, col).toLowerCase().includes(term.trim().toLowerCase()))
      );
    }
    if (sortColumn) {
      rows = [...rows].sort((a, b) => {
        const cmp = getCell(a, sortColumn).localeCompare(getCell(b, sortColumn), "vi", { numeric: true });
        return sortDirection === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [history.state.rows, issueFilter, issuesByRow, columnFilters, sortColumn, sortDirection]);

  function commitEdit() {
    if (!editingCell) return;
    const cmd = editCellCommand(history.state, editingCell.rowId, editingCell.col, editValue);
    if (cmd) history.run(cmd);
    setEditingCell(null);
  }

  function startEdit(rowId: string, col: string) {
    const row = history.state.rows.find((r) => r.id === rowId);
    if (!row) return;
    setEditingCell({ rowId, col });
    setEditValue(getCell(row, col));
  }

  function toggleRowSelect(id: string) {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleColumnDrop(targetCol: string) {
    if (!dragColKey || dragColKey === targetCol) {
      setDragColKey(null);
      return;
    }
    setColumnOrder((prev) => {
      const next = prev.filter((c) => c !== dragColKey);
      const targetIndex = next.indexOf(targetCol);
      next.splice(targetIndex, 0, dragColKey);
      return next;
    });
    setDragColKey(null);
  }

  function handleRowDrop(targetIndex: number) {
    if (dragRowIndex === null) {
      setDragRowIndex(null);
      return;
    }
    const cmd = reorderRowsCommand(history.state, dragRowIndex, targetIndex);
    if (cmd) history.run(cmd);
    setDragRowIndex(null);
  }

  // Đóng dropdown filter/sort cột khi click ra ngoài
  useEffect(() => {
    if (!openColumnMenu) return;
    const close = () => setOpenColumnMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openColumnMenu]);

  // Đóng dropdown Edit / menu chọn cột trùng lặp khi click ra ngoài
  useEffect(() => {
    if (!editMenuOpen) return;
    const close = () => {
      setEditMenuOpen(false);
      setShowFindReplace(false);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [editMenuOpen]);

  // Đóng dropdown Generate khi click ra ngoài
  useEffect(() => {
    if (!generateMenuOpen) return;
    const close = () => setGenerateMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [generateMenuOpen]);

  // Đóng dropdown Lịch sử khi click ra ngoài
  useEffect(() => {
    if (!historyMenuOpen) return;
    const close = () => setHistoryMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [historyMenuOpen]);

  function toggleSelectAll() {
    setSelectedRowIds((prev) => (prev.size === visibleRows.length ? new Set() : new Set(visibleRows.map((r) => r.id))));
  }

  function deleteSelectedRows() {
    if (selectedRowIds.size === 0) return;
    const cmd = deleteRowsCommand(history.state, Array.from(selectedRowIds));
    if (cmd) history.run(cmd);
    setSelectedRowIds(new Set());
  }

  // Chèn N cột trống tại vị trí hiển thị `atIndex` trong columnOrder — dùng cho right-click
  // "Chèn cột" (Excel-style). Tên cột tự sinh ("Cột mới", "Cột mới 2"...), đổi tên sau qua
  // "Đổi tên cột". columnOrder được set thủ công ngay vì effect đồng bộ chỉ APPEND cột thiếu,
  // không tự đặt đúng vị trí trái/phải theo nơi vừa right-click.
  function insertColumnsAt(atIndex: number, count: number) {
    const names = nextColumnNames([...CORE_FIELDS, ...history.state.columns], count);
    history.run(insertColumnsCommand(names));
    setColumnOrder((prev) => {
      const next = [...prev];
      next.splice(atIndex, 0, ...names);
      return next;
    });
  }

  function applyClean(label: string, transform: (v: string) => string) {
    const cmd = batchTransformCommand(history.state, label, cleanColumn, transform);
    if (cmd) history.run(cmd);
    else setToast("No cells needed changes.");
  }

  function applyQuickClean() {
    const cmd = combineCommands("Quick Clean (Trim + Normalize)", [
      batchTransformCommand(history.state, "Trim", "name", trimSpace),
      batchTransformCommand(history.state, "Trim", "phone", trimSpace),
      batchTransformCommand(history.state, "Normalize Name", "name", normalizeNameValue),
      batchTransformCommand(history.state, "Normalize Phone", "phone", normalizePhoneValue),
    ]);
    if (cmd) history.run(cmd);
    else setToast("Data is already clean, nothing to normalize.");
  }

  function applyFindReplace() {
    if (!findText) return;
    const cmd = batchTransformCommand(
      history.state,
      `Find & Replace "${findText}"→"${replaceText}"`,
      cleanColumn,
      findReplaceTransform(findText, replaceText, findCaseSensitive)
    );
    if (cmd) history.run(cmd);
    else setToast("No matching value found.");
  }

  function applyRemoveEmptyRows() {
    const ids = findEmptyRowIds(history.state);
    if (ids.length === 0) {
      setToast("No empty rows.");
      return;
    }
    const cmd = deleteRowsCommand(history.state, ids);
    if (cmd) history.run(cmd);
  }

  function applyRemoveEmptyColumns() {
    const cmd = removeEmptyColumnsCommand(history.state);
    if (cmd) history.run(cmd);
    else setToast("No empty columns.");
  }

  function applyRemoveDuplicates() {
    if (duplicateColumns.length === 0) {
      setToast("No duplicate-check columns selected — go to menu Edit → Deduplicate to choose.");
      return;
    }
    const ids = findDuplicateIdsToRemove(history.state, duplicateColumns);
    if (ids.length === 0) {
      setToast("No duplicates found on the selected columns.");
      return;
    }
    const cmd = deleteRowsCommand(history.state, ids);
    if (cmd) history.run(cmd);
  }

  function applyGenerate() {
    if (genAction === "id") {
      history.run(generateIdCommand(history.state, "code", genIdMode, genIdPrefix));
    } else if (genAction === "running") {
      const col = runningCol.trim();
      if (!col) return;
      history.run(runningNumberCommand(history.state, col, runningStart));
    } else if (genAction === "displayPhone") {
      const col = displayPhoneCol.trim();
      if (!col) return;
      history.run(displayPhoneCommand(history.state, col, displayPhonePattern));
    } else if (genAction === "combine") {
      const col = combineCol.trim();
      if (!col || combineSources.length === 0) return;
      history.run(combineColumnsCommand(history.state, col, combineSources, combineSeparator));
    }
  }

  async function handleSave(silent = false) {
    setSaving(true);
    if (!silent) setError(null);
    try {
      const removedIds = originalRows.filter((o) => !history.state.rows.some((r) => r.id === o.id)).map((o) => o.id);
      if (removedIds.length) await window.api.participants.bulkDelete(removedIds);

      const finalOrderIds: string[] = [];
      for (const row of history.state.rows) {
        const payload = {
          name: row.name,
          code: row.code || undefined,
          phone: row.phone || undefined,
          email: row.email || undefined,
          extra: row.extra,
        };
        let realId = row.id;
        if (row.__isNew) {
          realId = await window.api.participants.create({ sessionId, ...payload });
        } else {
          const orig = originalRows.find((o) => o.id === row.id);
          if (!(orig && sameRow(orig, row))) {
            await window.api.participants.update({ id: row.id, ...payload });
          }
        }
        finalOrderIds.push(realId);
      }
      // Ghi lại thứ tự dòng hiện tại (kể cả khi không kéo-thả gì — giữ ổn định) để không bị mất
      // sau khi reload từ DB, và để id thật của dòng vừa tạo cũng nằm đúng vị trí.
      await window.api.participants.reorder(finalOrderIds);

      await load();
      setToast(silent ? `Auto-saved at ${new Date().toLocaleTimeString("en-US")}.` : "Changes saved.");
      onSaved();
    } catch {
      if (!silent) setError("Save failed — try again.");
    } finally {
      setSaving(false);
    }
  }

  function requestClose() {
    if (history.dirty) {
      if (!confirm("The Data Editor has unsaved changes. Close and discard them?")) return;
    }
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (editingCell) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      history.undo();
    } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
      e.preventDefault();
      history.redo();
    } else if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      handleSave();
    } else if (mod && e.key.toLowerCase() === "c" && selectedCell) {
      const row = history.state.rows.find((r) => r.id === selectedCell.rowId);
      if (row) navigator.clipboard.writeText(getCell(row, selectedCell.col));
    } else if (e.key === "Delete" && selectedRowIds.size > 0) {
      deleteSelectedRows();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    if (!selectedCell || editingCell) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    const grid = lines.map((line) => line.split("\t"));
    const cmd = pasteBlockCommand(history.state, selectedCell.rowId, selectedCell.col, columnOrder, grid);
    if (cmd) history.run(cmd);
  }

  const inputClass =
    "w-full bg-transparent border-b border-transparent px-1 py-1 text-sm text-base-100 outline-none focus:border-gold-500";
  const toolbarBtn = "rounded-md px-2.5 py-1.5 text-xs font-medium text-base-200 hover:bg-base-800 disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <Modal open={open} title="Data Editor — Participants" onClose={requestClose} maxWidth="max-w-[95vw]">
      {loading ? (
        <div className="py-12 text-center text-sm text-base-400">Loading data...</div>
      ) : (
        <div
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="flex h-[75vh] flex-col outline-none"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-base-800 bg-base-900 pb-2">
            <div className="flex gap-1">
              {GROUPS.map((g) => (
                <div key={g.key} className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveGroup(g.key);
                      if (g.key === "edit") {
                        setEditMenuOpen((v) => !v);
                        setGenerateMenuOpen(false);
                      } else {
                        setGenerateMenuOpen((v) => !v);
                        setEditMenuOpen(false);
                      }
                    }}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      activeGroup === g.key ? "bg-gold-500 text-base-950" : "text-base-300 hover:bg-base-800"
                    }`}
                  >
                    {g.label}
                    <span className="ml-1 text-[9px] text-base-400">▾</span>
                  </button>

                  {g.key === "edit" && editMenuOpen && (
                    <div
                      className="absolute left-0 z-30 mt-1 w-64 rounded-lg border border-base-700 bg-base-900 p-2 text-left shadow-2xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wide text-base-500">
                          Selected rows / columns
                        </span>
                      </div>
                      <button
                        className={`block w-full rounded px-2 py-1 text-left text-xs ${
                          selectedRowIds.size === 0
                            ? "cursor-not-allowed text-base-600"
                            : "text-danger-500 hover:bg-base-800"
                        }`}
                        disabled={selectedRowIds.size === 0}
                        onClick={() => {
                          deleteSelectedRows();
                          setEditMenuOpen(false);
                        }}
                      >
                        Delete {selectedRowIds.size > 0 ? `${selectedRowIds.size} selected row(s)` : "selected rows"}
                      </button>
                      <p className="mt-1 px-2 text-[10px] text-base-500">
                        Right-click a row/column to insert more — select multiple rows (checkbox) or multiple
                        columns (Ctrl/Shift+click header) then right-click to insert several at once.
                      </p>

                      <div className="my-2 h-px bg-base-800" />

                      <span className="mb-1 block text-[10px] uppercase tracking-wide text-base-500">
                        Deduplicate
                      </span>
                      <p className="mb-1.5 text-[10px] leading-snug text-base-500">
                        Select 1 column → duplicates match on that column. Select several → ALL of them must match
                        to count as a duplicate.
                      </p>
                      <div className="mb-1.5 max-h-28 overflow-y-auto rounded border border-base-800 p-1">
                        {columnOrder.map((c) => (
                          <label
                            key={c}
                            className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-base-200 hover:bg-base-800"
                          >
                            <input
                              type="checkbox"
                              checked={duplicateColumns.includes(c)}
                              onChange={() => toggleDuplicateColumn(c)}
                              className="accent-gold-500"
                            />
                            {COLUMN_LABELS[c] ?? c}
                          </label>
                        ))}
                      </div>
                      <label className="mb-1.5 flex items-center gap-1.5 rounded px-2 py-1 text-xs text-base-200 hover:bg-base-800">
                        <input
                          type="checkbox"
                          checked={issueFilter === DUPLICATE_ISSUE_MESSAGE}
                          onChange={() =>
                            setIssueFilter((f) => (f === DUPLICATE_ISSUE_MESSAGE ? null : DUPLICATE_ISSUE_MESSAGE))
                          }
                          className="accent-gold-500"
                        />
                        Show only duplicate rows
                      </label>
                      <button
                        className="block w-full rounded px-2 py-1 text-left text-xs text-base-200 hover:bg-base-800"
                        onClick={applyRemoveDuplicates}
                        title={
                          duplicateColumns.length === 0
                            ? "No duplicate-check columns selected"
                            : `By column: ${duplicateColumns.map((c) => COLUMN_LABELS[c] ?? c).join(", ")}`
                        }
                      >
                        Delete duplicate rows
                      </button>

                      <div className="my-2 h-px bg-base-800" />

                      <label className="mb-1 block text-[10px] uppercase tracking-wide text-base-500">
                        Apply to column
                      </label>
                      <select
                        value={cleanColumn}
                        onChange={(e) => setCleanColumn(e.target.value)}
                        className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100"
                      >
                        {columnOrder.map((c) => (
                          <option key={c} value={c}>
                            {COLUMN_LABELS[c] ?? c}
                          </option>
                        ))}
                      </select>

                      <span className="mb-1 block text-[10px] uppercase tracking-wide text-base-500">Text</span>
                      <button className="block w-full rounded px-2 py-1 text-left text-xs text-base-200 hover:bg-base-800" onClick={() => applyClean("Upper Case", toUpperCase)}>
                        UPPER CASE
                      </button>
                      <button className="block w-full rounded px-2 py-1 text-left text-xs text-base-200 hover:bg-base-800" onClick={() => applyClean("Lower Case", toLowerCase)}>
                        lower case
                      </button>
                      <button className="block w-full rounded px-2 py-1 text-left text-xs text-base-200 hover:bg-base-800" onClick={() => applyClean("Title Case", toTitleCase)}>
                        Title Case
                      </button>
                      <button className="block w-full rounded px-2 py-1 text-left text-xs text-base-200 hover:bg-base-800" onClick={() => applyClean("Trim Space", trimSpace)}>
                        Trim whitespace
                      </button>
                      <button className="block w-full rounded px-2 py-1 text-left text-xs text-base-200 hover:bg-base-800" onClick={() => applyClean("Normalize Phone", normalizePhoneValue)}>
                        Normalize phone
                      </button>
                      <button className="block w-full rounded px-2 py-1 text-left text-xs text-base-200 hover:bg-base-800" onClick={() => applyClean("Normalize Name", normalizeNameValue)}>
                        Normalize name
                      </button>

                      <div className="my-2 h-px bg-base-800" />

                      <button
                        className="block w-full rounded px-2 py-1 text-left text-xs text-base-200 hover:bg-base-800"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowFindReplace(true);
                          setEditMenuOpen(false);
                        }}
                      >
                        Find &amp; Replace...
                      </button>

                      <div className="my-2 h-px bg-base-800" />

                      <span className="mb-1 block text-[10px] uppercase tracking-wide text-base-500">Cleanup</span>
                      <button className="block w-full rounded px-2 py-1 text-left text-xs text-base-200 hover:bg-base-800" onClick={applyRemoveEmptyRows}>
                        Delete empty rows
                      </button>
                      <button className="block w-full rounded px-2 py-1 text-left text-xs text-base-200 hover:bg-base-800" onClick={applyRemoveEmptyColumns}>
                        Delete empty columns
                      </button>
                      <button
                        className="block w-full rounded px-2 py-1 text-left text-xs text-base-200 hover:bg-base-800"
                        onClick={applyQuickClean}
                        title="Trim + Normalize Name + Normalize Phone, in 1 Undo step"
                      >
                        Quick Clean
                      </button>
                    </div>
                  )}

                  {g.key === "edit" && showFindReplace && (
                    <div
                      className="fixed left-1/2 top-24 z-40 w-72 -translate-x-1/2 rounded-lg border border-base-700 bg-base-900 p-3 shadow-2xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-base-200">Find &amp; Replace</span>
                        <button
                          className="text-base-500 hover:text-base-200"
                          onClick={() => setShowFindReplace(false)}
                        >
                          ✕
                        </button>
                      </div>
                      <label className="mb-1 block text-[10px] uppercase tracking-wide text-base-500">
                        Apply to column
                      </label>
                      <select
                        value={cleanColumn}
                        onChange={(e) => setCleanColumn(e.target.value)}
                        className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100"
                      >
                        {columnOrder.map((c) => (
                          <option key={c} value={c}>
                            {COLUMN_LABELS[c] ?? c}
                          </option>
                        ))}
                      </select>
                      <input
                        autoFocus
                        value={findText}
                        onChange={(e) => setFindText(e.target.value)}
                        placeholder="Find"
                        className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                      />
                      <input
                        value={replaceText}
                        onChange={(e) => setReplaceText(e.target.value)}
                        placeholder="Replace with"
                        className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                      />
                      <label className="mb-2 flex items-center gap-1 text-[11px] text-base-400">
                        <input
                          type="checkbox"
                          checked={findCaseSensitive}
                          onChange={(e) => setFindCaseSensitive(e.target.checked)}
                          className="accent-gold-500"
                        />
                        Case sensitive
                      </label>
                      <Button
                        onClick={() => {
                          applyFindReplace();
                          setShowFindReplace(false);
                        }}
                        className="w-full text-xs"
                      >
                        Apply
                      </Button>
                    </div>
                  )}

                  {g.key === "generate" && generateMenuOpen && (
                    <div
                      className="absolute left-0 z-30 mt-1 w-64 rounded-lg border border-base-700 bg-base-900 p-2 text-left shadow-2xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <label className="mb-1 block text-[10px] uppercase tracking-wide text-base-500">Type</label>
                      <select
                        value={genAction}
                        onChange={(e) => setGenAction(e.target.value as typeof genAction)}
                        className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                      >
                        <option value="id">Generate ID (→ Code column)</option>
                        <option value="running">Running Number</option>
                        <option value="displayPhone">Display Phone</option>
                        <option value="combine">Combine Columns</option>
                      </select>

                      {genAction === "id" && (
                        <>
                          <select
                            value={genIdMode}
                            onChange={(e) => setGenIdMode(e.target.value as typeof genIdMode)}
                            className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                          >
                            <option value="sequential">Sequential (0001, 0002...)</option>
                            <option value="random">Random</option>
                          </select>
                          <input
                            value={genIdPrefix}
                            onChange={(e) => setGenIdPrefix(e.target.value)}
                            placeholder="Prefix (e.g. KH)"
                            className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                          />
                        </>
                      )}

                      {genAction === "running" && (
                        <>
                          <input
                            value={runningCol}
                            onChange={(e) => setRunningCol(e.target.value)}
                            placeholder="Column name (e.g. stt)"
                            className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                          />
                          <input
                            type="number"
                            value={runningStart}
                            onChange={(e) => setRunningStart(Number(e.target.value))}
                            className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                          />
                        </>
                      )}

                      {genAction === "displayPhone" && (
                        <>
                          <input
                            value={displayPhoneCol}
                            onChange={(e) => setDisplayPhoneCol(e.target.value)}
                            placeholder="New column name"
                            className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                          />
                          <select
                            value={displayPhonePattern}
                            onChange={(e) => setDisplayPhonePattern(e.target.value as typeof displayPhonePattern)}
                            className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                          >
                            <option value="maskMost">0912xxx783 (keep start + last 3 digits)</option>
                            <option value="maskLast3">xxxxxxx783 (mask all but last 3 digits)</option>
                            <option value="last3">783 (last 3 digits only)</option>
                          </select>
                        </>
                      )}

                      {genAction === "combine" && (
                        <>
                          <input
                            value={combineCol}
                            onChange={(e) => setCombineCol(e.target.value)}
                            placeholder="New column name"
                            className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                          />
                          <select
                            multiple
                            value={combineSources}
                            onChange={(e) => setCombineSources(Array.from(e.target.selectedOptions, (o) => o.value))}
                            className="mb-2 h-24 w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100"
                          >
                            {columnOrder.map((c) => (
                              <option key={c} value={c}>
                                {COLUMN_LABELS[c] ?? c}
                              </option>
                            ))}
                          </select>
                          <input
                            value={combineSeparator}
                            onChange={(e) => setCombineSeparator(e.target.value)}
                            placeholder="Join with"
                            className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                          />
                        </>
                      )}

                      <Button
                        onClick={() => {
                          applyGenerate();
                          setGenerateMenuOpen(false);
                        }}
                        className="w-full text-xs"
                      >
                        Apply
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button className={toolbarBtn} onClick={history.undo} disabled={!history.canUndo} title="Undo (Ctrl+Z)">
                Undo
              </button>
              <button
                className={toolbarBtn}
                onClick={history.redo}
                disabled={!history.canRedo}
                title="Redo (Ctrl+Shift+Z)"
              >
                Redo
              </button>
              <div className="relative">
                <button
                  className={toolbarBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setHistoryMenuOpen((v) => !v);
                  }}
                >
                  History ({history.historyLabels.length})
                </button>
                {historyMenuOpen && (
                  <div
                    className="absolute right-0 z-30 mt-1 max-h-64 w-72 overflow-y-auto rounded-lg border border-base-700 bg-base-900 p-2 text-xs shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {history.historyLabels.length === 0 ? (
                      <span className="block px-2 py-1 text-base-500">No actions yet.</span>
                    ) : (
                      <ol className="space-y-0.5">
                        {history.historyLabels.map((label, i) => (
                          <li key={i}>
                            <button
                              className="block w-full rounded px-2 py-1 text-left text-base-200 hover:bg-base-800"
                              onClick={() => {
                                history.jumpTo(i + 1);
                                setHistoryMenuOpen(false);
                              }}
                              title="Roll back to right after this step"
                            >
                              {i + 1}. {label}
                            </button>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </div>
              {hasActiveFilterOrSort && (
                <button
                  className={`${toolbarBtn} text-gold-400`}
                  onClick={() => {
                    setColumnFilters({});
                    setSortColumn(null);
                  }}
                  title="Filter/sort active — click to clear"
                >
                  Filter/Sort active ✕
                </button>
              )}
              <span className="text-xs text-base-500">
                {history.dirty ? (
                  <span className="text-highlight-500">Unsaved</span>
                ) : (
                  <span className="text-teal-400">Saved</span>
                )}
              </span>
              <Button onClick={() => handleSave()} disabled={!history.dirty || saving} className="text-xs">
                {saving ? "Saving..." : "Save (Ctrl+S)"}
              </Button>
            </div>
          </div>

          {toast && (
            <div className="flex items-center justify-between border-b border-base-800 bg-teal-500/10 px-3 py-1.5 text-xs text-teal-400">
              {toast}
              <button onClick={() => setToast(null)} className="text-teal-400/70 hover:text-teal-400">
                x
              </button>
            </div>
          )}
          {error && (
            <div className="flex items-center justify-between border-b border-base-800 bg-danger-500/10 px-3 py-1.5 text-xs text-danger-500">
              {error}
              <button onClick={() => setError(null)} className="text-danger-500/70 hover:text-danger-500">
                x
              </button>
            </div>
          )}

          {/* Status bar — luôn hiển thị, cao cố định (2 dòng), không đổi kích thước khi đổi menu
              hay khi số lượng cảnh báo thay đổi. Phần hướng dẫn sử dụng sẽ đặt ở chỗ khác sau. */}
          <div className="flex h-14 flex-wrap content-start items-start gap-2 overflow-y-auto border-b border-base-800 bg-base-950 px-3 py-1.5">
            {issues.length === 0 ? (
              <span className="text-xs text-teal-400">No issues detected.</span>
            ) : (
              <>
                <button
                  onClick={() => setIssueFilter((f) => (f === "__any__" ? null : "__any__"))}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    issueFilter === "__any__" ? "bg-gold-500 text-base-950" : "bg-base-800 text-base-300 hover:bg-base-700"
                  }`}
                >
                  All issues ({issues.length})
                </button>
                {issueGroups.map((g) => (
                  <button
                    key={g.message}
                    onClick={() => setIssueFilter((f) => (f === g.message ? null : g.message))}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      issueFilter === g.message
                        ? "bg-danger-500 text-white"
                        : "bg-danger-500/10 text-danger-500 hover:bg-danger-500/20"
                    }`}
                  >
                    {g.message} ({g.count})
                  </button>
                ))}
                {issueFilter && (
                  <button className={toolbarBtn} onClick={() => setIssueFilter(null)}>
                    Clear filter
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            <table
              className="table-fixed text-left text-sm"
              style={{
                width: CHECKBOX_COL_WIDTH + columnOrder.reduce((sum, col) => sum + (columnWidths[col] ?? DEFAULT_COLUMN_WIDTH), 0),
              }}
            >
              <colgroup>
                <col style={{ width: CHECKBOX_COL_WIDTH }} />
                {columnOrder.map((col) => (
                  <col key={col} style={{ width: columnWidths[col] ?? DEFAULT_COLUMN_WIDTH }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-[5] bg-base-900 text-xs uppercase tracking-wide text-base-400">
                <tr>
                  <th className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selectedRowIds.size > 0 && selectedRowIds.size === visibleRows.length}
                      onChange={toggleSelectAll}
                      className="accent-gold-500"
                    />
                  </th>
                  {columnOrder.map((col) => (
                    <th
                      key={col}
                      draggable
                      onDragStart={() => setDragColKey(col)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleColumnDrop(col)}
                      onClick={(e) => {
                        if (e.shiftKey && lastSelectedCol && columnOrder.includes(lastSelectedCol)) {
                          const startIdx = columnOrder.indexOf(lastSelectedCol);
                          const endIdx = columnOrder.indexOf(col);
                          const [a, b] = [startIdx, endIdx].sort((x, y) => x - y);
                          setSelectedColKeys(new Set(columnOrder.slice(a, b + 1)));
                        } else if (e.metaKey || e.ctrlKey) {
                          setSelectedColKeys((prev) => {
                            const next = new Set(prev);
                            if (next.has(col)) next.delete(col);
                            else next.add(col);
                            return next;
                          });
                          setLastSelectedCol(col);
                        } else {
                          setSelectedColKeys(new Set([col]));
                          setLastSelectedCol(col);
                        }
                      }}
                      className={`relative cursor-move select-none px-3 py-2 font-medium ${
                        dragColKey === col ? "opacity-40" : selectedColKeys.has(col) ? "bg-gold-500/10" : ""
                      }`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ x: e.clientX, y: e.clientY, type: "column", col });
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="shrink-0 text-base-600" title="Drag to reorder column">
                          ⋮⋮
                        </span>
                        {renamingColumn === col ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => {
                              if (renameValue.trim() && renameValue.trim() !== col && !columnOrder.includes(renameValue.trim())) {
                                history.run(renameColumnCommand(col, renameValue.trim()));
                              }
                              setRenamingColumn(null);
                            }}
                            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                            className="w-24 border-b border-gold-500 bg-transparent text-xs normal-case text-base-100 outline-none"
                          />
                        ) : (
                          <span className="flex min-w-0 items-center gap-1" title={COLUMN_LABELS[col] ?? col}>
                            <span className="truncate">
                              {COLUMN_LABELS[col] ?? col}
                              {(col === "name" || col === "phone") && " *"}
                            </span>
                            {columnTypes[col] && columnTypes[col] !== "text" && (
                              <span className="shrink-0 rounded bg-gold-500/20 px-1 text-[9px] normal-case text-gold-400">
                                {COLUMN_TYPE_LABELS[columnTypes[col]]}
                              </span>
                            )}
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenColumnMenu(openColumnMenu === col ? null : col);
                          }}
                          className={`ml-auto shrink-0 rounded px-1 text-[10px] hover:text-base-200 ${
                            columnFilters[col]?.trim() || sortColumn === col ? "text-gold-400" : "text-base-600"
                          }`}
                          title="Filter / Sort"
                        >
                          ▾
                        </button>
                      </div>
                      <div
                        onMouseDown={(e) => handleColumnResizeStart(col, e)}
                        onClick={(e) => e.stopPropagation()}
                        draggable={false}
                        className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize select-none hover:bg-gold-500/50"
                        title="Drag to resize column"
                      />
                      {openColumnMenu === col && (
                        <div
                          className="absolute left-0 z-20 mt-1 w-48 rounded-lg border border-base-700 bg-base-900 p-2 text-left normal-case shadow-2xl"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="block w-full rounded px-2 py-1 text-left text-xs text-base-200 hover:bg-base-800"
                            onClick={() => {
                              setSortColumn(col);
                              setSortDirection("asc");
                            }}
                          >
                            Sort A → Z
                          </button>
                          <button
                            className="block w-full rounded px-2 py-1 text-left text-xs text-base-200 hover:bg-base-800"
                            onClick={() => {
                              setSortColumn(col);
                              setSortDirection("desc");
                            }}
                          >
                            Sort Z → A
                          </button>
                          {sortColumn === col && (
                            <button
                              className="block w-full rounded px-2 py-1 text-left text-xs text-base-500 hover:bg-base-800"
                              onClick={() => setSortColumn(null)}
                            >
                              Clear sort
                            </button>
                          )}
                          <div className="my-1.5 h-px bg-base-800" />
                          <input
                            autoFocus
                            value={columnFilters[col] ?? ""}
                            onChange={(e) => setColumnFilters((prev) => ({ ...prev, [col]: e.target.value }))}
                            placeholder="Search in column..."
                            className="w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500"
                          />
                          {!!columnFilters[col]?.trim() && (
                            <button
                              className="mt-1 block w-full rounded px-2 py-1 text-left text-xs text-base-500 hover:bg-base-800"
                              onClick={() =>
                                setColumnFilters((prev) => {
                                  const next = { ...prev };
                                  delete next[col];
                                  return next;
                                })
                              }
                            >
                              Clear filter
                            </button>
                          )}
                          <div className="my-1.5 h-px bg-base-800" />
                          <label className="mb-1 block text-[10px] uppercase tracking-wide text-base-500">
                            Data type
                          </label>
                          <select
                            value={columnTypes[col] ?? defaultColumnType(col)}
                            onChange={(e) => updateColumnType(col, e.target.value as ColumnType)}
                            className="w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100 outline-none focus:border-gold-500"
                          >
                            {(Object.keys(COLUMN_TYPE_LABELS) as ColumnType[]).map((t) => (
                              <option key={t} value={t}>
                                {COLUMN_TYPE_LABELS[t]}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-[10px] text-base-500">
                            {COLUMN_TYPE_HINTS[columnTypes[col] ?? defaultColumnType(col)]}
                          </p>
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-base-800 bg-base-950">
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={columnOrder.length + 1} className="px-4 py-8 text-center text-base-500">
                      {history.state.rows.length === 0 ? (
                        <>
                          No rows yet.{" "}
                          <button
                            className="text-gold-400 underline hover:text-gold-300"
                            onClick={() => history.run(insertRowsCommand(0, 1))}
                          >
                            + Add first row
                          </button>
                        </>
                      ) : (
                        "No rows to display."
                      )}
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row) => {
                    const trueIndex = history.state.rows.findIndex((r) => r.id === row.id);
                    const rowIssues = issuesByRow.get(row.id) ?? [];
                    const isDuplicate = duplicateRowIds.has(row.id);
                    return (
                      <tr
                        key={row.id}
                        draggable
                        onDragStart={() => setDragRowIndex(trueIndex)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleRowDrop(trueIndex)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, type: "row", rowId: row.id, rowIndex: trueIndex });
                        }}
                        className={`cursor-move ${
                          dragRowIndex === trueIndex ? "opacity-40" : isDuplicate ? "bg-danger-500/10" : row.__isNew ? "bg-teal-500/5" : ""
                        }`}
                      >
                        <td className="px-2 py-1">
                          <input
                            type="checkbox"
                            checked={selectedRowIds.has(row.id)}
                            onChange={() => toggleRowSelect(row.id)}
                            className="accent-gold-500"
                          />
                        </td>
                        {columnOrder.map((col) => {
                          const isEditing = editingCell?.rowId === row.id && editingCell?.col === col;
                          const isSelected = selectedCell?.rowId === row.id && selectedCell?.col === col;
                          const cellIssues = rowIssues.filter((i) => i.col === col);
                          const value = getCell(row, col);
                          return (
                            <td
                              key={col}
                              onClick={() => {
                                setSelectedCell({ rowId: row.id, col });
                                setSelectedColKeys(new Set());
                              }}
                              onDoubleClick={() => startEdit(row.id, col)}
                              className={`relative px-1 py-1 ${isSelected ? "ring-1 ring-inset ring-gold-500" : ""} ${
                                cellIssues.length > 0 ? "bg-danger-500/10" : selectedColKeys.has(col) ? "bg-gold-500/5" : ""
                              }`}
                            >
                              {isEditing ? (
                                <input
                                  autoFocus
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={commitEdit}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") commitEdit();
                                    if (e.key === "Escape") setEditingCell(null);
                                  }}
                                  className={inputClass}
                                />
                              ) : (
                                <div className="group/cell relative">
                                  <div
                                    title={value || undefined}
                                    className={`truncate px-1 py-1 text-sm ${cellIssues.length > 0 ? "text-danger-500" : "text-base-100"}`}
                                  >
                                    {value || <span className="text-base-600">—</span>}
                                  </div>
                                  {cellIssues.length > 0 && (
                                    <>
                                      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-danger-500 ring-2 ring-base-950" />
                                      <div className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-max max-w-[240px] rounded-md border border-danger-500/40 bg-base-900 px-2 py-1 text-[11px] leading-snug text-danger-400 shadow-xl group-hover/cell:block">
                                        {cellIssues.map((i) => i.message).join(" · ")}
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-50 min-w-[180px] rounded-lg border border-base-700 bg-base-900 py-1 text-sm shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === "row" &&
            (() => {
              const count = selectedRowIds.has(contextMenu.rowId) ? Math.max(selectedRowIds.size, 1) : 1;
              return (
                <>
                  <button
                    className="block w-full px-3 py-1.5 text-left text-base-200 hover:bg-base-800"
                    onClick={() => {
                      history.run(insertRowsCommand(contextMenu.rowIndex, count));
                      setContextMenu(null);
                    }}
                  >
                    Insert {count} row(s) above
                  </button>
                  <button
                    className="block w-full px-3 py-1.5 text-left text-base-200 hover:bg-base-800"
                    onClick={() => {
                      history.run(insertRowsCommand(contextMenu.rowIndex + 1, count));
                      setContextMenu(null);
                    }}
                  >
                    Insert {count} row(s) below
                  </button>
                  <div className="my-1 h-px bg-base-800" />
                  <button
                    className="block w-full px-3 py-1.5 text-left text-danger-500 hover:bg-base-800"
                    onClick={() => {
                      if (count > 1) {
                        deleteSelectedRows();
                      } else {
                        const cmd = deleteRowsCommand(history.state, [contextMenu.rowId]);
                        if (cmd) history.run(cmd);
                      }
                      setContextMenu(null);
                    }}
                  >
                    {count > 1 ? `Delete ${count} selected rows` : "Delete this row"}
                  </button>
                </>
              );
            })()}
          {contextMenu.type === "column" &&
            (() => {
              const count = selectedColKeys.has(contextMenu.col) ? Math.max(selectedColKeys.size, 1) : 1;
              const idx = columnOrder.indexOf(contextMenu.col);
              return (
                <>
                  <button
                    className="block w-full px-3 py-1.5 text-left text-base-200 hover:bg-base-800"
                    onClick={() => {
                      insertColumnsAt(idx, count);
                      setContextMenu(null);
                    }}
                  >
                    Insert {count} column(s) left
                  </button>
                  <button
                    className="block w-full px-3 py-1.5 text-left text-base-200 hover:bg-base-800"
                    onClick={() => {
                      insertColumnsAt(idx + 1, count);
                      setContextMenu(null);
                    }}
                  >
                    Insert {count} column(s) right
                  </button>
                  {!isCoreField(contextMenu.col) && (
                    <>
                      <div className="my-1 h-px bg-base-800" />
                      <button
                        className="block w-full px-3 py-1.5 text-left text-base-200 hover:bg-base-800"
                        onClick={() => {
                          setRenamingColumn(contextMenu.col);
                          setRenameValue(contextMenu.col);
                          setContextMenu(null);
                        }}
                      >
                        Rename column
                      </button>
                      <button
                        className="block w-full px-3 py-1.5 text-left text-danger-500 hover:bg-base-800"
                        onClick={() => {
                          if (confirm(`Delete column "${contextMenu.col}"? Its data in every row will be lost on Save.`)) {
                            history.run(removeColumnCommand(history.state, contextMenu.col));
                          }
                          setContextMenu(null);
                        }}
                      >
                        Delete column
                      </button>
                    </>
                  )}
                </>
              );
            })()}
        </div>
      )}
    </Modal>
  );
}

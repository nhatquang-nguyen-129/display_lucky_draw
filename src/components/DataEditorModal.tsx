import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { Participant, Session } from "@/types";
import { CORE_FIELDS, EditorRow, EditorState, getCell, isCoreField } from "@/lib/dataEditor/types";
import { useCommandHistory } from "@/lib/dataEditor/history";
import {
  addColumnCommand,
  addRowCommand,
  batchTransformCommand,
  combineColumnsCommand,
  combineCommands,
  deleteRowsCommand,
  displayPhoneCommand,
  findDuplicatePhoneIdsToRemove,
  findEmptyRowIds,
  editCellCommand,
  generateIdCommand,
  insertRowCommand,
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

type Group = "edit" | "clean" | "generate" | "validate";
const GROUPS: { key: Group; label: string }[] = [
  { key: "edit", label: "Edit" },
  { key: "clean", label: "Clean" },
  { key: "generate", label: "Generate" },
  { key: "validate", label: "Validate" },
];

const COLUMN_LABELS: Record<string, string> = { name: "Tên", phone: "SĐT", code: "Mã", email: "Email" };
const SUGGESTED_COLUMNS = ["facebook_post", "note", "zalo", "address", "team", "khu_vuc"];
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
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");

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
    setLoading(false);
  }

  function updateColumnType(col: string, type: ColumnType) {
    setColumnTypes((prev) => {
      const next = { ...prev, [col]: type };
      window.api.sessions.updateColumnTypes({ id: sessionId, columnTypes: next });
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

  const issues = useMemo(() => validateState(history.state, columnTypes), [history.state, columnTypes]);
  const issuesByRow = useMemo(() => groupIssuesByRow(issues), [issues]);
  const issueGroups = useMemo(() => groupIssuesByMessage(issues), [issues]);
  const duplicatePhoneIds = useMemo(
    () => new Set(issues.filter((i) => i.col === "phone" && i.message === "Giá trị trùng lặp").map((i) => i.rowId)),
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

  function toggleSelectAll() {
    setSelectedRowIds((prev) => (prev.size === visibleRows.length ? new Set() : new Set(visibleRows.map((r) => r.id))));
  }

  function deleteSelectedRows() {
    if (selectedRowIds.size === 0) return;
    const cmd = deleteRowsCommand(history.state, Array.from(selectedRowIds));
    if (cmd) history.run(cmd);
    setSelectedRowIds(new Set());
  }

  function handleAddColumn() {
    const name = newColumnName.trim();
    if (!name) return;
    if (isCoreField(name) || history.state.columns.includes(name)) {
      setError(`Cột "${name}" đã tồn tại.`);
      return;
    }
    history.run(addColumnCommand(name));
    setNewColumnName("");
    setError(null);
  }

  function applyClean(label: string, transform: (v: string) => string) {
    const cmd = batchTransformCommand(history.state, label, cleanColumn, transform);
    if (cmd) history.run(cmd);
    else setToast("Không có ô nào cần thay đổi.");
  }

  function applyQuickClean() {
    const cmd = combineCommands("Quick Clean (Trim + Normalize)", [
      batchTransformCommand(history.state, "Trim", "name", trimSpace),
      batchTransformCommand(history.state, "Trim", "phone", trimSpace),
      batchTransformCommand(history.state, "Normalize Name", "name", normalizeNameValue),
      batchTransformCommand(history.state, "Normalize Phone", "phone", normalizePhoneValue),
    ]);
    if (cmd) history.run(cmd);
    else setToast("Dữ liệu đã sạch, không có gì để chuẩn hoá.");
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
    else setToast("Không tìm thấy giá trị khớp.");
  }

  function applyRemoveEmptyRows() {
    const ids = findEmptyRowIds(history.state);
    if (ids.length === 0) {
      setToast("Không có dòng trống.");
      return;
    }
    const cmd = deleteRowsCommand(history.state, ids);
    if (cmd) history.run(cmd);
  }

  function applyRemoveEmptyColumns() {
    const cmd = removeEmptyColumnsCommand(history.state);
    if (cmd) history.run(cmd);
    else setToast("Không có cột trống.");
  }

  function applyRemoveDuplicates() {
    const ids = findDuplicatePhoneIdsToRemove(history.state);
    if (ids.length === 0) {
      setToast("Không phát hiện trùng lặp theo SĐT.");
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
      setToast(silent ? `Đã tự động lưu lúc ${new Date().toLocaleTimeString("vi-VN")}.` : "Đã lưu thay đổi.");
      onSaved();
    } catch {
      if (!silent) setError("Lưu thất bại — thử lại.");
    } finally {
      setSaving(false);
    }
  }

  function requestClose() {
    if (history.dirty) {
      if (!confirm("Data Editor còn thay đổi chưa lưu. Đóng và bỏ qua thay đổi?")) return;
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
    <Modal open={open} title="Data Editor — Người chơi" onClose={requestClose} maxWidth="max-w-[95vw]">
      {loading ? (
        <div className="py-12 text-center text-sm text-base-400">Đang tải dữ liệu...</div>
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
                <button
                  key={g.key}
                  onClick={() => setActiveGroup(g.key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    activeGroup === g.key ? "bg-gold-500 text-base-950" : "text-base-300 hover:bg-base-800"
                  }`}
                >
                  {g.label}
                  {g.key === "validate" && issues.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-danger-500 px-1.5 text-[10px] text-white">
                      {issues.length}
                    </span>
                  )}
                </button>
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
              <button className={toolbarBtn} onClick={() => setShowHistoryPanel((v) => !v)}>
                Lịch sử ({history.historyLabels.length})
              </button>
              {hasActiveFilterOrSort && (
                <button
                  className={`${toolbarBtn} text-gold-400`}
                  onClick={() => {
                    setColumnFilters({});
                    setSortColumn(null);
                  }}
                  title="Đang lọc/sắp xếp — bấm để xoá hết"
                >
                  Lọc/Sắp xếp đang bật ✕
                </button>
              )}
              <span className="text-xs text-base-500">
                {history.dirty ? (
                  <span className="text-highlight-500">Chưa lưu</span>
                ) : (
                  <span className="text-teal-400">Đã lưu</span>
                )}
              </span>
              <Button onClick={() => handleSave()} disabled={!history.dirty || saving} className="text-xs">
                {saving ? "Đang lưu..." : "Save (Ctrl+S)"}
              </Button>
            </div>
          </div>

          {showHistoryPanel && (
            <div className="max-h-28 overflow-y-auto border-b border-base-800 bg-base-950 px-3 py-2 text-xs text-base-400">
              {history.historyLabels.length === 0 ? (
                <span>Chưa có thao tác nào.</span>
              ) : (
                <ol className="space-y-0.5">
                  {history.historyLabels.map((label, i) => (
                    <li key={i}>
                      {i + 1}. {label}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

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

          <div className="flex flex-wrap items-center gap-2 border-b border-base-800 bg-base-950 px-1 py-2">
            {activeGroup === "edit" && (
              <>
                <button className={toolbarBtn} onClick={() => history.run(addRowCommand())}>
                  + Thêm dòng
                </button>
                <button
                  className={toolbarBtn}
                  onClick={deleteSelectedRows}
                  disabled={selectedRowIds.size === 0}
                >
                  Xoá {selectedRowIds.size > 0 ? `${selectedRowIds.size} dòng` : "dòng đã chọn"}
                </button>
                <div className="mx-1 h-5 w-px bg-base-800" />
                <input
                  list="suggested-columns"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddColumn()}
                  placeholder="Tên cột mới (vd: facebook_post)"
                  className="w-56 rounded-lg border border-base-700 bg-base-800 px-2.5 py-1.5 text-xs text-base-100 outline-none focus:border-gold-500"
                />
                <datalist id="suggested-columns">
                  {SUGGESTED_COLUMNS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                <button className={toolbarBtn} onClick={handleAddColumn}>
                  + Thêm cột
                </button>
                <span className="ml-auto text-[11px] text-base-500">
                  Click chọn ô · Đúp-click để sửa · Ctrl+C/Ctrl+V để copy/paste (dán được cả từ Excel)
                </span>
              </>
            )}

            {activeGroup === "clean" && (
              <>
                <label className="text-xs text-base-400">Áp dụng cho cột:</label>
                <select
                  value={cleanColumn}
                  onChange={(e) => setCleanColumn(e.target.value)}
                  className="rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                >
                  {columnOrder.map((c) => (
                    <option key={c} value={c}>
                      {COLUMN_LABELS[c] ?? c}
                    </option>
                  ))}
                </select>
                <button className={toolbarBtn} onClick={() => applyClean("Trim Space", trimSpace)}>
                  Trim Space
                </button>
                <button className={toolbarBtn} onClick={() => applyClean("Upper Case", toUpperCase)}>
                  Upper Case
                </button>
                <button className={toolbarBtn} onClick={() => applyClean("Lower Case", toLowerCase)}>
                  Lower Case
                </button>
                <button className={toolbarBtn} onClick={() => applyClean("Title Case", toTitleCase)}>
                  Title Case
                </button>
                <button className={toolbarBtn} onClick={() => applyClean("Normalize Phone", normalizePhoneValue)}>
                  Normalize Phone
                </button>
                <button className={toolbarBtn} onClick={() => applyClean("Normalize Name", normalizeNameValue)}>
                  Normalize Name
                </button>
                <div className="mx-1 h-5 w-px bg-base-800" />
                <input
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  placeholder="Tìm"
                  className="w-24 rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                />
                <input
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder="Thay bằng"
                  className="w-24 rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                />
                <label className="flex items-center gap-1 text-[11px] text-base-400">
                  <input
                    type="checkbox"
                    checked={findCaseSensitive}
                    onChange={(e) => setFindCaseSensitive(e.target.checked)}
                    className="accent-gold-500"
                  />
                  Phân biệt hoa/thường
                </label>
                <button className={toolbarBtn} onClick={applyFindReplace}>
                  Find &amp; Replace
                </button>
                <div className="mx-1 h-5 w-px bg-base-800" />
                <button className={toolbarBtn} onClick={applyRemoveEmptyRows}>
                  Remove Empty Rows
                </button>
                <button className={toolbarBtn} onClick={applyRemoveEmptyColumns}>
                  Remove Empty Columns
                </button>
                <button className={toolbarBtn} onClick={applyRemoveDuplicates}>
                  Remove Duplicates (SĐT)
                </button>
                <div className="mx-1 h-5 w-px bg-base-800" />
                <button className={`${toolbarBtn} bg-base-800`} onClick={applyQuickClean} title="Trim + Normalize Name + Normalize Phone, trong 1 bước Undo">
                  Quick Clean
                </button>
              </>
            )}

            {activeGroup === "generate" && (
              <>
                <select
                  value={genAction}
                  onChange={(e) => setGenAction(e.target.value as typeof genAction)}
                  className="rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                >
                  <option value="id">Generate ID (→ cột Mã)</option>
                  <option value="running">Running Number</option>
                  <option value="displayPhone">Display Phone</option>
                  <option value="combine">Combine Columns</option>
                </select>

                {genAction === "id" && (
                  <>
                    <select
                      value={genIdMode}
                      onChange={(e) => setGenIdMode(e.target.value as typeof genIdMode)}
                      className="rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                    >
                      <option value="sequential">Tuần tự (0001, 0002...)</option>
                      <option value="random">Ngẫu nhiên</option>
                    </select>
                    <input
                      value={genIdPrefix}
                      onChange={(e) => setGenIdPrefix(e.target.value)}
                      placeholder="Tiền tố (vd: KH)"
                      className="w-28 rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                    />
                  </>
                )}

                {genAction === "running" && (
                  <>
                    <input
                      value={runningCol}
                      onChange={(e) => setRunningCol(e.target.value)}
                      placeholder="Tên cột (vd: stt)"
                      className="w-32 rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                    />
                    <input
                      type="number"
                      value={runningStart}
                      onChange={(e) => setRunningStart(Number(e.target.value))}
                      className="w-20 rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                    />
                  </>
                )}

                {genAction === "displayPhone" && (
                  <>
                    <input
                      value={displayPhoneCol}
                      onChange={(e) => setDisplayPhoneCol(e.target.value)}
                      placeholder="Tên cột mới"
                      className="w-32 rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                    />
                    <select
                      value={displayPhonePattern}
                      onChange={(e) => setDisplayPhonePattern(e.target.value as typeof displayPhonePattern)}
                      className="rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                    >
                      <option value="maskMost">0912xxx783 (giữ đầu + 3 số cuối)</option>
                      <option value="maskLast3">xxxxxxx783 (che hết, giữ 3 số cuối)</option>
                      <option value="last3">783 (chỉ 3 số cuối)</option>
                    </select>
                  </>
                )}

                {genAction === "combine" && (
                  <>
                    <input
                      value={combineCol}
                      onChange={(e) => setCombineCol(e.target.value)}
                      placeholder="Tên cột mới"
                      className="w-28 rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                    />
                    <select
                      multiple
                      value={combineSources}
                      onChange={(e) => setCombineSources(Array.from(e.target.selectedOptions, (o) => o.value))}
                      className="h-8 w-40 rounded-lg border border-base-700 bg-base-800 px-2 py-1 text-xs text-base-100"
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
                      placeholder="Nối bằng"
                      className="w-20 rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                    />
                  </>
                )}

                <button className={`${toolbarBtn} bg-base-800`} onClick={applyGenerate}>
                  Áp dụng
                </button>
              </>
            )}

            {activeGroup === "validate" && (
              <>
                {issues.length === 0 ? (
                  <span className="text-xs text-base-300">Không phát hiện vấn đề.</span>
                ) : (
                  <>
                    <span className="text-xs text-base-300">
                      {issues.length} vấn đề trên {issuesByRow.size} dòng — bấm để lọc theo loại:
                    </span>
                    <button
                      onClick={() => setIssueFilter((f) => (f === "__any__" ? null : "__any__"))}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        issueFilter === "__any__" ? "bg-gold-500 text-base-950" : "bg-base-800 text-base-300 hover:bg-base-700"
                      }`}
                    >
                      Tất cả lỗi ({issues.length})
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
                        Bỏ lọc
                      </button>
                    )}
                  </>
                )}
                <span className="ml-auto text-[11px] text-base-500">
                  Gán "Loại dữ liệu" cho cột lạ (menu ▾ ở header) để Validate kiểm tra đúng quy tắc — vd cột "Số ĐT
                  liên hệ" → SĐT.
                </span>
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
                      className={`relative cursor-move select-none px-3 py-2 font-medium ${
                        dragColKey === col ? "opacity-40" : ""
                      }`}
                      onContextMenu={(e) => {
                        if (isCoreField(col)) return;
                        e.preventDefault();
                        setContextMenu({ x: e.clientX, y: e.clientY, type: "column", col });
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="shrink-0 text-base-600" title="Kéo để sắp xếp cột">
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
                          title="Lọc / Sắp xếp"
                        >
                          ▾
                        </button>
                      </div>
                      <div
                        onMouseDown={(e) => handleColumnResizeStart(col, e)}
                        draggable={false}
                        className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize select-none hover:bg-gold-500/50"
                        title="Kéo để đổi độ rộng cột"
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
                            Sắp xếp A → Z
                          </button>
                          <button
                            className="block w-full rounded px-2 py-1 text-left text-xs text-base-200 hover:bg-base-800"
                            onClick={() => {
                              setSortColumn(col);
                              setSortDirection("desc");
                            }}
                          >
                            Sắp xếp Z → A
                          </button>
                          {sortColumn === col && (
                            <button
                              className="block w-full rounded px-2 py-1 text-left text-xs text-base-500 hover:bg-base-800"
                              onClick={() => setSortColumn(null)}
                            >
                              Bỏ sắp xếp
                            </button>
                          )}
                          <div className="my-1.5 h-px bg-base-800" />
                          <input
                            autoFocus
                            value={columnFilters[col] ?? ""}
                            onChange={(e) => setColumnFilters((prev) => ({ ...prev, [col]: e.target.value }))}
                            placeholder="Tìm trong cột..."
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
                              Xoá bộ lọc
                            </button>
                          )}
                          <div className="my-1.5 h-px bg-base-800" />
                          <label className="mb-1 block text-[10px] uppercase tracking-wide text-base-500">
                            Loại dữ liệu
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
                      Không có dòng nào để hiển thị.
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row) => {
                    const trueIndex = history.state.rows.findIndex((r) => r.id === row.id);
                    const rowIssues = issuesByRow.get(row.id) ?? [];
                    const isDuplicate = duplicatePhoneIds.has(row.id);
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
                              onClick={() => setSelectedCell({ rowId: row.id, col })}
                              onDoubleClick={() => startEdit(row.id, col)}
                              className={`relative px-1 py-1 ${isSelected ? "ring-1 ring-inset ring-gold-500" : ""} ${
                                cellIssues.length > 0 ? "bg-danger-500/10" : ""
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
          {contextMenu.type === "row" && (
            <>
              <button
                className="block w-full px-3 py-1.5 text-left text-base-200 hover:bg-base-800"
                onClick={() => {
                  history.run(insertRowCommand(contextMenu.rowIndex));
                  setContextMenu(null);
                }}
              >
                Thêm dòng phía trên
              </button>
              <button
                className="block w-full px-3 py-1.5 text-left text-base-200 hover:bg-base-800"
                onClick={() => {
                  history.run(insertRowCommand(contextMenu.rowIndex + 1));
                  setContextMenu(null);
                }}
              >
                Thêm dòng phía dưới
              </button>
              <div className="my-1 h-px bg-base-800" />
              <button
                className="block w-full px-3 py-1.5 text-left text-danger-500 hover:bg-base-800"
                onClick={() => {
                  const cmd = deleteRowsCommand(history.state, [contextMenu.rowId]);
                  if (cmd) history.run(cmd);
                  setContextMenu(null);
                }}
              >
                Xoá dòng này
              </button>
            </>
          )}
          {contextMenu.type === "column" && (
            <>
              <button
                className="block w-full px-3 py-1.5 text-left text-base-200 hover:bg-base-800"
                onClick={() => {
                  setRenamingColumn(contextMenu.col);
                  setRenameValue(contextMenu.col);
                  setContextMenu(null);
                }}
              >
                Đổi tên cột
              </button>
              <button
                className="block w-full px-3 py-1.5 text-left text-danger-500 hover:bg-base-800"
                onClick={() => {
                  if (confirm(`Xoá cột "${contextMenu.col}"? Dữ liệu cột này ở mọi dòng sẽ mất khi Save.`)) {
                    history.run(removeColumnCommand(history.state, contextMenu.col));
                  }
                  setContextMenu(null);
                }}
              >
                Xoá cột
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

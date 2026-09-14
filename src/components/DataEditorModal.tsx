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
  findEmptyColumns,
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
  COLUMN_TYPE_LABELS,
  defaultColumnType,
  DUPLICATE_ISSUE_PREFIX,
  groupIssuesByMessage,
  groupIssuesByRow,
  isCoreFieldActive,
  resolveColumnForType,
  validateState,
} from "@/lib/dataEditor/validate";

interface DataEditorModalProps {
  open: boolean;
  sessionId: string;
  session: Session | null;
  onClose: () => void;
  onSaved: () => void;
}

// Menu = ĐỘNG TỪ thuần (giống Google Sheets). Phạm vi (cột/dòng/ô) do người dùng chọn TRỰC TIẾP trên
// bảng — không menu nào chứa selector cột/dòng nữa (trước đây nhồi dropdown "Apply to column" +
// checkbox list dedup nên menu dài vô hạn).
type Group = "edit" | "format" | "automate" | "generate";
const GROUPS: { key: Group; label: string }[] = [
  { key: "edit", label: "Edit" },
  { key: "format", label: "Format" },
  { key: "automate", label: "Automate" },
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
  // Popup riêng cho menu Automate — KHÔNG dùng chung `toast` (status bar chỉ để báo tình trạng dữ
  // liệu theo Data Type, không phải nơi hỏi/báo kết quả của 1 hành động vừa bấm). `onConfirm` vắng
  // mặt = popup thông tin thuần (chỉ có nút X để đóng); có `onConfirm` = popup hỏi Confirm/Cancel.
  const [automatePopup, setAutomatePopup] = useState<{ message: string; onConfirm?: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const history = useCommandHistory({ columns: [], rows: [] } as EditorState);

  const [openMenu, setOpenMenu] = useState<Group | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
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

  const [showFindReplace, setShowFindReplace] = useState(false);
  const [selectedColKeys, setSelectedColKeys] = useState<Set<string>>(new Set());
  const [lastSelectedCol, setLastSelectedCol] = useState<string | null>(null);

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
  const [combineSeparator, setCombineSeparator] = useState(" - ");

  const [issueFilter, setIssueFilter] = useState<string | null>(null); // null = không lọc, "__any__" = mọi lỗi, hoặc đúng message 1 loại lỗi
  const [columnTypes, setColumnTypes] = useState<Record<string, ColumnType>>({});
  // Nhãn hiển thị TÙY BIẾN cho cột (đổi qua "Rename column") — với cột lõi chỉ là nhãn, dữ liệu vẫn ở
  // cột SQL name/phone/... Lưu trong session.participant_column_labels. Cột phụ đổi tên bằng
  // renameColumnCommand (đổi key thật) nên không cần ở đây.
  const [columnLabels, setColumnLabels] = useState<Record<string, string>>({});
  const labelFor = (col: string) => columnLabels[col] ?? COLUMN_LABELS[col] ?? col;

  // Core field (name/phone/code/email) chỉ hiện khi thực sự có dữ liệu — import generic để trống cả
  // 4 field này lúc mới import (xem docs/participants/import.md), "gán nhãn" giờ chỉ là chọn Data
  // Type cho 1 cột phụ, không còn bước nào di chuyển dữ liệu vào core field nữa. Tính lại mỗi khi
  // rows đổi (không phụ thuộc columns) nên tự ẩn/hiện đúng lúc, không cần state "đã xoá" riêng.
  const activeCoreFields = useMemo(
    () => CORE_FIELDS.filter((c) => isCoreFieldActive(c, history.state)),
    [history.state]
  );
  const activeCoreFieldsKey = activeCoreFields.join("|");

  // Thứ tự hiển thị cột — riêng biệt với history (kéo-thả cột chỉ là view, không cần Undo).
  // Đồng bộ lại mỗi khi có cột optional được thêm/xoá qua command, hoặc 1 core field bắt đầu/hết có dữ liệu.
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  useEffect(() => {
    setColumnOrder((prev) => {
      const all = [...activeCoreFields, ...history.state.columns];
      const kept = prev.filter((c) => all.includes(c));
      const missing = all.filter((c) => !kept.includes(c));
      return [...kept, ...missing];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.state.columns, activeCoreFieldsKey]);

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
    setSelectedColKeys(new Set());
    setSelectedCell(null);
    if (session?.participant_column_labels) {
      try {
        setColumnLabels(JSON.parse(session.participant_column_labels));
      } catch {
        setColumnLabels({});
      }
    } else {
      setColumnLabels({});
    }
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

  // Đổi NHÃN hiển thị của 1 cột (chủ yếu cho cột lõi — cột phụ đổi tên bằng renameColumnCommand).
  // label rỗng / trùng nhãn mặc định → xoá override.
  function setColumnLabel(col: string, label: string) {
    setColumnLabels((prev) => {
      const next = { ...prev };
      if (!label.trim() || label.trim() === (COLUMN_LABELS[col] ?? col)) delete next[col];
      else next[col] = label.trim();
      window.api.sessions.updateColumnLabels({ id: sessionId, columnLabels: next });
      return next;
    });
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId]);

  // `Modal.tsx` không tự focus con khi mở — thiếu bước này thì Ctrl/Cmd+Z/Y/S và mọi phím tắt khác
  // trong handleKeyDown() im lặng không chạy gì cho tới khi người dùng tự bấm chuột vào trong bảng
  // trước (bug đã gặp thật: mở Data Editor lên bấm Ctrl+Z ngay không có phản ứng gì). Container chỉ
  // thật sự mount khi `!loading` (xem ternary Loading.../bảng bên dưới) nên focus phải đợi đúng lúc đó
  // — `load()` cũng chạy lại sau mỗi lần Save, container remount lại, focus lại là chủ đích (giữ phím
  // tắt luôn "nóng" ngay sau khi tải/lưu xong, không có ô nào đang edit dở để tranh giành focus lúc đó
  // vì handleKeyDown đã tự chặn hết khi `editingCell` còn set).
  useEffect(() => {
    if (open && !loading) containerRef.current?.focus();
  }, [open, loading]);

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

  // Cột đích cho các action Format/Data — LẤY TỪ SELECTION trên bảng, không có selector trong menu:
  // ưu tiên các cột đang bôi ở header (selectedColKeys), nếu chưa bôi cột nào thì dùng cột chứa ô con
  // trỏ đang ở (selectedCell) — luôn có 1 mục tiêu, giống Google Sheets. Rỗng = chưa chọn gì cả.
  const targetColumns = useMemo(() => {
    if (selectedColKeys.size > 0) return columnOrder.filter((c) => selectedColKeys.has(c));
    if (selectedCell) return [selectedCell.col];
    return [];
  }, [selectedColKeys, selectedCell, columnOrder]);
  const targetColumnLabel = targetColumns.map((c) => labelFor(c)).join(", ");

  // duplicateColumns của validateState = targetColumns (cột đang bôi trên bảng NGAY LÚC NÀY) — không
  // phải config đã lưu. Chưa bôi cột nào → mảng rỗng → chip "Duplicated Rows" tự biến mất khỏi status
  // bar, không cần chọn cột nào để "tắt" nó (xem findDuplicateIssues trong validate.ts).
  const issues = useMemo(
    () => validateState(history.state, columnTypes, targetColumns),
    [history.state, columnTypes, targetColumns]
  );

  // Đếm trước (không phải lúc bấm) để menu Automate tự vô hiệu hoá mục nào không có gì để làm —
  // "chỉ available khi có đủ điều kiện" thay vì bấm xong mới báo "No empty rows."
  const emptyRowCount = useMemo(() => findEmptyRowIds(history.state).length, [history.state]);
  const emptyColumnCount = useMemo(() => findEmptyColumns(history.state).length, [history.state]);
  // Duplicate PHỤ THUỘC cột đang bôi (targetColumns) — khác 2 cái trên (luôn tính được, không cần chọn
  // gì). Chưa bôi cột nào thì không tính (0), nhưng nút KHÔNG bị disable vì lý do "chưa chọn" — bấm
  // vào sẽ tự báo yêu cầu chọn cột (xem applyRemoveDuplicates).
  const duplicateRowCount = useMemo(
    () => (targetColumns.length > 0 ? findDuplicateIdsToRemove(history.state, targetColumns).length : 0),
    [history.state, targetColumns]
  );
  const nameCol = useMemo(() => resolveColumnForType(history.state, columnTypes, "name"), [history.state, columnTypes]);
  const phoneCol = useMemo(() => resolveColumnForType(history.state, columnTypes, "phone"), [history.state, columnTypes]);
  const issuesByRow = useMemo(() => groupIssuesByRow(issues), [issues]);
  const issueGroups = useMemo(() => groupIssuesByMessage(issues), [issues]);
  const duplicateRowIds = useMemo(
    () => new Set(issues.filter((i) => i.message.startsWith(DUPLICATE_ISSUE_PREFIX)).map((i) => i.rowId)),
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

  // Bỏ filter issue khi loại issue đang chọn không còn tồn tại (đã sửa hết) — nếu không, chip
  // "Clear filter" bị ẩn (issues.length === 0) mà visibleRows vẫn rỗng, kẹt ở "No rows to display".
  useEffect(() => {
    if (!issueFilter) return;
    const stillExists =
      issueFilter === "__any__" ? issues.length > 0 : issueGroups.some((g) => g.message === issueFilter);
    if (!stillExists) setIssueFilter(null);
  }, [issueFilter, issues.length, issueGroups]);

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

  // Đóng menu toolbar (Edit/Format/Data/Generate) khi click ra ngoài
  useEffect(() => {
    if (!openMenu) return;
    const close = () => {
      setOpenMenu(null);
      setOpenSubmenu(null);
      setShowFindReplace(false);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openMenu]);

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

  // Xoá các cột đang bôi ở header. Cột phụ → drop hẳn key. Cột lõi → clear sạch giá trị (tự ẩn khỏi
  // editor ngay sau đó vì hết dữ liệu, xem activeCoreFields/removeColumnCommand). Tất cả trong 1 bước Undo.
  function deleteSelectedColumns() {
    const cols = Array.from(selectedColKeys).filter((c) => columnOrder.includes(c));
    if (cols.length === 0) return;
    const cmd = combineCommands(
      cols.length === 1 ? `Delete column "${cols[0]}"` : `Delete ${cols.length} columns`,
      cols.map((c) => removeColumnCommand(history.state, c))
    );
    if (cmd) history.run(cmd);
    setSelectedColKeys(new Set());
  }

  // Bàn hoàn toàn trống (chưa import, chưa nhập tay lần nào) → không có cột nào để gõ vào cả, vì
  // core field bị ẩn tới khi có dữ liệu (xem activeCoreFields) và cũng chưa có cột phụ nào. "+ Add
  // first row" lúc này tự thêm kèm 2 cột phụ gợi ý ("Name"/"Phone", KHÔNG phải core field — người
  // dùng đổi tên/xoá/gán Data Type tuỳ ý) để không rơi vào bảng trắng hoàn toàn không gõ được gì.
  function addFirstRow() {
    const isBlankSlate = history.state.columns.length === 0 && activeCoreFields.length === 0;
    if (isBlankSlate) {
      const cmd = combineCommands("Add first row", [insertColumnsCommand(["Name", "Phone"]), insertRowsCommand(0, 1)]);
      if (cmd) history.run(cmd);
    } else {
      history.run(insertRowsCommand(0, 1));
    }
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

  // Áp transform lên MỌI cột đang chọn (targetColumns). >1 cột → gộp thành 1 bước Undo.
  function applyClean(label: string, transform: (v: string) => string) {
    if (targetColumns.length === 0) {
      setToast("Select a column (click its header) or a cell first.");
      return;
    }
    const cmd = combineCommands(
      targetColumns.length === 1 ? label : `${label} · ${targetColumns.length} cols`,
      targetColumns.map((c) => batchTransformCommand(history.state, label, c, transform))
    );
    if (cmd) history.run(cmd);
    else setToast("No cells needed changes.");
    setOpenMenu(null);
  }

  function applyFindReplace() {
    if (!findText) return;
    if (targetColumns.length === 0) {
      setToast("Select a column (click its header) or a cell first.");
      return;
    }
    const transform = findReplaceTransform(findText, replaceText, findCaseSensitive);
    const label = `Find & Replace "${findText}"→"${replaceText}"`;
    const cmd = combineCommands(
      label,
      targetColumns.map((c) => batchTransformCommand(history.state, label, c, transform))
    );
    if (cmd) history.run(cmd);
    else setToast("No matching value found.");
  }

  // Mọi preset trong menu Automate xoá dữ liệu HÀNG LOẠT theo tiêu chí tự động (không phải người dùng
  // tự chọn từng dòng/cột) — LUÔN available (không disabled theo count), bấm vào là tự đếm ngay lúc
  // đó rồi hiện `automatePopup`: 0 kết quả → popup chỉ có nút X (không có gì để làm); có kết quả →
  // popup "Found N..." kèm Confirm/Cancel. KHÔNG dùng `toast`/status bar cho luồng này — status bar
  // chỉ dành báo tình trạng dữ liệu theo Data Type (xem Validate & Issues), không phải nơi hỏi/báo
  // kết quả của 1 hành động vừa bấm.
  function applyRemoveEmptyRows() {
    setOpenMenu(null);
    const ids = findEmptyRowIds(history.state);
    if (ids.length === 0) {
      setAutomatePopup({ message: "Found 0 empty row." });
      return;
    }
    setAutomatePopup({
      message: `Found ${ids.length} empty row(s). Are you sure you want to delete them?`,
      onConfirm: () => {
        const cmd = deleteRowsCommand(history.state, ids);
        if (cmd) history.run(cmd);
      },
    });
  }

  function applyRemoveEmptyColumns() {
    setOpenMenu(null);
    const emptyCols = findEmptyColumns(history.state);
    if (emptyCols.length === 0) {
      setAutomatePopup({ message: "Found 0 empty column." });
      return;
    }
    setAutomatePopup({
      message: `Found ${emptyCols.length} empty column(s). Are you sure you want to delete them?`,
      onConfirm: () => {
        const cmd = removeEmptyColumnsCommand(history.state);
        if (cmd) history.run(cmd);
      },
    });
  }

  // Cột xác định trùng = cột đang chọn trên bảng NGAY LÚC NÀY (targetColumns) — không còn config nào
  // lưu riêng nữa (đã bỏ sessions.participant_duplicate_columns khỏi luồng này, xem validate.ts) nên
  // không có gì để "âm thầm đổi" khi chỉ xem thử/Cancel; status bar cũng đọc thẳng targetColumns nên
  // luôn khớp 100% với con số ở đây. Chọn nhiều cột → phải trùng TẤT CẢ các cột đó cùng lúc mới tính
  // là 1 nhóm trùng (compound key, xem findDuplicateIdsToRemove).
  function applyRemoveDuplicates() {
    setOpenMenu(null);
    if (targetColumns.length === 0) {
      setAutomatePopup({ message: "Select at least 1 column header first to define what counts as a duplicate." });
      return;
    }
    const ids = findDuplicateIdsToRemove(history.state, targetColumns);
    if (ids.length === 0) {
      setAutomatePopup({ message: `Found 0 duplicate row(s) on: ${targetColumnLabel}.` });
      return;
    }
    setAutomatePopup({
      message: `Found ${ids.length} duplicate row(s) on: ${targetColumnLabel}. The most complete row in each group is kept. Are you sure you want to delete the rest?`,
      onConfirm: () => {
        const cmd = deleteRowsCommand(history.state, ids);
        if (cmd) history.run(cmd);
      },
    });
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
      // Nguồn để ghép = cột đang chọn trên bảng (theo đúng thứ tự hiển thị).
      if (!col || targetColumns.length === 0) {
        setToast("Select the source columns (click their headers) first.");
        return;
      }
      history.run(combineColumnsCommand(history.state, col, targetColumns, combineSeparator));
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
  // Menu toolbar (Edit/Format/Data): mỗi menu là 1 danh sách ĐỘNG TỪ ngắn, không có selector cột/dòng
  // bên trong, và KHÔNG lặp lại tên cột/dòng đang chọn bằng text — màu highlight trên chính bảng đã
  // đủ cho biết phạm vi đang tác động, nút nào không dùng được thì tự mờ đi (disabled).
  const menuBox =
    "absolute left-0 z-30 mt-1 w-56 rounded-lg border border-base-700 bg-base-900 p-1.5 text-left shadow-2xl";
  const menuItem =
    "block w-full rounded px-2 py-1.5 text-left text-xs text-base-200 hover:bg-base-800 disabled:cursor-not-allowed disabled:opacity-40";
  const selectedColsInView = Array.from(selectedColKeys).filter((c) => columnOrder.includes(c));

  // Submenu 2 cấp kiểu Google Sheets (Format > Text Capitalization > UPPER CASE...): hover 1 mục cấp 1
  // để mở flyout cấp 2 bên phải. `id` phải là duy nhất trong TOÀN BỘ toolbar (không chỉ trong 1 menu).
  function renderSubmenu(id: string, label: string, disabled: boolean, content: React.ReactNode, onOpen?: () => void) {
    return (
      <div
        key={id}
        className="relative"
        onMouseEnter={() => {
          if (disabled) return;
          onOpen?.();
          setOpenSubmenu(id);
        }}
      >
        <button type="button" disabled={disabled} className={`${menuItem} flex items-center justify-between gap-2`}>
          {label}
          <span className="text-base-500">▸</span>
        </button>
        {openSubmenu === id && !disabled && (
          <div
            className="absolute left-full top-0 z-40 -mt-1.5 ml-0.5 w-60 rounded-lg border border-base-700 bg-base-900 p-1.5 text-left shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {content}
          </div>
        )}
      </div>
    );
  }

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
          <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-base-800 bg-base-900 pb-2">
            <div className="flex gap-1">
              {GROUPS.map((g) => (
                <div key={g.key} className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenu((m) => (m === g.key ? null : g.key));
                      setOpenSubmenu(null);
                      setShowFindReplace(false);
                    }}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      openMenu === g.key ? "bg-gold-500 text-base-950" : "text-base-300 hover:bg-base-800"
                    }`}
                  >
                    {g.label}
                    <span className="ml-1 text-[9px] text-base-400">▾</span>
                  </button>

                  {g.key === "edit" && openMenu === "edit" && (
                    <div className={menuBox} onClick={(e) => e.stopPropagation()}>
                      {renderSubmenu(
                        "edit-delete",
                        "Delete",
                        selectedRowIds.size === 0 && selectedColsInView.length === 0,
                        <>
                          <button
                            className={`${menuItem} text-danger-500`}
                            disabled={selectedRowIds.size === 0}
                            onClick={() => {
                              deleteSelectedRows();
                              setOpenMenu(null);
                            }}
                          >
                            Rows{selectedRowIds.size > 0 ? ` (${selectedRowIds.size})` : ""}
                          </button>
                          <button
                            className={`${menuItem} text-danger-500`}
                            disabled={selectedColsInView.length === 0}
                            title="Click a column header to select it first. Deleting a core field (Name/Phone/Code/Email) clears all its values."
                            onClick={() => {
                              const coreHit = selectedColsInView.filter(isCoreField).map(labelFor);
                              if (
                                coreHit.length > 0 &&
                                !confirm(
                                  `Delete ${selectedColsInView.length} column(s)? This clears every value in ${coreHit.join(
                                    ", "
                                  )} on Save and can't be undone after that.`
                                )
                              )
                                return;
                              deleteSelectedColumns();
                              setOpenMenu(null);
                            }}
                          >
                            Columns{selectedColsInView.length > 0 ? ` (${selectedColsInView.length})` : ""}
                          </button>
                        </>
                      )}
                      <div className="my-1 h-px bg-base-800" />
                      <button
                        className={menuItem}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowFindReplace(true);
                          setOpenMenu(null);
                        }}
                      >
                        Find &amp; replace&hellip;
                      </button>
                    </div>
                  )}

                  {g.key === "format" && openMenu === "format" && (
                    <div className={menuBox} onClick={(e) => e.stopPropagation()}>
                      {renderSubmenu(
                        "format-case",
                        "Text Capitalization",
                        targetColumns.length === 0,
                        <>
                          <button className={menuItem} onClick={() => applyClean("Upper Case", toUpperCase)}>
                            UPPER CASE
                          </button>
                          <button className={menuItem} onClick={() => applyClean("Lower Case", toLowerCase)}>
                            lower case
                          </button>
                          <button className={menuItem} onClick={() => applyClean("Title Case", toTitleCase)}>
                            Title Case
                          </button>
                        </>
                      )}
                      <button className={menuItem} disabled={targetColumns.length === 0} onClick={() => applyClean("Trim Space", trimSpace)}>
                        Trim whitespace
                      </button>
                      {renderSubmenu(
                        "format-normalize",
                        "Normalize",
                        targetColumns.length === 0,
                        <>
                          <button className={menuItem} onClick={() => applyClean("Normalize Phone", normalizePhoneValue)}>
                            Normalize phone
                          </button>
                          <button className={menuItem} onClick={() => applyClean("Normalize Name", normalizeNameValue)}>
                            Normalize name
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {g.key === "automate" && openMenu === "automate" && (
                    <div className={menuBox} onClick={(e) => e.stopPropagation()}>
                      {renderSubmenu(
                        "automate-dedup",
                        "Deduplication",
                        false,
                        <>
                          <button className={menuItem} onClick={applyRemoveEmptyRows}>
                            Remove Empty Rows{emptyRowCount > 0 ? ` (${emptyRowCount})` : ""}
                          </button>
                          <button className={menuItem} onClick={applyRemoveEmptyColumns}>
                            Remove Empty Columns{emptyColumnCount > 0 ? ` (${emptyColumnCount})` : ""}
                          </button>
                          <button
                            className={menuItem}
                            title="With more than 1 column selected, a row must match on ALL of them to count as duplicate."
                            onClick={applyRemoveDuplicates}
                          >
                            Remove Duplicated Rows{duplicateRowCount > 0 ? ` (${duplicateRowCount})` : ""}
                          </button>
                        </>
                      )}
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

                  {g.key === "generate" && openMenu === "generate" && (
                    <div className={menuBox} onClick={(e) => e.stopPropagation()}>
                      {renderSubmenu(
                        "gen-id",
                        "Generate ID",
                        false,
                        <>
                          <p className="mb-1 px-1 text-[10px] text-base-500">Writes to the Code column</p>
                          <select
                            value={genIdMode}
                            onChange={(e) => setGenIdMode(e.target.value as typeof genIdMode)}
                            className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                          >
                            <option value="sequential">Sequential (auto-padded digits)</option>
                            <option value="random">Random</option>
                          </select>
                          <input
                            value={genIdPrefix}
                            onChange={(e) => setGenIdPrefix(e.target.value)}
                            placeholder="Prefix (e.g. KH)"
                            className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                          />
                          <Button
                            onClick={() => {
                              applyGenerate();
                              setOpenMenu(null);
                            }}
                            className="w-full text-xs"
                          >
                            Apply
                          </Button>
                        </>,
                        () => setGenAction("id")
                      )}
                      {renderSubmenu(
                        "gen-running",
                        "Running Number",
                        false,
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
                          <Button
                            onClick={() => {
                              applyGenerate();
                              setOpenMenu(null);
                            }}
                            className="w-full text-xs"
                          >
                            Apply
                          </Button>
                        </>,
                        () => setGenAction("running")
                      )}
                      {renderSubmenu(
                        "gen-displayPhone",
                        "Display Phone",
                        false,
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
                          <Button
                            onClick={() => {
                              applyGenerate();
                              setOpenMenu(null);
                            }}
                            className="w-full text-xs"
                          >
                            Apply
                          </Button>
                        </>,
                        () => setGenAction("displayPhone")
                      )}
                      {renderSubmenu(
                        "gen-combine",
                        "Combine Columns",
                        false,
                        <>
                          <input
                            value={combineCol}
                            onChange={(e) => setCombineCol(e.target.value)}
                            placeholder="New column name"
                            className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                          />
                          <input
                            value={combineSeparator}
                            onChange={(e) => setCombineSeparator(e.target.value)}
                            placeholder="Join with"
                            className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100"
                          />
                          <Button
                            onClick={() => {
                              applyGenerate();
                              setOpenMenu(null);
                            }}
                            className="w-full text-xs"
                          >
                            Apply
                          </Button>
                        </>,
                        () => setGenAction("combine")
                      )}
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
              <thead className="sticky top-0 z-20 bg-base-900 text-xs uppercase tracking-wide text-base-400">
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
                        } else if (selectedColKeys.size === 1 && selectedColKeys.has(col)) {
                          setSelectedColKeys(new Set());
                          setLastSelectedCol(null);
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
                              const next = renameValue.trim();
                              if (isCoreField(col)) {
                                // Cột lõi: chỉ đổi NHÃN, dữ liệu vẫn ở cột SQL name/phone/...
                                setColumnLabel(col, next);
                              } else if (next && next !== col && !columnOrder.includes(next)) {
                                history.run(renameColumnCommand(col, next));
                              }
                              setRenamingColumn(null);
                            }}
                            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                            className="w-24 border-b border-gold-500 bg-transparent text-xs normal-case text-base-100 outline-none"
                          />
                        ) : (
                          <span className="flex min-w-0 items-center gap-1" title={labelFor(col)}>
                            <span className="truncate">
                              {labelFor(col)}
                              {(col === nameCol || col === phoneCol) && " *"}
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
                          className="absolute left-0 z-40 mt-1 w-48 rounded-lg border border-base-700 bg-base-900 p-2 text-left normal-case shadow-2xl"
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
                          <button className="text-gold-400 underline hover:text-gold-300" onClick={addFirstRow}>
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
                  <div className="my-1 h-px bg-base-800" />
                  <button
                    className="block w-full px-3 py-1.5 text-left text-base-200 hover:bg-base-800"
                    onClick={() => {
                      const c = contextMenu.col;
                      setRenamingColumn(c);
                      setRenameValue(isCoreField(c) ? labelFor(c) : c);
                      setContextMenu(null);
                    }}
                  >
                    {isCoreField(contextMenu.col) ? "Rename column (label)" : "Rename column"}
                  </button>
                  <button
                    className="block w-full px-3 py-1.5 text-left text-danger-500 hover:bg-base-800"
                    onClick={() => {
                      const c = contextMenu.col;
                      const msg = isCoreField(c)
                        ? `Delete column "${labelFor(c)}"? This clears every value in it on Save and can't be undone after that.`
                        : `Delete column "${c}"? Its data in every row will be lost on Save.`;
                      if (confirm(msg)) {
                        history.run(removeColumnCommand(history.state, c));
                      }
                      setContextMenu(null);
                    }}
                  >
                    Delete column
                  </button>
                </>
              );
            })()}
        </div>
      )}

      {automatePopup && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
          onClick={() => setAutomatePopup(null)}
        >
          <div
            className="w-full max-w-xs rounded-lg border border-base-700 bg-base-900 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-sm text-base-100">{automatePopup.message}</p>
              <button
                onClick={() => setAutomatePopup(null)}
                className="shrink-0 text-base-400 hover:text-base-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {automatePopup.onConfirm && (
              <div className="flex justify-end gap-2">
                <button className={toolbarBtn} onClick={() => setAutomatePopup(null)}>
                  Cancel
                </button>
                <Button
                  onClick={() => {
                    automatePopup.onConfirm!();
                    setAutomatePopup(null);
                  }}
                  className="text-xs"
                >
                  Confirm
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

import { Fragment, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import Button from "./Button";
import { Participant, Session } from "@/types";
import { CORE_FIELDS, EditorRow, EditorState, getCell, isCoreField } from "@/lib/dataEditor/types";
import { useCommandHistory } from "@/lib/dataEditor/history";
import {
  applyChangesCommand,
  batchTransformCommand,
  combineCommands,
  deleteRowsCommand,
  displayPhoneCommand,
  DuplicateGroup,
  findDuplicateGroups,
  findDuplicateIdsToRemove,
  findEmptyColumns,
  findEmptyRowIds,
  editCellCommand,
  generateNumberCommand,
  insertColumnsCommand,
  insertRowsCommand,
  nextColumnNames,
  pasteBlockCommand,
  removeColumnCommand,
  removeEmptyColumnsCommand,
  renameColumnCommand,
  reorderRowsCommand,
} from "@/lib/dataEditor/commands";
import { findReplaceTransform, normalizeNameResult, normalizePhoneResult, toLowerCase, toTitleCase, toUpperCase, trimSpace } from "@/lib/dataEditor/transforms";
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
  onSaved: () => void;
  // Gọi lại NGAY sau khi đổi Data Type/nhãn cột (2 API ghi thẳng xuống DB, không qua nút Save chính)
  // — trước đây đọc thẳng `useSession().refresh` vì Data Editor luôn sống trong cửa sổ chính (cùng
  // SessionProvider); giờ Data Editor là 1 cửa sổ RIÊNG (xem DataEditorWindow.tsx), không có
  // SessionProvider nào để gọi `useSession()` — component cha (DataEditorWindow.tsx) tự quyết định
  // "refresh" nghĩa là gì (refetch `session` cục bộ của chính nó qua sessions:get). Xem doc-comment
  // đầy đủ tại nơi gọi bên dưới cho lý do vì sao bước này BẮT BUỘC, không phải optional.
  onSessionRefresh: () => void;
}

// Menu = ĐỘNG TỪ thuần (giống Google Sheets). Phạm vi (cột/dòng/ô) do người dùng chọn TRỰC TIẾP trên
// bảng — không menu nào chứa selector cột/dòng nữa (trước đây nhồi dropdown "Apply to column" +
// checkbox list dedup nên menu dài vô hạn).
// Generate không còn là menu cấp 1 riêng — giờ là 1 submenu ("Generate") NẰM TRONG Automate, cùng cấp
// với "Deduplication". 4 lựa chọn cũ (Generate ID/Running Number/Display Phone/Combine Columns) không
// còn mở flyout cấp 3 nữa — bấm 1 cái là mở thẳng popup (center + dim, xem genAction) để nhập.
type Group = "edit" | "format" | "automate";
const GROUPS: { key: Group; label: string }[] = [
  { key: "edit", label: "Edit" },
  { key: "format", label: "Format" },
  { key: "automate", label: "Data" },
];

const COLUMN_LABELS: Record<string, string> = { name: "Name", phone: "Phone", code: "Code", email: "Email" };
const AUTOSAVE_DELAY_MS = 20000;

// Ctrl/Cmd+Click trên ô có giá trị dạng URL (http/https) để mở bằng trình duyệt ngoài, dùng chung
// IPC "shell:openExternal" đã có sẵn cho action Open link của Landing Page — chỉ nhận http/https,
// khớp đúng whitelist scheme main process đã chặn (xem electron/main.ts).
const URL_RE = /^https?:\/\/\S+$/i;
function isUrlValue(value: string): boolean {
  return URL_RE.test(value.trim());
}
function openIfCtrlClickedUrl(e: ReactMouseEvent, value: string): boolean {
  if (!(e.ctrlKey || e.metaKey)) return false;
  const trimmed = value.trim();
  if (!isUrlValue(trimmed)) return false;
  e.preventDefault();
  e.stopPropagation();
  window.api.shell.openExternal(trimmed);
  return true;
}
/** Trong 1 duplicate group (popup Remove Duplicated Rows), gom các dòng GIỐNG Y HỆT NHAU ở MỌI cột
 * (không chỉ riêng cột dùng để xác định trùng) đứng CẠNH NHAU, mỗi cụm giống hệt nhau được đánh 1
 * `clusterIndex` tăng dần theo thứ tự xuất hiện — dùng để tô nền xen kẽ đậm/nhạt giữa các cụm liền kề
 * (xem chỗ gọi), giúp thấy ngay trong 1 nhóm trùng có bao nhiêu "biến thể" dữ liệu thật sự khác nhau
 * mà không cần dò từng ô. Không đổi thứ tự dùng để xoá (`g.rows` gốc), chỉ dùng để HIỂN THỊ. */
function clusterIdenticalRows(rows: EditorRow[], columnOrder: string[]): { row: EditorRow; clusterIndex: number }[] {
  const order: string[] = [];
  const buckets = new Map<string, EditorRow[]>();
  rows.forEach((r) => {
    // Nối bằng 1 ký tự điều khiển hiếm gặp (\u0001), KHÔNG nối trực tiếp — nối trực tiếp có thể đụng
    // hàng: cột A="AB"+cột B="C" và cột A="A"+cột B="BC" đều ra chung 1 chuỗi "ABC", bị coi nhầm là
    // 2 dòng giống hệt nhau dù dữ liệu thật khác nhau.
    const signature = columnOrder.map((c) => getCell(r, c)).join("");
    if (!buckets.has(signature)) {
      buckets.set(signature, []);
      order.push(signature);
    }
    buckets.get(signature)!.push(r);
  });
  return order.flatMap((signature, clusterIndex) => buckets.get(signature)!.map((row) => ({ row, clusterIndex })));
}

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

export default function DataEditorModal({ open, sessionId, session, onSaved, onSessionRefresh }: DataEditorModalProps) {
  // `session` là prop do CHA truyền vào (DataEditorWindow.tsx) — cha đó chỉ refetch khi mount / khi
  // `onSessionRefresh` được gọi, KHÔNG tự cập nhật khi đổi Data Type/nhãn cột (2 API lưu thẳng xuống
  // DB ngay, không qua nút Save chính). Thiếu gọi `onSessionRefresh()` sau khi lưu thì lần load() kế
  // tiếp (mỗi khi mở lại modal, xem effect bên dưới) sẽ đọc lại đúng bản session CŨ — làm mất Data
  // Type vừa gán (bug đã gặp thật: gán "Name" xong đóng/mở lại editor thì mất, trong khi Phone/URL
  // gán từ trước đó, lúc session còn mới, thì vẫn còn).
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [originalRows, setOriginalRows] = useState<EditorRow[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  // Hiện dòng "Last saved at ..." bên trái nút History — thay cho chip Saved/Unsaved cũ, cập nhật mỗi
  // lần save thành công (kể cả auto-save âm thầm), không cần phân biệt manual/silent.
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  // Popup riêng cho menu Automate — KHÔNG dùng chung `toast` (status bar chỉ để báo tình trạng dữ
  // liệu theo Data Type, không phải nơi hỏi/báo kết quả của 1 hành động vừa bấm). `onConfirm` vắng
  // mặt = popup thông tin thuần (chỉ có nút X để đóng); có `onConfirm` = popup hỏi Confirm/Cancel.
  const [automatePopup, setAutomatePopup] = useState<{ message: string; onConfirm?: () => void } | null>(null);
  // Preview lớn riêng cho Data > Normalize — khác automatePopup (popup nhỏ chỉ hỏi Yes/No) vì cần
  // hiện DANH SÁCH so sánh Hiện tại/Đề xuất để người dùng tự cuộn xem trước khi Confirm, không chỉ
  // đếm số lượng như Remove Empty Rows/Columns/Duplicated Rows. `selected` = tick bên trái mỗi dòng
  // (mặc định bật) — Confirm chỉ áp cho dòng đang tick, KHÔNG áp cho dòng `unresolved` dù có tick.
  const [normalizePreview, setNormalizePreview] = useState<{
    label: string;
    col: string;
    transform: (v: string) => string | null;
    changes: { rowId: string; before: string; after: string; unresolved: boolean; selected: boolean }[];
  } | null>(null);
  // Preview lớn riêng cho Data > Deduplicate > Remove Duplicated Rows — mỗi nhóm trùng hiện các dòng
  // kèm radio, người dùng tick chọn ĐÚNG 1 dòng muốn giữ (mặc định là dòng đầy đủ thông tin nhất,
  // xem findDuplicateGroups), Confirm mới xoá phần còn lại của từng nhóm.
  const [dedupPreview, setDedupPreview] = useState<{ groups: DuplicateGroup[]; keepIds: string[] } | null>(null);
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
  // Popup "Add Row.../Add Column..." (Edit > Add) — hỏi số lượng rồi Confirm/Cancel, cùng kiểu popup
  // nổi với Find & Replace bên dưới.
  const [addPrompt, setAddPrompt] = useState<{ kind: "row" | "column"; count: number } | null>(null);
  const [selectedColKeys, setSelectedColKeys] = useState<Set<string>>(new Set());
  const [lastSelectedCol, setLastSelectedCol] = useState<string | null>(null);

  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);

  // null = không popup Generate nào đang mở. Khác null = vừa chọn 1 mục trong Automate > Generate,
  // popup tương ứng đang hiện — cùng 1 state vừa chọn "sinh cái gì" vừa là cờ hiện/ẩn popup, không cần
  // 2 state rời. "Generate ID" (Sequential + Prefix) và "Running Number" (Plain/Zero-padded + Start)
  // đã GỘP LÀM 1 kind "number" duy nhất — Prefix rỗng = Running Number cũ, có Prefix = Generate ID cũ.
  // Random đã bỏ hẳn (không gian ký tự-số cố định 6 ký tự khó cho tuỳ chỉnh độ dài mà không thêm 1
  // field riêng, không đáng so với lợi ích).
  const [genAction, setGenAction] = useState<"number" | "displayPhone" | null>(null);
  // Mặc định "code" — giữ đúng hành vi Generate ID cũ (cột lõi Code) nếu không đổi gì.
  const [genNumberCol, setGenNumberCol] = useState("code");
  const [genNumberMode, setGenNumberMode] = useState<"plain" | "padded">("padded");
  const [genNumberPrefix, setGenNumberPrefix] = useState("");
  const [displayPhoneCol, setDisplayPhoneCol] = useState("display_phone");
  // Cột nguồn đọc số điện thoại — chỉ cần chọn khi có > 1 cột Data Type = Phone (xem phoneColumns),
  // đặt lại đúng lúc mở popup (xem chỗ setGenAction("displayPhone")) theo phoneCol mặc định.
  const [displayPhoneSourceCol, setDisplayPhoneSourceCol] = useState("");
  const [displayPhonePattern, setDisplayPhonePattern] = useState<"last3" | "maskLast3" | "maskMost">("maskMost");

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
  // Cột đang được RÊ QUA lúc kéo cột khác (khác dragColKey — đó là cột NGUỒN đang bị kéo) — dùng để vẽ
  // vạch chèn (xem chỗ render <th>), báo trước "nhả chuột ở đây thì cột kéo sẽ chèn vào NGAY TRƯỚC cột
  // này", đúng hành vi thật của handleColumnDrop bên dưới.
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
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
  // Lưu kèm toạ độ (không chỉ tên cột) để render dropdown này ở NGOÀI vùng scroll của bảng (`fixed`,
  // cùng kiểu với `contextMenu`) — trước đây dropdown nằm `absolute` NGAY TRONG <th>, tức là con của
  // <thead sticky>; Chromium có bug lâu năm: nội dung tràn ra khỏi 1 phần tử `position: sticky` bị
  // clip/vẽ sai lớp so với <tbody> đang cuộn CÙNG vùng scroll đó (dữ liệu dòng bên dưới "lộ" xuyên
  // qua dropdown dù z-index/background đều đúng) — xem báo cáo kèm ảnh khi vừa Normalize xong rồi mở
  // menu cột. Fix: đưa hẳn dropdown ra khỏi cây <thead>/<tbody>, định vị bằng toạ độ thật của nút bấm.
  const [openColumnMenu, setOpenColumnMenu] = useState<{ col: string; left: number; top: number } | null>(null);
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
      window.api.sessions.updateColumnTypes({ id: sessionId, columnTypes: next }).then(onSessionRefresh);
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
      window.api.sessions.updateColumnLabels({ id: sessionId, columnLabels: next }).then(onSessionRefresh);
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

  // Cột xác định trùng lặp CHỈ tính từ cột đang bôi Ở HEADER (selectedColKeys) — KHÔNG dùng chung
  // targetColumns ở trên (vốn fallback về cột chứa ô con trỏ, selectedCell). Click vào 1 ô bất kỳ để
  // sửa/xem dữ liệu là thao tác XẢY RA LIÊN TỤC, không phải ý định "kiểm tra trùng lặp trên cột này" —
  // nếu dùng chung targetColumns thì chỉ cần click sửa 1 ô Phone là chip "Duplicated Rows" tự bật NGẦM
  // dựa trên cột đó dù người dùng chưa hề chủ động bôi chọn gì (bug đã gặp thật). Chưa bôi header nào →
  // mảng rỗng → chip tự biến mất khỏi status bar, đúng tinh thần message "Select at least 1 column
  // header first" trong applyRemoveDuplicates bên dưới.
  const duplicateColumns = useMemo(
    () => columnOrder.filter((c) => selectedColKeys.has(c)),
    [selectedColKeys, columnOrder]
  );
  const duplicateColumnLabel = duplicateColumns.map((c) => labelFor(c)).join(", ");

  const issues = useMemo(
    () => validateState(history.state, columnTypes, duplicateColumns),
    [history.state, columnTypes, duplicateColumns]
  );

  // Đếm trước (không phải lúc bấm) để menu Automate tự vô hiệu hoá mục nào không có gì để làm —
  // "chỉ available khi có đủ điều kiện" thay vì bấm xong mới báo "No empty rows."
  const emptyRowCount = useMemo(() => findEmptyRowIds(history.state).length, [history.state]);
  const emptyColumnCount = useMemo(() => findEmptyColumns(history.state).length, [history.state]);
  // Duplicate PHỤ THUỘC cột đang bôi Ở HEADER (duplicateColumns) — khác 2 cái trên (luôn tính được,
  // không cần chọn gì). Chưa bôi cột nào thì không tính (0), nhưng nút KHÔNG bị disable vì lý do "chưa
  // chọn" — bấm vào sẽ tự báo yêu cầu chọn cột (xem applyRemoveDuplicates).
  const duplicateRowCount = useMemo(
    () => (duplicateColumns.length > 0 ? findDuplicateIdsToRemove(history.state, duplicateColumns).length : 0),
    [history.state, duplicateColumns]
  );
  const nameCol = useMemo(() => resolveColumnForType(history.state, columnTypes, "name"), [history.state, columnTypes]);
  const phoneCol = useMemo(() => resolveColumnForType(history.state, columnTypes, "phone"), [history.state, columnTypes]);
  // Mọi cột đang gán Data Type = Phone (không chỉ 1 cột "chính thức" như phoneCol ở trên) — dùng cho
  // dropdown "Source" trong popup Generate Display Phone, vì 1 session có thể có nhiều hơn 1 cột kiểu
  // Phone (vd cả "SĐT chính" lẫn "SĐT người thân" đều gán Phone).
  const phoneColumns = useMemo(
    () => columnOrder.filter((col) => (columnTypes[col] ?? defaultColumnType(col)) === "phone"),
    [columnOrder, columnTypes]
  );
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
    setDragOverCol(null);
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
  // first row" lúc này tự thêm kèm 1 cột phụ trống ("Column 1", CÙNG cơ chế sinh tên với Add Column/
  // Insert Column — xem nextColumnNames — KHÔNG còn gợi ý "Name"/"Phone" như trước, vì đó là NHÃN Ý
  // NGHĨA nên để người dùng tự gán qua Data Type, không đoán hộ) để không rơi vào bảng trắng hoàn
  // toàn không gõ được gì.
  function addFirstRow() {
    const isBlankSlate = history.state.columns.length === 0 && activeCoreFields.length === 0;
    if (isBlankSlate) {
      const names = nextColumnNames([...CORE_FIELDS, ...history.state.columns], 1);
      const cmd = combineCommands("Add first row", [insertColumnsCommand(names), insertRowsCommand(0, 1)]);
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

  // Xác nhận popup "Edit > Add > Add Row.../Add Column..." — luôn chèn ở CUỐI (không có 1 dòng/cột
  // tham chiếu nào như right-click, vì mở từ menu chứ không phải từ 1 vị trí cụ thể trên bảng).
  function applyAddPrompt() {
    if (!addPrompt) return;
    const count = Math.max(1, Math.floor(addPrompt.count) || 1);
    if (addPrompt.kind === "row") {
      if (history.state.columns.length === 0 && activeCoreFields.length === 0) {
        // Bàn hoàn toàn trống — thêm kèm 1 cột trống "Column 1" (giống nút "+ Add first row"), rồi
        // mới chèn đủ N dòng, để không rơi vào bảng trắng không gõ được gì.
        const names = nextColumnNames([...CORE_FIELDS, ...history.state.columns], 1);
        const cmd = combineCommands("Add rows", [insertColumnsCommand(names), insertRowsCommand(0, count)]);
        if (cmd) history.run(cmd);
      } else {
        history.run(insertRowsCommand(history.state.rows.length, count));
      }
    } else {
      insertColumnsAt(columnOrder.length, count);
    }
    setAddPrompt(null);
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

  // Normalize phone/name không thao tác trên targetColumns (cột đang chọn tuỳ ý trên bảng) mà LUÔN
  // áp thẳng vào cột đã được gán Data Type tương ứng (nameCol/phoneCol, xem resolveColumnForType) —
  // đây là preset theo cấu hình, không phải lệnh format tự do như applyClean. `transform` trả `null`
  // cho ô KHÔNG tự tin xử lý được (vd 2 số điện thoại dính nhau, tên dính link/ghi chú) — popup sẽ
  // báo "Unable to resolve" và luôn loại các ô này khỏi phần được áp dụng, dù có tick hay không.
  //
  // Trước khi Normalize có hiệu lực: tính trước danh sách ô sẽ đổi để hiện popup preview lớn cho
  // người dùng tự cuộn xem VÀ tick chọn dòng nào muốn áp (mặc định tick hết các dòng resolve được),
  // KHÔNG áp dụng ngay. Chỉ khi bấm Confirm trên popup mới thật sự ghi vào state (applyChangesCommand
  // với đúng các dòng đang tick).
  function openNormalizePreview(col: string | undefined, label: string, transform: (v: string) => string | null) {
    setOpenMenu(null);
    if (!col) return;
    const changes = history.state.rows
      .map((r) => {
        const before = getCell(r, col);
        const after = transform(before);
        if (after === null) return { rowId: r.id, before, after: "", unresolved: true, selected: false };
        if (after === before) return null;
        return { rowId: r.id, before, after, unresolved: false, selected: true };
      })
      .filter(
        (c): c is { rowId: string; before: string; after: string; unresolved: boolean; selected: boolean } =>
          c !== null
      );
    if (changes.length === 0) {
      setAutomatePopup({ message: `Found 0 row(s) needing ${label}.` });
      return;
    }
    setNormalizePreview({ label, col, transform, changes });
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

  // Cột xác định trùng = cột đang bôi Ở HEADER NGAY LÚC NÀY (duplicateColumns, KHÔNG fallback về ô
  // con trỏ — xem doc-comment ở chỗ khai báo) — không còn config nào lưu riêng nữa (đã bỏ
  // sessions.participant_duplicate_columns khỏi luồng này, xem validate.ts) nên không có gì để "âm
  // thầm đổi" khi chỉ xem thử/Cancel; status bar cũng đọc thẳng duplicateColumns nên luôn khớp 100%
  // với con số ở đây. Chọn nhiều cột → phải trùng TẤT CẢ các cột đó cùng lúc mới tính là 1 nhóm trùng
  // (compound key, xem findDuplicateGroups). Mở popup lớn cho từng nhóm — không tự xoá theo "đầy đủ
  // thông tin nhất" ngầm nữa, người dùng tick chọn dòng muốn giữ trong mỗi nhóm.
  function applyRemoveDuplicates() {
    setOpenMenu(null);
    if (duplicateColumns.length === 0) {
      setAutomatePopup({ message: "Select at least 1 column header first to define what counts as a duplicate." });
      return;
    }
    const groups = findDuplicateGroups(history.state, duplicateColumns);
    if (groups.length === 0) {
      setAutomatePopup({ message: `Found 0 duplicate row(s) on: ${duplicateColumnLabel}.` });
      return;
    }
    setDedupPreview({ groups, keepIds: groups.map((g) => g.defaultKeepId) });
  }

  function applyGenerate() {
    if (!genAction) return;
    if (genAction === "number") {
      const col = genNumberCol.trim();
      if (!col) return;
      history.run(generateNumberCommand(history.state, col, genNumberMode, genNumberPrefix.trim()));
    } else if (genAction === "displayPhone") {
      const col = displayPhoneCol.trim();
      const sourceCol = displayPhoneSourceCol || phoneCol;
      if (!col || !sourceCol) return;
      history.run(displayPhoneCommand(history.state, col, sourceCol, displayPhonePattern));
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
      setLastSavedAt(new Date());
      setToast(silent ? `Auto-saved at ${new Date().toLocaleTimeString("en-US")}.` : "Changes saved.");
      onSaved();
    } catch {
      if (!silent) setError("Save failed — try again.");
    } finally {
      setSaving(false);
    }
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
  // Popup "Automate > Generate > ...": mỗi field là 1 HÀNG 2 CỘT — nhãn cố định bề rộng bên trái,
  // control (input/select) chiếm hết phần còn lại bên phải — thay cho kiểu label-trên/control-dưới
  // trước đây. Field ĐẦU TIÊN luôn là "Name" (tên cột mới, mọi popup đều tạo 1 cột hoàn toàn mới).
  const popupRowLabel = "w-16 shrink-0 text-[11px] font-medium text-base-400";
  // truncate: tên option dài hơn bề rộng ô (vd "Sequential with Zero-padded Number (001, 002...)")
  // thì cắt bớt kèm "…" thay vì tràn/vỡ layout popup nhỏ max-w-xs.
  const popupRowInput =
    "min-w-0 flex-1 truncate rounded border border-base-700 bg-base-800 px-2 py-1.5 text-xs text-base-100";
  function renderPopupField(label: string, control: React.ReactNode) {
    return (
      <div className="mb-2 flex items-center gap-3 text-left">
        <span className={popupRowLabel}>{label}</span>
        {control}
      </div>
    );
  }
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

  if (!open) return null;

  // Render FULL cửa sổ (không còn bọc trong <Modal> nền tối + card canh giữa) — Data Editor giờ sống
  // trong 1 BrowserWindow RIÊNG (xem DataEditorWindow.tsx), giống hệt Landing Builder/Present Mode,
  // không phải 1 dialog nổi trong cửa sổ chính như trước. Không có nút Close/X riêng trong app nữa —
  // đóng qua chính khung cửa sổ (nút X thật/Alt+F4), đã được guard "còn thay đổi chưa lưu" ở main
  // process (electron/main.ts's openDataEditorWindow), CÙNG kiểu Landing Builder cũng không có nút
  // Close riêng trong UI của nó.
  return (
    <div className="flex h-screen w-screen flex-col bg-base-900 p-4">
      {loading ? (
        <div className="py-12 text-center text-sm text-base-400">Loading data...</div>
      ) : (
        <div
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="flex h-full flex-col outline-none"
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
                      setAddPrompt(null);
                      setGenAction(null);
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
                      <button
                        className={menuItem}
                        disabled={!history.canUndo}
                        title="Undo (Ctrl+Z)"
                        onClick={() => {
                          history.undo();
                          setOpenMenu(null);
                        }}
                      >
                        Undo
                      </button>
                      <button
                        className={menuItem}
                        disabled={!history.canRedo}
                        title="Redo (Ctrl+Shift+Z)"
                        onClick={() => {
                          history.redo();
                          setOpenMenu(null);
                        }}
                      >
                        Redo
                      </button>
                      <div className="my-1 h-px bg-base-800" />
                      {renderSubmenu(
                        "edit-add",
                        "Add",
                        false,
                        <>
                          <button
                            className={menuItem}
                            onClick={() => {
                              setAddPrompt({ kind: "row", count: 1 });
                              setOpenMenu(null);
                            }}
                          >
                            Add Row&hellip;
                          </button>
                          <button
                            className={menuItem}
                            onClick={() => {
                              setAddPrompt({ kind: "column", count: 1 });
                              setOpenMenu(null);
                            }}
                          >
                            Add Column&hellip;
                          </button>
                        </>
                      )}
                      <div className="my-1 h-px bg-base-800" />
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
                            Delete Rows{selectedRowIds.size > 0 ? ` (${selectedRowIds.size})` : ""}
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
                            Delete Columns{selectedColsInView.length > 0 ? ` (${selectedColsInView.length})` : ""}
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
                        "Change Case",
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
                    </div>
                  )}

                  {g.key === "automate" && openMenu === "automate" && (
                    <div className={menuBox} onClick={(e) => e.stopPropagation()}>
                      {renderSubmenu(
                        "automate-dedup",
                        "Deduplicate",
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
                      {renderSubmenu(
                        "automate-generate",
                        "Generate",
                        false,
                        <>
                          <button
                            className={menuItem}
                            onClick={() => {
                              setGenAction("number");
                              setOpenMenu(null);
                              setOpenSubmenu(null);
                            }}
                          >
                            Generate Number&hellip;
                          </button>
                          <button
                            className={menuItem}
                            onClick={() => {
                              setGenAction("displayPhone");
                              setDisplayPhoneSourceCol(phoneCol ?? phoneColumns[0] ?? "");
                              setOpenMenu(null);
                              setOpenSubmenu(null);
                            }}
                          >
                            Generate Display Phone&hellip;
                          </button>
                        </>
                      )}
                      {renderSubmenu(
                        "automate-normalize",
                        "Normalize",
                        false,
                        <>
                          <button
                            className={menuItem}
                            disabled={!phoneCol}
                            title={phoneCol ? undefined : "Set a column's Data Type to Phone first."}
                            onClick={() => openNormalizePreview(phoneCol, "Normalize Phone", normalizePhoneResult)}
                          >
                            Normalize Phone
                          </button>
                          <button
                            className={menuItem}
                            disabled={!nameCol}
                            title={nameCol ? undefined : "Set a column's Data Type to Name first."}
                            onClick={() => openNormalizePreview(nameCol, "Normalize Name", normalizeNameResult)}
                          >
                            Normalize Name
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {g.key === "edit" && showFindReplace && (
                    <div
                      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
                      onClick={() => setShowFindReplace(false)}
                    >
                      <div
                        className="relative w-full max-w-xs rounded-lg border border-base-700 bg-base-900 p-4 text-center shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="absolute right-3 top-3 text-base-500 hover:text-base-200"
                          onClick={() => setShowFindReplace(false)}
                          aria-label="Close"
                        >
                          ✕
                        </button>
                        <p className="mb-3 text-sm font-medium text-base-100">Find &amp; Replace</p>
                        <input
                          autoFocus
                          value={findText}
                          onChange={(e) => setFindText(e.target.value)}
                          placeholder="Find"
                          className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-center text-xs text-base-100"
                        />
                        <input
                          value={replaceText}
                          onChange={(e) => setReplaceText(e.target.value)}
                          placeholder="Replace with"
                          className="mb-2 w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-center text-xs text-base-100"
                        />
                        <label className="mb-3 flex items-center justify-center gap-1 text-[11px] text-base-400">
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
                    </div>
                  )}

                  {g.key === "edit" && addPrompt && (
                    <div
                      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
                      onClick={() => setAddPrompt(null)}
                    >
                      <div
                        className="relative w-full max-w-xs rounded-lg border border-base-700 bg-base-900 p-4 text-center shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="absolute right-3 top-3 text-base-500 hover:text-base-200"
                          onClick={() => setAddPrompt(null)}
                          aria-label="Close"
                        >
                          ✕
                        </button>
                        <p className="mb-3 text-sm font-medium text-base-100">
                          Add {addPrompt.kind === "row" ? "Rows" : "Columns"}
                        </p>
                        <label className="mb-1 block text-[10px] uppercase tracking-wide text-base-500">
                          Number of {addPrompt.kind === "row" ? "rows" : "columns"}
                        </label>
                        <input
                          autoFocus
                          type="number"
                          min={1}
                          value={addPrompt.count}
                          onChange={(e) => {
                            const n = Math.max(1, Math.floor(Number(e.target.value)) || 1);
                            setAddPrompt((p) => (p ? { ...p, count: n } : p));
                          }}
                          onKeyDown={(e) => e.key === "Enter" && applyAddPrompt()}
                          className="mb-3 w-full rounded border border-base-700 bg-base-800 px-2 py-1.5 text-center text-xs text-base-100"
                        />
                        <div className="flex justify-center gap-2">
                          <button
                            className="flex-1 rounded-md border border-base-700 px-2 py-1.5 text-xs text-base-300 hover:bg-base-800"
                            onClick={() => setAddPrompt(null)}
                          >
                            Cancel
                          </button>
                          <Button onClick={applyAddPrompt} className="flex-1 text-xs">
                            Confirm
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {g.key === "automate" && genAction && (
                    <div
                      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
                      onClick={() => setGenAction(null)}
                    >
                      <div
                        className="relative w-full max-w-xs rounded-lg border border-base-700 bg-base-900 p-4 text-center shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="absolute right-3 top-3 text-base-500 hover:text-base-200"
                          onClick={() => setGenAction(null)}
                          aria-label="Close"
                        >
                          ✕
                        </button>
                        <p className="mb-3 text-sm font-medium text-base-100">
                          {genAction === "number" && "Generate Number"}
                          {genAction === "displayPhone" && "Generate Display Phone"}
                        </p>

                        {genAction === "number" && (
                          <>
                            {renderPopupField(
                              "Name",
                              <input
                                autoFocus
                                value={genNumberCol}
                                onChange={(e) => setGenNumberCol(e.target.value)}
                                placeholder="e.g. code"
                                className={popupRowInput}
                              />
                            )}
                            {renderPopupField(
                              "Type",
                              <select
                                value={genNumberMode}
                                onChange={(e) => setGenNumberMode(e.target.value as typeof genNumberMode)}
                                className={popupRowInput}
                              >
                                <option value="plain">Sequential with Plain Number (1, 2, 3...)</option>
                                <option value="padded">Sequential with Zero-padded Number (001, 002...)</option>
                              </select>
                            )}
                            {renderPopupField(
                              "Prefix",
                              <input
                                value={genNumberPrefix}
                                onChange={(e) => setGenNumberPrefix(e.target.value)}
                                placeholder="Optional, e.g. KH"
                                className={popupRowInput}
                              />
                            )}
                          </>
                        )}

                        {genAction === "displayPhone" && (
                          <>
                            {renderPopupField(
                              "Name",
                              <input
                                autoFocus
                                value={displayPhoneCol}
                                onChange={(e) => setDisplayPhoneCol(e.target.value)}
                                placeholder="e.g. display_phone"
                                className={popupRowInput}
                              />
                            )}
                            {/* Luôn hiện (kể cả chỉ có đúng 1 lựa chọn) — dễ thấy/kiểm chứng đang đọc
                                từ cột nào, thay vì ẩn đi rồi phải đoán. Rỗng hẳn (chưa gán Data Type =
                                Phone cho cột nào) thì disable + báo lý do, giống nút Normalize Phone. */}
                            {renderPopupField(
                              "Source",
                              phoneColumns.length > 0 ? (
                                <select
                                  value={displayPhoneSourceCol}
                                  onChange={(e) => setDisplayPhoneSourceCol(e.target.value)}
                                  className={popupRowInput}
                                >
                                  {phoneColumns.map((col) => (
                                    <option key={col} value={col}>
                                      {labelFor(col)}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <select disabled className={`${popupRowInput} text-base-500`}>
                                  <option>Set a column's Data Type to Phone first.</option>
                                </select>
                              )
                            )}
                            {renderPopupField(
                              "Type",
                              <select
                                value={displayPhonePattern}
                                onChange={(e) => setDisplayPhonePattern(e.target.value as typeof displayPhonePattern)}
                                className={popupRowInput}
                              >
                                <option value="maskMost">First 4 and last 3 digits with mask</option>
                                <option value="maskLast3">Last 3 digits with mask</option>
                                <option value="last3">Last 3 digits with no mask</option>
                              </select>
                            )}
                          </>
                        )}

                        <Button
                          onClick={() => {
                            applyGenerate();
                            setGenAction(null);
                          }}
                          className="mt-1 w-full text-xs"
                        >
                          Apply
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {lastSavedAt && (
                <span className="text-xs text-base-500">Last saved at {lastSavedAt.toLocaleTimeString("en-US")}</span>
              )}
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
              <Button onClick={() => handleSave()} disabled={!history.dirty || saving} className="text-xs">
                {saving ? "Saving..." : "Save"}
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
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragColKey && dragColKey !== col) setDragOverCol(col);
                      }}
                      onDragLeave={() => setDragOverCol((c) => (c === col ? null : c))}
                      onDragEnd={() => {
                        setDragColKey(null);
                        setDragOverCol(null);
                      }}
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
                      {/* Vạch chèn — báo trước nhả chuột ở cột này thì cột đang kéo sẽ nằm NGAY TRƯỚC
                          nó (đúng hành vi handleColumnDrop, luôn chèn trước targetCol). */}
                      {dragOverCol === col && dragColKey && dragColKey !== col && (
                        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1 bg-gold-500" />
                      )}
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="shrink-0 text-base-600" title="Drag to reorder column">
                          ⋮⋮
                        </span>
                        {renamingColumn === col ? (
                          <input
                            autoFocus
                            draggable={false}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => {
                              const next = renameValue.trim();
                              if (isCoreField(col)) {
                                // Cột lõi: chỉ đổi NHÃN, dữ liệu vẫn ở cột SQL name/phone/...
                                setColumnLabel(col, next);
                              } else if (next && next !== col) {
                                // Rule: không cho phép 2 cột trùng tên (trùng key thật sẽ ghi đè dữ liệu
                                // lẫn nhau) — trước đây âm thầm bỏ qua không rename, giờ báo rõ lý do.
                                if (columnOrder.includes(next)) {
                                  setToast(`Column "${next}" already exists — choose a different name.`);
                                } else {
                                  history.run(renameColumnCommand(col, next));
                                }
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
                            if (openColumnMenu?.col === col) {
                              setOpenColumnMenu(null);
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setOpenColumnMenu({ col, left: rect.left, top: rect.bottom + 4 });
                            }
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
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-base-800 bg-base-950">
                {visibleRows.map((row) => {
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
                          const isUrl = !isEditing && isUrlValue(value);
                          return (
                            <td
                              key={col}
                              onClick={(e) => {
                                if (openIfCtrlClickedUrl(e, value)) return;
                                setSelectedCell({ rowId: row.id, col });
                                setSelectedColKeys(new Set());
                              }}
                              onDoubleClick={() => startEdit(row.id, col)}
                              className={`relative px-1 py-1 ${isSelected ? "ring-1 ring-inset ring-gold-500" : ""} ${
                                cellIssues.length > 0 ? "bg-danger-500/10" : selectedColKeys.has(col) ? "bg-gold-500/5" : ""
                              } ${isUrl ? "cursor-pointer" : ""}`}
                            >
                              {isEditing ? (
                                <input
                                  autoFocus
                                  draggable={false}
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
                                    title={value ? (isUrl ? `${value} — Ctrl+Click to open` : value) : undefined}
                                    className={`truncate px-1 py-1 text-sm ${
                                      cellIssues.length > 0 ? "text-danger-500" : isUrl ? "text-teal-600 underline" : "text-base-100"
                                    }`}
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
                  })}
              </tbody>
            </table>
            {/* Nằm NGOÀI <table> (không phải <td colSpan>) CỐ Ý — colSpan chỉ rộng bằng tổng các cột
                nó span qua; bàn trống (columnOrder.length === 0, core field ẩn tới khi có dữ liệu +
                chưa có cột phụ nào) từng khiến colSpan={1} chỉ rộng đúng 32px (cột checkbox), làm chữ
                bên trong vỡ dọc từng ký tự (bug đã gặp thật). Render như 1 block thường thì luôn rộng
                theo container, không lệ thuộc số cột hiện có. */}
            {visibleRows.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-base-500">
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
              </div>
            )}
          </div>
        </div>
      )}

      {openColumnMenu && (
        <div
          className="fixed z-50 w-48 rounded-lg border border-base-700 bg-base-900 p-2 text-left text-xs shadow-2xl"
          style={{ left: openColumnMenu.left, top: openColumnMenu.top }}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const col = openColumnMenu.col;
            return (
              <>
                <button
                  className="block w-full rounded px-2 py-1 text-left text-base-200 hover:bg-base-800"
                  onClick={() => {
                    setSortColumn(col);
                    setSortDirection("asc");
                  }}
                >
                  Sort A → Z
                </button>
                <button
                  className="block w-full rounded px-2 py-1 text-left text-base-200 hover:bg-base-800"
                  onClick={() => {
                    setSortColumn(col);
                    setSortDirection("desc");
                  }}
                >
                  Sort Z → A
                </button>
                {sortColumn === col && (
                  <button
                    className="block w-full rounded px-2 py-1 text-left text-base-500 hover:bg-base-800"
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
                  className="w-full rounded border border-base-700 bg-base-800 px-2 py-1 text-base-100 outline-none focus:border-gold-500"
                />
                {!!columnFilters[col]?.trim() && (
                  <button
                    className="mt-1 block w-full rounded px-2 py-1 text-left text-base-500 hover:bg-base-800"
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
                <label className="mb-1 block text-[10px] uppercase tracking-wide text-base-500">Data type</label>
                <select
                  value={columnTypes[col] ?? defaultColumnType(col)}
                  onChange={(e) => updateColumnType(col, e.target.value as ColumnType)}
                  className="w-full truncate rounded border border-base-700 bg-base-800 px-2 py-1 text-base-100 outline-none focus:border-gold-500"
                >
                  {(Object.keys(COLUMN_TYPE_LABELS) as ColumnType[]).map((t) => (
                    <option key={t} value={t}>
                      {COLUMN_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </>
            );
          })()}
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
            className="relative w-full max-w-xs rounded-lg border border-base-700 bg-base-900 p-4 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setAutomatePopup(null)}
              className="absolute right-3 top-3 text-base-400 hover:text-base-100"
              aria-label="Close"
            >
              ✕
            </button>
            <p className="mb-3 text-sm text-base-100">{automatePopup.message}</p>
            {automatePopup.onConfirm && (
              <div className="flex justify-center gap-2">
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

      {normalizePreview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
          onClick={() => setNormalizePreview(null)}
        >
          <div
            className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-base-700 bg-base-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setNormalizePreview(null)}
              className="absolute right-4 top-4 text-base-400 hover:text-base-100"
              aria-label="Close"
            >
              ✕
            </button>
            <h3 className="mb-1 pr-6 text-sm font-medium text-base-100">{normalizePreview.label}</h3>
            <p className="mb-3 text-xs text-base-400">
              {(() => {
                const unresolvedCount = normalizePreview.changes.filter((c) => c.unresolved).length;
                const selectedCount = normalizePreview.changes.filter((c) => !c.unresolved && c.selected).length;
                return (
                  <>
                    {selectedCount} row(s) selected to change
                    {unresolvedCount > 0 ? `, ${unresolvedCount} unable to resolve (always left unchanged)` : ""}.
                    Untick any row to keep it as-is, then Confirm to apply.
                  </>
                );
              })()}
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto rounded border border-base-800">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-base-800 text-[11px] uppercase tracking-wide text-base-400">
                  <tr>
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={normalizePreview.changes.every((c) => c.unresolved || c.selected)}
                        onChange={(e) =>
                          setNormalizePreview((p) =>
                            p
                              ? {
                                  ...p,
                                  changes: p.changes.map((c) => (c.unresolved ? c : { ...c, selected: e.target.checked })),
                                }
                              : p
                          )
                        }
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">Current value</th>
                    <th className="px-3 py-2 font-medium">Proposed value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-800">
                  {normalizePreview.changes.map((c) => (
                    <tr key={c.rowId} className={c.unresolved ? "opacity-60" : undefined}>
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          disabled={c.unresolved}
                          checked={c.selected}
                          onChange={(e) =>
                            setNormalizePreview((p) =>
                              p
                                ? {
                                    ...p,
                                    changes: p.changes.map((row) =>
                                      row.rowId === c.rowId ? { ...row, selected: e.target.checked } : row
                                    ),
                                  }
                                : p
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-1.5 text-danger-500">{c.before || "—"}</td>
                      <td className={`px-3 py-1.5 ${c.unresolved ? "italic text-base-500" : "text-base-200"}`}>
                        {c.unresolved ? "Unable to resolve" : c.after || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className={toolbarBtn} onClick={() => setNormalizePreview(null)}>
                Cancel
              </button>
              <Button
                onClick={() => {
                  const selected = normalizePreview.changes.filter((c) => !c.unresolved && c.selected);
                  const cmd = applyChangesCommand(normalizePreview.label, normalizePreview.col, selected);
                  if (cmd) history.run(cmd);
                  setNormalizePreview(null);
                }}
                className="text-xs"
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}

      {dedupPreview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
          onClick={() => setDedupPreview(null)}
        >
          <div
            className="relative flex max-h-[85vh] w-full max-w-5xl flex-col rounded-lg border border-base-700 bg-base-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setDedupPreview(null)}
              className="absolute right-4 top-4 text-base-400 hover:text-base-100"
              aria-label="Close"
            >
              ✕
            </button>
            <h3 className="mb-1 pr-6 text-sm font-medium text-base-100">Remove Duplicated Rows</h3>
            <p className="mb-3 text-xs text-base-400">
              {dedupPreview.groups.length} duplicate group(s) on: {duplicateColumnLabel}. Pick which row to keep in
              each group, then Confirm to delete the rest.
            </p>
            {/* Bảng gọn thay vì mỗi dòng 1 câu text tràn xuống — mỗi cột dữ liệu là 1 cột bảng, giá
                trị dài bị crop bằng truncate, xem đủ nội dung qua title (tooltip khi hover). */}
            <div className="min-h-0 flex-1 overflow-auto rounded">
              <table className="w-max min-w-full border-separate border-spacing-0 text-left text-xs">
                <thead className="sticky top-0 z-10 bg-base-800 text-[11px] uppercase tracking-wide text-base-400">
                  <tr>
                    <th className="w-8 px-2 py-1.5"></th>
                    {columnOrder.map((col) => (
                      <th
                        key={col}
                        title={labelFor(col)}
                        className="max-w-[180px] truncate px-3 py-1.5 font-medium"
                      >
                        {labelFor(col)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Mỗi group là 1 "khối" viền riêng (border-l/r trên ô đầu-cuối mỗi hàng, border-t/b
                      ở hàng đầu/cuối, bo góc ở 4 góc) — KHÔNG dùng 1 border bao ngoài cả bảng như
                      trước (khiến các group nhìn dính liền thành 1 khối dù có hàng đệm trắng ở giữa,
                      vì viền ngoài đó chạy xuyên suốt không đứt đoạn). Hàng đệm giữa 2 group vì vậy
                      cũng KHÔNG có viền gì, tạo đúng cảm giác 2 khối tách rời. */}
                  {dedupPreview.groups.map((g, i) => (
                    <Fragment key={i}>
                      {i > 0 && (
                        <tr aria-hidden="true">
                          <td colSpan={columnOrder.length + 1} className="h-3 border-0 bg-base-900 p-0"></td>
                        </tr>
                      )}
                      <tr>
                        <td
                          colSpan={columnOrder.length + 1}
                          className="rounded-t-md border-x border-t border-base-800 bg-base-800/60 px-3 py-1 text-[11px] uppercase tracking-wide text-base-400"
                        >
                          Group {i + 1} · {g.rows.length} rows
                        </td>
                      </tr>
                      {(() => {
                        // Sắp các dòng giống hệt nhau CẠNH NHAU (chỉ để hiển thị — không đụng g.rows
                        // gốc, vẫn dùng để xoá) — xem doc-comment clusterIdenticalRows.
                        const displayRows = clusterIdenticalRows(g.rows, columnOrder);
                        return displayRows.map(({ row, clusterIndex }, rowIdx) => {
                          const isLastRow = rowIdx === displayRows.length - 1;
                          const isKept = dedupPreview.keepIds[i] === row.id;
                          // Xen kẽ đậm/nhạt theo TỪNG CỤM dòng giống hệt nhau (không phải theo từng
                          // dòng riêng lẻ) — 2 dòng thuộc cùng 1 cụm luôn chung 1 màu, cụm liền kề đổi
                          // sang mức còn lại để phân biệt. "Kept" (dòng đang chọn giữ) KHÔNG đổi màu nền
                          // nữa — trước đây tô nền riêng khiến 2 dòng giống hệt nhau nhìn "khác nhau" chỉ
                          // vì 1 dòng đang được chọn; giờ chỉ viền lại bằng màu gold, nền giữ nguyên theo
                          // cụm để phản ánh đúng DỮ LIỆU, không lẫn với trạng thái UI.
                          // 2 HUE khác nhau (gold navy đậm / teal cyan nhạt — 2 màu thương hiệu sẵn có)
                          // thay vì 2 mức alpha cùng 1 màu teal — cùng hue chỉ khác alpha rất khó phân
                          // biệt trên nền gần trắng, nhất là khi chữ đã chiếm phần lớn diện tích ô.
                          const clusterBg = clusterIndex % 2 === 0 ? "bg-gold-500/10" : "bg-teal-500/20";
                          // Viền đứt (border-dashed) riêng cho dòng đang "kept" — solid trùng kiểu viền
                          // khối group ở trên, dễ lẫn với đường phân cách thường; đứt nét mới thật sự nổi
                          // bật kể cả khi màu nền cụm đang đậm.
                          const borderColor = isKept ? "border-dashed border-gold-500" : "border-base-800";
                          const needsBottomBorder = isLastRow || isKept;
                          return (
                            <tr key={row.id} className={`${clusterBg} hover:brightness-95`}>
                              <td
                                className={`border-l border-t px-2 py-1.5 ${borderColor} ${
                                  needsBottomBorder ? "border-b" : ""
                                } ${isLastRow ? "rounded-bl-md" : ""}`}
                              >
                                <input
                                  type="radio"
                                  name={`dedup-group-${i}`}
                                  checked={isKept}
                                  onChange={() =>
                                    setDedupPreview((p) =>
                                      p ? { ...p, keepIds: p.keepIds.map((id, idx) => (idx === i ? row.id : id)) } : p
                                    )
                                  }
                                />
                              </td>
                              {columnOrder.map((col, colIdx) => {
                                const value = getCell(row, col);
                                const isUrl = isUrlValue(value);
                                const isLastCol = colIdx === columnOrder.length - 1;
                                return (
                                  <td
                                    key={col}
                                    title={value ? (isUrl ? `${value} — Ctrl+Click to open` : value) : undefined}
                                    onClick={(e) => openIfCtrlClickedUrl(e, value)}
                                    className={`max-w-[180px] truncate border-t px-3 py-1.5 ${borderColor} ${
                                      isUrl ? "cursor-pointer text-teal-600 underline" : "text-base-200"
                                    } ${isLastCol ? "border-r" : ""} ${needsBottomBorder ? "border-b" : ""} ${
                                      isLastRow && isLastCol ? "rounded-br-md" : ""
                                    }`}
                                  >
                                    {value || "—"}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        });
                      })()}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className={toolbarBtn} onClick={() => setDedupPreview(null)}>
                Cancel
              </button>
              <Button
                onClick={() => {
                  const idsToRemove = dedupPreview.groups.flatMap((g, i) =>
                    g.rows.filter((r) => r.id !== dedupPreview.keepIds[i]).map((r) => r.id)
                  );
                  const cmd = deleteRowsCommand(history.state, idsToRemove);
                  if (cmd) history.run(cmd);
                  setDedupPreview(null);
                }}
                className="text-xs"
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

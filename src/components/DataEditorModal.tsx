import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { Participant } from "@/types";

interface DataEditorModalProps {
  open: boolean;
  sessionId: string;
  onClose: () => void;
  onSaved: () => void;
}

interface DraftRow {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  extra: Record<string, string>;
  source: string;
  status: string;
  created_at: string;
}

// Gợi ý tên cột optional phổ biến — chỉ là gợi ý qua datalist, người dùng có thể gõ tên khác
const SUGGESTED_COLUMNS = ["facebook_post", "note", "zalo", "address", "ghi_chu", "team", "khu_vuc"];

function parseRow(p: Participant): DraftRow {
  let extra: Record<string, string> = {};
  if (p.extra_data) {
    try {
      extra = JSON.parse(p.extra_data);
    } catch {
      extra = {};
    }
  }
  return { ...p, extra };
}

function normalizePhone(phone: string | null): string {
  return (phone ?? "").replace(/\D/g, "");
}

function cloneRows(rows: DraftRow[]): DraftRow[] {
  return rows.map((r) => ({ ...r, extra: { ...r.extra } }));
}

export default function DataEditorModal({ open, sessionId, onClose, onSaved }: DataEditorModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState<DraftRow[]>([]);
  const [draft, setDraft] = useState<DraftRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [markedForDelete, setMarkedForDelete] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [newColumnName, setNewColumnName] = useState("");
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const list = await window.api.participants.list(sessionId);
    const rows = list.map(parseRow);
    setOriginal(cloneRows(rows));
    setDraft(cloneRows(rows));
    const keys = new Set<string>();
    rows.forEach((r) => Object.keys(r.extra).forEach((k) => keys.add(k)));
    setColumns(Array.from(keys));
    setMarkedForDelete(new Set());
    setLoading(false);
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId]);

  const duplicateGroups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of draft) {
      const key = normalizePhone(row.phone);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row.id);
    }
    for (const [key, ids] of Array.from(map.entries())) {
      if (ids.length < 2) map.delete(key);
    }
    return map;
  }, [draft]);

  const duplicateIds = useMemo(() => {
    const s = new Set<string>();
    duplicateGroups.forEach((ids) => ids.forEach((id) => s.add(id)));
    return s;
  }, [duplicateGroups]);

  function isRowDirty(row: DraftRow): boolean {
    const orig = original.find((o) => o.id === row.id);
    if (!orig) return false;
    if (orig.name !== row.name || orig.code !== row.code || orig.phone !== row.phone || orig.email !== row.email) {
      return true;
    }
    return JSON.stringify(orig.extra) !== JSON.stringify(row.extra);
  }

  const dirtyCount = useMemo(() => draft.filter(isRowDirty).length, [draft, original]);
  const hasChanges = dirtyCount > 0 || markedForDelete.size > 0;

  function updateField(id: string, field: "name" | "code" | "phone" | "email", value: string) {
    setDraft((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function updateExtra(id: string, key: string, value: string) {
    setDraft((prev) => prev.map((r) => (r.id === id ? { ...r, extra: { ...r.extra, [key]: value } } : r)));
  }

  function addColumn() {
    const name = newColumnName.trim();
    if (!name) return;
    if (columns.includes(name)) {
      setError(`Cột "${name}" đã tồn tại.`);
      return;
    }
    setColumns((prev) => [...prev, name]);
    setNewColumnName("");
    setError(null);
  }

  function renameColumn(oldName: string, newNameRaw: string) {
    const newName = newNameRaw.trim();
    if (!newName || newName === oldName) return;
    if (columns.includes(newName)) {
      setError(`Tên cột "${newName}" đã tồn tại.`);
      return;
    }
    setColumns((prev) => prev.map((c) => (c === oldName ? newName : c)));
    setDraft((prev) =>
      prev.map((r) => {
        if (!(oldName in r.extra)) return r;
        const { [oldName]: value, ...rest } = r.extra;
        return { ...r, extra: { ...rest, [newName]: value } };
      })
    );
  }

  function removeColumn(name: string) {
    if (!confirm(`Xoá cột "${name}"? Dữ liệu cột này ở mọi dòng sẽ mất khi bấm Lưu.`)) return;
    setColumns((prev) => prev.filter((c) => c !== name));
    setDraft((prev) =>
      prev.map((r) => {
        if (!(name in r.extra)) return r;
        const { [name]: _drop, ...rest } = r.extra;
        return { ...r, extra: rest };
      })
    );
  }

  function toggleMarkDelete(id: string) {
    setMarkedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function quickDeduplicate() {
    if (duplicateGroups.size === 0) return;
    const toMark = new Set(markedForDelete);
    duplicateGroups.forEach((ids) => {
      const rows = ids.map((id) => draft.find((r) => r.id === id)).filter((r): r is DraftRow => !!r);
      const scored = rows.map((row) => ({
        row,
        score: [row.name, row.code, row.phone, row.email, ...Object.values(row.extra)].filter(
          (v) => v && v.trim()
        ).length,
      }));
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.row.created_at.localeCompare(b.row.created_at); // hoà điểm -> giữ dòng tạo sớm hơn
      });
      const keepId = scored[0]?.row.id;
      ids.forEach((id) => {
        if (id !== keepId) toMark.add(id);
      });
    });
    setMarkedForDelete(toMark);
  }

  function validate(): string | null {
    const activeRows = draft.filter((r) => !markedForDelete.has(r.id));
    const invalid = activeRows.filter((r) => !r.name.trim() || !r.phone?.trim());
    if (invalid.length > 0) {
      return `${invalid.length} dòng đang thiếu Tên hoặc SĐT (2 trường bắt buộc) — sửa lại hoặc đánh dấu xoá dòng đó trước khi lưu.`;
    }
    return null;
  }

  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (markedForDelete.size > 0) {
        await window.api.participants.bulkDelete(Array.from(markedForDelete));
      }
      const toUpdate = draft.filter((r) => !markedForDelete.has(r.id) && isRowDirty(r));
      for (const row of toUpdate) {
        await window.api.participants.update({
          id: row.id,
          name: row.name,
          code: row.code,
          phone: row.phone,
          email: row.email,
          extra: row.extra,
        });
      }
      await load();
      onSaved();
    } catch (e) {
      setError("Lưu thất bại — thử lại, hoặc kiểm tra terminal để xem lỗi chi tiết.");
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setDraft(cloneRows(original));
    setMarkedForDelete(new Set());
    setError(null);
    const keys = new Set<string>();
    original.forEach((r) => Object.keys(r.extra).forEach((k) => keys.add(k)));
    setColumns(Array.from(keys));
  }

  const visibleRows = showOnlyDuplicates ? draft.filter((r) => duplicateIds.has(r.id)) : draft;
  const cellClass =
    "w-full bg-transparent border-b border-transparent px-1 py-1 text-sm text-base-100 outline-none focus:border-gold-500";

  return (
    <Modal open={open} title="Data Editor — Người chơi" onClose={onClose} maxWidth="max-w-6xl">
      {loading ? (
        <div className="py-12 text-center text-sm text-base-400">Đang tải dữ liệu...</div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Thanh công cụ deduplicate */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-base-800 bg-base-950 px-3 py-2">
            <div className="text-xs text-base-400">
              {duplicateGroups.size > 0 ? (
                <span className="text-danger-500">
                  Phát hiện {duplicateGroups.size} nhóm trùng SĐT ({duplicateIds.size} dòng).
                </span>
              ) : (
                <span>Không phát hiện trùng lặp theo số điện thoại.</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-base-300">
                <input
                  type="checkbox"
                  checked={showOnlyDuplicates}
                  onChange={(e) => setShowOnlyDuplicates(e.target.checked)}
                  className="accent-gold-500"
                />
                Chỉ hiện dòng trùng lặp
              </label>
              <Button
                variant="secondary"
                onClick={quickDeduplicate}
                disabled={duplicateGroups.size === 0}
                className="text-xs"
              >
                Quick deduplicate
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs text-danger-500">
              {error}
            </div>
          )}

          {/* Bảng dữ liệu */}
          <div className="overflow-x-auto rounded-xl border border-base-800">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-base-900 text-xs uppercase tracking-wide text-base-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Tên *</th>
                  <th className="px-3 py-2 font-medium">SĐT *</th>
                  <th className="px-3 py-2 font-medium">Mã (khuyến nghị)</th>
                  <th className="px-3 py-2 font-medium">Email (khuyến nghị)</th>
                  {columns.map((col) => (
                    <th key={col} className="px-3 py-2 font-medium">
                      <div className="flex items-center gap-1">
                        <input
                          defaultValue={col}
                          onBlur={(e) => renameColumn(col, e.target.value)}
                          className="w-24 border-b border-base-700 bg-transparent text-xs normal-case text-base-200 outline-none focus:border-gold-500"
                        />
                        <button
                          onClick={() => removeColumn(col)}
                          className="text-base-500 hover:text-danger-500"
                          title="Xoá cột"
                        >
                          ×
                        </button>
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-800 bg-base-950">
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={5 + columns.length} className="px-4 py-8 text-center text-base-500">
                      Không có dòng nào để hiển thị.
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row) => {
                    const dirty = isRowDirty(row);
                    const isDuplicate = duplicateIds.has(row.id);
                    const marked = markedForDelete.has(row.id);
                    return (
                      <tr
                        key={row.id}
                        className={[
                          marked ? "opacity-40 line-through" : "",
                          !marked && isDuplicate ? "bg-danger-500/10" : "",
                          !marked && !isDuplicate && dirty ? "bg-highlight-500/10" : "",
                        ].join(" ")}
                      >
                        <td className="px-3 py-1">
                          <input
                            value={row.name}
                            onChange={(e) => updateField(row.id, "name", e.target.value)}
                            disabled={marked}
                            className={`${cellClass} ${!row.name.trim() ? "border-danger-500/50" : ""}`}
                          />
                        </td>
                        <td className="px-3 py-1">
                          <input
                            value={row.phone ?? ""}
                            onChange={(e) => updateField(row.id, "phone", e.target.value)}
                            disabled={marked}
                            className={`${cellClass} ${!row.phone?.trim() ? "border-danger-500/50" : ""}`}
                          />
                        </td>
                        <td className="px-3 py-1">
                          <input
                            value={row.code ?? ""}
                            onChange={(e) => updateField(row.id, "code", e.target.value)}
                            disabled={marked}
                            className={cellClass}
                          />
                        </td>
                        <td className="px-3 py-1">
                          <input
                            value={row.email ?? ""}
                            onChange={(e) => updateField(row.id, "email", e.target.value)}
                            disabled={marked}
                            className={cellClass}
                          />
                        </td>
                        {columns.map((col) => (
                          <td key={col} className="px-3 py-1">
                            <input
                              value={row.extra[col] ?? ""}
                              onChange={(e) => updateExtra(row.id, col, e.target.value)}
                              disabled={marked}
                              className={cellClass}
                            />
                          </td>
                        ))}
                        <td className="px-3 py-1 text-right">
                          <button
                            onClick={() => toggleMarkDelete(row.id)}
                            className={`text-xs ${marked ? "text-teal-400 hover:underline" : "text-base-500 hover:text-danger-500"}`}
                          >
                            {marked ? "Huỷ xoá" : "Xoá"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Thêm cột optional mới */}
          <div className="flex items-center gap-2">
            <input
              list="suggested-columns"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addColumn()}
              placeholder="Tên cột optional mới (vd: facebook_post)"
              className="w-64 rounded-lg border border-base-700 bg-base-800 px-3 py-1.5 text-xs text-base-100 outline-none focus:border-gold-500"
            />
            <datalist id="suggested-columns">
              {SUGGESTED_COLUMNS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <Button variant="secondary" onClick={addColumn} className="text-xs">
              + Thêm cột
            </Button>
          </div>

          {/* Thanh Save / Discard */}
          <div className="flex items-center justify-between border-t border-base-800 pt-3">
            <div className="text-xs text-base-400">
              {hasChanges
                ? `${dirtyCount} dòng sửa, ${markedForDelete.size} dòng đánh dấu xoá — chưa lưu.`
                : "Không có thay đổi."}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleDiscard} disabled={!hasChanges || saving}>
                Discard
              </Button>
              <Button onClick={handleSave} disabled={!hasChanges || saving}>
                {saving ? "Đang lưu..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

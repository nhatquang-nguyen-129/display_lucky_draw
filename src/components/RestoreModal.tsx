import { useCallback, useEffect, useState } from "react";
import { TrashEntry } from "@/types";
import { useSession } from "@/context/SessionContext";
import Modal from "./Modal";
import Button from "./Button";

// Session đã bị "Move to trash" (menu chuột phải trên tab, SessionLockMenu.tsx — KHÁC Close/nút ×,
// xem TabBar.tsx) nằm ở data/.trash/, chưa xoá hẳn — hộp thoại này liệt kê để Restore lại thành tab,
// hoặc Delete VĨNH VIỄN (KHÔNG còn đường lấy lại, khác Restore). Mở theo yêu cầu (nút "Restore" cạnh
// "Open" ở TabBar.tsx), khác SessionConflictDialog.tsx (tự hiện khi có conflict). Chọn nhiều session
// bằng checkbox rồi Restore/Delete cả loạt 1 lần.
export default function RestoreModal({ onClose }: { onClose: () => void }) {
  const { refresh } = useSession();
  const [items, setItems] = useState<TrashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setItems(await window.api.sessions.listTrash());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(file: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  }

  async function handleRestore() {
    setBusy(true);
    try {
      for (const file of selected) await window.api.sessions.restoreFromTrash({ file });
      await refresh();
      setSelected(new Set());
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handlePermanentDelete() {
    const ok = confirm(
      `Permanently delete ${selected.size} session(s)? This removes them from data/.trash/ for good — there is no way to bring them back.`
    );
    if (!ok) return;
    setBusy(true);
    try {
      for (const file of selected) await window.api.sessions.permanentlyDelete({ file });
      setSelected(new Set());
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title="Restore deleted sessions" onClose={onClose} maxWidth="max-w-3xl" hideCloseButton>
      {loading ? (
        <p className="py-6 text-center text-sm text-base-500">Loading...</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-base-500">Nothing deleted.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead className="text-base-500">
            <tr>
              <th className="w-8 py-1" />
              <th className="py-1 font-medium">Session</th>
              <th className="py-1 font-medium">Deleted</th>
              <th className="py-1 text-right font-medium">Participants</th>
              <th className="py-1 text-right font-medium">Prizes</th>
              <th className="py-1 text-right font-medium">Confirmed draws</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const checked = selected.has(item.file);
              return (
                <tr
                  key={item.file}
                  onClick={() => toggle(item.file)}
                  className={`cursor-pointer border-t border-base-800 text-base-300 ${checked ? "bg-gold-500/10" : "hover:bg-base-800/60"}`}
                >
                  <td className="py-2 pl-1">
                    <input type="checkbox" readOnly checked={checked} className="accent-gold-500" />
                  </td>
                  <td className="py-2 font-medium text-base-100">{item.name}</td>
                  <td className="py-2">{new Date(item.deletedAt).toLocaleString()}</td>
                  <td className="py-2 text-right">{item.participants}</td>
                  <td className="py-2 text-right">{item.prizes}</td>
                  <td className="py-2 text-right">{item.confirmedDraws}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={handleRestore} disabled={selected.size === 0 || busy}>
          Restore
        </Button>
        <Button variant="danger" onClick={handlePermanentDelete} disabled={selected.size === 0 || busy}>
          Delete
        </Button>
      </div>
    </Modal>
  );
}

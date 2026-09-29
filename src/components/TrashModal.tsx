import { useCallback, useEffect, useState } from "react";
import { TrashEntry } from "@/types";
import { useSession } from "@/context/SessionContext";
import Modal from "./Modal";
import Button from "./Button";

// Session đã đóng tab (nút "×" ở TabBar.tsx) nằm ở data/.trash/, chưa xoá hẳn — hộp thoại này liệt kê
// để phục hồi lại thành tab. Mở theo yêu cầu (nút "Trash" cạnh "Data folder" ở TabBar.tsx), khác
// SessionConflictDialog.tsx (tự hiện khi có conflict).
export default function TrashModal({ onClose }: { onClose: () => void }) {
  const { refresh } = useSession();
  const [items, setItems] = useState<TrashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringFile, setRestoringFile] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setItems(await window.api.sessions.listTrash());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRestore(file: string) {
    setRestoringFile(file);
    try {
      await window.api.sessions.restoreFromTrash({ file });
      await refresh();
      await load();
    } finally {
      setRestoringFile(null);
    }
  }

  return (
    <Modal open title="Trash — closed sessions" onClose={onClose} maxWidth="max-w-3xl">
      <p className="mb-4 text-sm text-base-400">
        Sessions closed with the "×" on a tab land here instead of being deleted outright. Restore one to bring its
        tab back.
      </p>

      {loading ? (
        <p className="py-6 text-center text-sm text-base-500">Loading...</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-base-500">Trash is empty.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead className="text-base-500">
            <tr>
              <th className="py-1 font-medium">Session</th>
              <th className="py-1 font-medium">Closed</th>
              <th className="py-1 text-right font-medium">Participants</th>
              <th className="py-1 text-right font-medium">Prizes</th>
              <th className="py-1 text-right font-medium">Confirmed draws</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.file} className="border-t border-base-800 text-base-300">
                <td className="py-2 font-medium text-base-100">{item.name}</td>
                <td className="py-2">{new Date(item.deletedAt).toLocaleString()}</td>
                <td className="py-2 text-right">{item.participants}</td>
                <td className="py-2 text-right">{item.prizes}</td>
                <td className="py-2 text-right">{item.confirmedDraws}</td>
                <td className="py-2 pl-3 text-right">
                  <Button
                    variant="secondary"
                    onClick={() => handleRestore(item.file)}
                    disabled={restoringFile !== null}
                  >
                    {restoringFile === item.file ? "Restoring..." : "Restore"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

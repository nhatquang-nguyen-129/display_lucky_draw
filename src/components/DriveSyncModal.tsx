import { useEffect, useState } from "react";
import { SyncFileResult, SyncResult } from "@/types";
import { useSession } from "@/context/SessionContext";
import Modal from "./Modal";
import Button from "./Button";

// Dán link thư mục Google Drive công khai (Anyone with the link) + API key Drive tự tạo (Google Cloud
// Console) → tải file .db mới (theo TÊN chưa có trong data/) vào data/. KHÔNG ghi đè file trùng tên —
// file trùng được lưu dưới tên tránh trùng, nhường cho SessionConflictDialog.tsx tự phát hiện có thật
// là cùng 1 session hay không. Xem electron/driveSync.ts, docs/architecture/drive-sync.md. Mở từ nút
// "Sync" cạnh "Open"/"Restore" ở TabBar.tsx — cùng khuôn với RestoreModal.tsx.
export default function DriveSyncModal({ onClose }: { onClose: () => void }) {
  const { refresh } = useSession();
  const [folderUrl, setFolderUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    window.api.sync.getSettings().then((saved) => {
      if (saved) {
        setFolderUrl(saved.lastFolderUrl);
        setApiKey(saved.apiKey);
      }
    });
  }, []);

  async function handleSync() {
    setBusy(true);
    setResult(null);
    try {
      const r = await window.api.sync.driveFolder({ folderUrl, apiKey });
      setResult(r);
      // refresh() gọi sessions.list() -> tự rescan() -> tab mới hiện ngay; nếu phát sinh trùng
      // sessions.id thật, SessionConflictDialog.tsx (render sẵn ở Layout.tsx) tự hiện ra.
      if ("files" in r && r.files.some((f) => f.status === "downloaded")) {
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const canSync = folderUrl.trim() !== "" && apiKey.trim() !== "" && !busy;

  return (
    <Modal open title="Sync Data folder from Google Drive" onClose={onClose} maxWidth="max-w-2xl" hideCloseButton>
      <div className="space-y-3">
        <label className="block text-xs font-medium text-base-400">
          Folder URL
          <input
            value={folderUrl}
            onChange={(e) => setFolderUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="mt-1 w-full rounded-md border border-base-700 bg-base-950 px-2 py-1.5 text-sm text-base-100 outline-none"
          />
        </label>

        <label className="block text-xs font-medium text-base-400">
          Google Drive API key
          <div className="mt-1 flex gap-1.5">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              className="w-full rounded-md border border-base-700 bg-base-950 px-2 py-1.5 text-sm text-base-100 outline-none"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="shrink-0 px-2 text-xs text-base-400 hover:text-base-100"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <p className="text-xs text-base-500">
          Only files whose name doesn't already exist in your data folder are downloaded. Files that
          collide with an existing name are saved as a separate copy — if it turns out to be the same
          session, you'll be asked which one to keep.
        </p>
      </div>

      {result && "error" in result && (
        <div className="mt-4 rounded-md border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">
          {result.error}
        </div>
      )}

      {result && "files" in result && (
        <table className="mt-4 w-full text-left text-xs">
          <thead className="text-base-500">
            <tr>
              <th className="py-1 font-medium">File</th>
              <th className="py-1 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {result.files.map((f, i) => (
              <tr key={`${f.name}-${i}`} className="border-t border-base-800 text-base-300">
                <td className="py-1.5 font-mono">{f.name}</td>
                <td className="py-1.5">
                  <StatusPill status={f.status} />
                  {f.message && <span className="ml-2 text-base-500">{f.message}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Close
        </Button>
        <Button onClick={handleSync} disabled={!canSync}>
          {busy ? "Syncing..." : "Sync"}
        </Button>
      </div>
    </Modal>
  );
}

function StatusPill({ status }: { status: SyncFileResult["status"] }) {
  const styles: Record<SyncFileResult["status"], string> = {
    downloaded: "bg-teal-500/15 text-teal-400",
    "already-synced": "bg-base-700/40 text-base-400",
    "skipped-not-db": "bg-base-700/40 text-base-400",
    error: "bg-danger-500/15 text-danger-500",
  };
  const labels: Record<SyncFileResult["status"], string> = {
    downloaded: "Downloaded",
    "already-synced": "Already synced",
    "skipped-not-db": "Skipped",
    error: "Error",
  };
  return <span className={`rounded px-1.5 py-0.5 font-sans text-[10px] font-medium ${styles[status]}`}>{labels[status]}</span>;
}

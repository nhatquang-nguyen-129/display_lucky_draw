import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CloudSessionStatus, CloudSyncState, CloudVersion } from "@/types";
import { useSession } from "@/context/SessionContext";
import Modal from "./Modal";
import Button from "./Button";

// So local với cloud từng session (window.api.cloud.status, xem status() trong electron/cloudSync.ts) rồi
// gợi ý đúng nút: Push khi local mới hơn/chưa có trên cloud, Sync khi cloud mới hơn/chưa có trên máy,
// cả 2 khi 2 bên cùng đổi. Không tự làm gì — chỉ kiểm tra lúc mở/bấm Refresh. KHÔNG có ô khai báo kết nối
// — 1 app chỉ dùng 1 cloud, khai báo ở trang Settings. Sync không ghi đè gì — trùng session đang mở thì
// SessionConflictDialog.tsx tự hiện sau refresh(). Xem docs/architecture/cloud-sync.md. Mở từ nút "Cloud"
// cạnh "Open"/"Restore" ở TabBar.tsx — cùng khuôn với RestoreModal.tsx.
export default function CloudSyncModal({ onClose }: { onClose: () => void }) {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [rows, setRows] = useState<CloudSessionStatus[] | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // nhãn thao tác đang chạy, null = rảnh
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    window.api.cloud.getSettings().then((saved) => {
      const ok = !!saved.workerUrl && !!(saved.readCode || saved.writeToken);
      setConfigured(ok);
      if (ok) void run("Checking for changes...", loadStatus);
    });
  }, []);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  async function loadStatus() {
    const r = await window.api.cloud.status();
    if ("error" in r) return setError(r.error);
    setRows(r.sessions.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.name.localeCompare(b.name)));
    setCanWrite(r.canWrite);
  }

  async function handlePush(row: CloudSessionStatus) {
    setNotice(null);
    await run("Pushing...", async () => {
      const r = await window.api.cloud.push([row.sessionId]);
      if ("error" in r) return setError(r.error);
      const failed = r.results.find((x) => x.status === "error");
      if (failed) setError(`${failed.name}: ${failed.message}`);
      else setNotice(`Pushed "${row.name}" to the cloud.`);
      await loadStatus();
    });
  }

  async function handleSync(v: CloudVersion) {
    setNotice(null);
    await run("Syncing...", async () => {
      const r = await window.api.cloud.pull({ sessionId: v.sessionId, file: v.file });
      if ("error" in r) return setError(r.error);
      setNotice(
        r.alreadyPulled
          ? `This version is already in your data folder as ${r.savedAs}.`
          : `Downloaded as ${r.savedAs}. If you already had this session, you'll be asked which copy to keep.`
      );
      // refresh() -> sessions.list() -> rescan(): tab mới hiện ngay, trùng sessions.id thì
      // SessionConflictDialog.tsx (render sẵn ở Layout.tsx) tự hiện ra.
      if (!r.alreadyPulled) await refresh();
      await loadStatus();
    });
  }

  function openSettings() {
    onClose();
    navigate("/settings");
  }

  const pending = rows?.filter((r) => r.state !== "in-sync").length ?? 0;

  return (
    <Modal open title="Cloud Sync" onClose={onClose} maxWidth="max-w-3xl" hideCloseButton>
      {configured === false && (
        <div className="space-y-3 text-sm text-base-300">
          <p>Cloud Sync isn't set up on this computer yet.</p>
          <Button onClick={openSettings}>Open Settings</Button>
        </div>
      )}

      {configured && (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs text-base-500">
              {rows === null
                ? "Comparing this computer with the cloud..."
                : pending === 0
                  ? "Everything is up to date."
                  : `${pending} session${pending === 1 ? " needs" : "s need"} attention. Sync never overwrites anything on this computer.`}
            </p>
            <button
              onClick={() => run("Checking for changes...", loadStatus)}
              disabled={!!busy}
              className="shrink-0 text-xs text-base-400 hover:text-base-100 disabled:opacity-40"
            >
              Refresh
            </button>
          </div>

          {error && (
            <div className="mb-2 rounded-md border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">
              {error}
            </div>
          )}
          {notice && <p className="mb-2 text-xs text-teal-500">{notice}</p>}
          {rows && rows.length === 0 && <p className="text-xs text-base-500">No sessions on this computer or in the cloud.</p>}

          <div className="max-h-[28rem] space-y-2 overflow-y-auto">
            {rows?.map((row) => (
              <SessionRow
                key={row.sessionId}
                row={row}
                canWrite={canWrite}
                busy={!!busy}
                onPush={() => handlePush(row)}
                onSync={handleSync}
              />
            ))}
          </div>
          {rows && !canWrite && rows.some((r) => suggestsPush(r)) && (
            <p className="mt-2 text-xs text-base-500">
              This computer is read-only — add the write token in Settings to push.
            </p>
          )}
        </>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        {busy && <span className="mr-auto text-xs text-base-500">{busy}</span>}
        <Button variant="secondary" onClick={onClose} disabled={!!busy}>
          Close
        </Button>
      </div>
    </Modal>
  );
}

// Session cần xử lý lên trước, "Up to date" xuống cuối.
const STATE_ORDER: Record<CloudSyncState, number> = {
  diverged: 0,
  "local-newer": 1,
  "cloud-newer": 2,
  "local-only": 3,
  "cloud-only": 4,
  "in-sync": 5,
};

const STATE_LABEL: Record<CloudSyncState, { text: string; hint: string; style: string }> = {
  "in-sync": { text: "Up to date", hint: "Same as the latest version in the cloud", style: "bg-base-700/40 text-base-400" },
  "local-only": { text: "Not in cloud", hint: "Only on this computer", style: "bg-gold-500/15 text-gold-400" },
  "cloud-only": { text: "Only in cloud", hint: "Not on this computer yet", style: "bg-teal-500/15 text-teal-400" },
  "local-newer": { text: "Changed here", hint: "Edited on this computer since the last push", style: "bg-gold-500/15 text-gold-400" },
  "cloud-newer": { text: "Newer in cloud", hint: "The cloud has a newer version than this computer", style: "bg-teal-500/15 text-teal-400" },
  diverged: {
    text: "Changed on both",
    hint: "Edited here and in the cloud — syncing keeps both copies so you can choose",
    style: "bg-danger-500/15 text-danger-500",
  },
};

function suggestsPush(r: CloudSessionStatus): boolean {
  return r.state === "local-only" || r.state === "local-newer" || (r.state === "diverged" && r.newer === "local");
}

function SessionRow({
  row,
  canWrite,
  busy,
  onPush,
  onSync,
}: {
  row: CloudSessionStatus;
  canWrite: boolean;
  busy: boolean;
  onPush: () => void;
  onSync: (v: CloudVersion) => void;
}) {
  const [file, setFile] = useState(row.versions[0]?.file ?? "");
  const selected = row.versions.find((x) => x.file === file) ?? row.versions[0];
  const label = STATE_LABEL[row.state];
  const showPush = canWrite && (row.state === "local-only" || row.state === "local-newer" || row.state === "diverged");
  const showSync = row.versions.length > 0 && row.state !== "local-only" && row.state !== "local-newer";
  const pushPrimary = suggestsPush(row);

  return (
    <div className="flex items-center gap-3 rounded-md border border-base-800 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm text-base-100">{row.name}</span>
          <span title={label.hint} className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${label.style}`}>
            {label.text}
          </span>
          {row.local?.closed && <span className="shrink-0 text-[10px] text-base-500">closed tab</span>}
        </div>
        <div className="mt-0.5 text-xs text-base-500">
          {row.local && <>This computer: edited {formatDate(row.local.modifiedAt)}</>}
          {row.local && row.versions[0] && " · "}
          {row.versions[0] && <>Cloud: edited {formatDate(row.versions[0].modifiedAt)}</>}
          {row.state === "diverged" && (
            <span className="ml-1">· {row.newer === "local" ? "this computer" : "the cloud"} was edited more recently</span>
          )}
        </div>
      </div>

      {showSync && row.versions.length > 1 && (
        <select
          value={file}
          onChange={(e) => setFile(e.target.value)}
          title="Version to sync"
          className="shrink-0 rounded-md border border-base-700 bg-base-950 px-1.5 py-1 text-xs text-base-300 outline-none"
        >
          {row.versions.map((x, i) => (
            <option key={x.file} value={x.file}>
              {i === 0 ? "Latest — " : ""}
              {formatDate(x.pushedAt)}
            </option>
          ))}
        </select>
      )}
      {showPush && (
        <Button variant={pushPrimary ? "primary" : "secondary"} onClick={onPush} disabled={busy}>
          Push
        </Button>
      )}
      {showSync && selected && (
        <Button variant={pushPrimary || row.state === "in-sync" ? "secondary" : "primary"} onClick={() => onSync(selected)} disabled={busy}>
          Sync
        </Button>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

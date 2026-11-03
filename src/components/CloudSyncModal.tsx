import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CloudProgress, CloudPullResult, CloudPushResult, CloudSessionStatus, CloudSyncState } from "@/types";
import { useSession } from "@/context/SessionContext";
import Modal from "./Modal";
import Button from "./Button";

// So local với cloud từng session (window.api.cloud.status, xem status() trong electron/cloudSync.ts) rồi
// gợi ý đúng nhãn: Push khi local mới hơn/chưa có trên cloud, Sync khi cloud mới hơn/chưa có trên máy,
// cả 2 khi 2 bên cùng đổi. Không tự làm gì — chỉ kiểm tra lúc mở/bấm Refresh. Tick chọn nhiều session
// (checkbox từng dòng + Select all) rồi bấm 1 trong 2 nút Push/Pull chung ở footer — mỗi nút chỉ áp
// dụng cho đúng những dòng ĐANG CHỌN mà đủ điều kiện (vd tick cả dòng "Not in cloud" lẫn "Only in
// cloud" rồi bấm Push thì chỉ dòng đầu được gửi, không lỗi gì với dòng còn lại). KHÔNG có ô khai báo
// kết nối — 1 app chỉ dùng 1 cloud, khai báo ở trang Settings. Sync không ghi đè gì — trùng session
// đang mở thì SessionConflictDialog.tsx tự hiện sau refresh(). Xem docs/architecture/cloud-sync.md.
// Mở từ nút "Cloud" cạnh "Open"/"Restore" ở TabBar.tsx — cùng khuôn với RestoreModal.tsx.
export default function CloudSyncModal({ onClose }: { onClose: () => void }) {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [rows, setRows] = useState<CloudSessionStatus[] | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // nhãn thao tác đang chạy, null = rảnh
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Tiến độ Push/Pull đang chạy dở (byte đã gửi/nhận trên tổng) — xem cloud:progress trong main.ts.
  // File session vài chục MB (ảnh nhúng Landing Builder) đủ lâu để cần báo cụ thể, không chỉ đứng yên
  // ở 1 dòng chữ "Pushing...".
  const [progress, setProgress] = useState<CloudProgress | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // sessionId -> tên file bản muốn Pull, mặc định "Latest" (versions[0]) — chỉ cần cho dòng có nhiều bản.
  const [versionChoice, setVersionChoice] = useState<Record<string, string>>({});
  // Đóng modal được dù đang Push/Pull (xem handleClose) — await của lượt đang chạy có thể resolve
  // SAU KHI modal đã unmount, dùng ref này để bỏ qua setState lúc đó thay vì set lên component đã gỡ.
  const mountedRef = useRef(true);
  useEffect(() => {
    // Đặt lại true ngay trong setup (không chỉ dựa vào giá trị khởi tạo của useRef) — StrictMode (dev)
    // chạy mount → cleanup → mount giả lúc khởi động, nếu không có dòng này mountedRef sẽ kẹt ở false
    // từ đầu (cleanup của lượt giả chạy trước) khiến MỌI setState trong component bị chặn luôn.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    window.api.cloud.getSettings().then((saved) => {
      const ok = !!saved.workerUrl && !!(saved.readCode || saved.writeToken);
      setConfigured(ok);
      if (ok) void run("Checking for changes...", loadStatus);
    });
  }, []);

  useEffect(() => window.api.cloud.onProgress(setProgress), []);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setProgress(null);
    try {
      await fn();
    } finally {
      if (mountedRef.current) {
        setBusy(null);
        setProgress(null);
      }
    }
  }

  async function loadStatus() {
    const r = await window.api.cloud.status();
    if (!mountedRef.current) return;
    if ("error" in r) return setError(r.error);
    const sorted = r.sessions.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.name.localeCompare(b.name));
    setRows(sorted);
    setCanWrite(r.canWrite);
    // Bỏ chọn session không còn trong danh sách (vd đã Up to date, hoặc vừa xoá) — tránh giữ selection
    // "ma" trỏ vào session đã biến mất khỏi danh sách.
    setSelected((prev) => new Set([...prev].filter((id) => sorted.some((row) => row.sessionId === id))));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!rows) return;
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.sessionId))));
  }

  const pushTargets = rows?.filter((r) => selected.has(r.sessionId) && isPushEligible(r)) ?? [];
  const pullTargets = rows?.filter((r) => selected.has(r.sessionId) && isPullEligible(r)) ?? [];

  async function handlePushSelected() {
    if (pushTargets.length === 0) return;
    setNotice(null);
    const ids = pushTargets.map((r) => r.sessionId);
    await run(`Pushing ${ids.length} session${ids.length === 1 ? "" : "s"}...`, async () => {
      const r = await window.api.cloud.push(ids);
      if (!mountedRef.current) return;
      if ("error" in r) return setError(r.error);
      summarizePush(r.results);
      await loadStatus();
    });
  }

  async function handlePullSelected() {
    if (pullTargets.length === 0) return;
    setNotice(null);
    const items = pullTargets.map((r) => ({
      sessionId: r.sessionId,
      file: versionChoice[r.sessionId] ?? r.versions[0]?.file ?? "",
    }));
    await run(`Syncing ${items.length} session${items.length === 1 ? "" : "s"}...`, async () => {
      const r = await window.api.cloud.pull(items);
      // refresh() luôn chạy dù modal đã đóng — nó cập nhật SessionContext (ngoài component này), không
      // phải state của modal, nên không cần mountedRef. Các setState bên dưới (loadStatus/summarizePull)
      // mới cần guard.
      if ("error" in r) {
        if (mountedRef.current) setError(r.error);
        return;
      }
      if (r.results.some((x) => x.status === "pulled")) await refresh();
      if (!mountedRef.current) return;
      summarizePull(r.results);
      await loadStatus();
    });
  }

  function summarizePush(results: CloudPushResult[]) {
    const pushed = results.filter((x) => x.status === "pushed").length;
    const unchanged = results.filter((x) => x.status === "unchanged").length;
    const failed = results.filter((x) => x.status === "error");
    const parts: string[] = [];
    if (pushed) parts.push(`${pushed} pushed`);
    if (unchanged) parts.push(`${unchanged} already up to date`);
    if (parts.length) setNotice(`${parts.join(", ")}.`);
    if (failed.length) setError(failed.map((f) => `${f.name}: ${f.message}`).join(" · "));
  }

  function summarizePull(results: CloudPullResult[]) {
    const pulled = results.filter((x) => x.status === "pulled").length;
    const already = results.filter((x) => x.status === "already-pulled").length;
    const failed = results.filter((x) => x.status === "error");
    const parts: string[] = [];
    if (pulled) parts.push(`${pulled} downloaded`);
    if (already) parts.push(`${already} already in your data folder`);
    if (parts.length) setNotice(`${parts.join(", ")}. If you already had a session, you'll be asked which copy to keep.`);
    if (failed.length) setError(failed.map((f) => `${f.name}: ${f.message}`).join(" · "));
  }

  function openSettings() {
    onClose();
    navigate("/settings");
  }

  // Close không bị disable lúc busy nữa — bấm thì hỏi xác nhận trước (sẽ huỷ Push/Pull đang chạy),
  // không tự chặn người dùng đóng. Đồng ý thì gọi cloud.cancel() (main.ts abort() lượt đang chạy, xem
  // "cloud:cancel") rồi đóng ngay — không chờ promise của lượt đó resolve xong mới đóng.
  function handleClose() {
    if (busy) {
      if (!confirm("Closing now will cancel the current Push/Pull. Continue?")) return;
      void window.api.cloud.cancel();
    }
    onClose();
  }

  const pending = rows?.filter((r) => r.state !== "in-sync").length ?? 0;
  const allSelected = !!rows && rows.length > 0 && selected.size === rows.length;

  return (
    <Modal open title="Cloud Sync" onClose={handleClose} maxWidth="max-w-3xl" hideCloseButton>
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

          {rows && rows.length > 0 && (
            <label className="mb-1.5 flex items-center gap-2 px-1 text-xs text-base-400">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-gold-500" />
              Select all
            </label>
          )}

          <div className="max-h-[26rem] space-y-2 overflow-y-auto">
            {rows?.map((row) => (
              <SessionRow
                key={row.sessionId}
                row={row}
                checked={selected.has(row.sessionId)}
                onToggle={() => toggleOne(row.sessionId)}
                version={versionChoice[row.sessionId] ?? row.versions[0]?.file ?? ""}
                onVersionChange={(file) => setVersionChoice((prev) => ({ ...prev, [row.sessionId]: file }))}
              />
            ))}
          </div>
          {rows && !canWrite && rows.some(isPushEligible) && (
            <p className="mt-2 text-xs text-base-500">
              This computer is read-only — add the write token in Settings to push.
            </p>
          )}
        </>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        {busy && (
          <div className="mr-auto flex min-w-0 items-center gap-2 text-xs text-base-500">
            <span className="shrink-0">{busy}</span>
            {progress && progress.total > 0 && (
              <>
                <div className="h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-base-800">
                  <div
                    className="h-full bg-teal-500 transition-[width] duration-150 ease-linear"
                    style={{ width: `${Math.min(100, (progress.sent / progress.total) * 100)}%` }}
                  />
                </div>
                <span className="shrink-0 tabular-nums">
                  {formatBytes(progress.sent)} / {formatBytes(progress.total)}
                </span>
              </>
            )}
          </div>
        )}
        <Button variant="secondary" onClick={handleClose}>
          Close
        </Button>
        <Button variant="secondary" onClick={handlePullSelected} disabled={!!busy || pullTargets.length === 0}>
          Pull{pullTargets.length > 0 ? ` (${pullTargets.length})` : ""}
        </Button>
        <Button onClick={handlePushSelected} disabled={!!busy || !canWrite || pushTargets.length === 0}>
          Push{pushTargets.length > 0 ? ` (${pushTargets.length})` : ""}
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

function isPushEligible(r: CloudSessionStatus): boolean {
  return r.state === "local-only" || r.state === "local-newer" || r.state === "diverged";
}

function isPullEligible(r: CloudSessionStatus): boolean {
  return r.versions.length > 0 && r.state !== "local-only" && r.state !== "local-newer";
}

function SessionRow({
  row,
  checked,
  onToggle,
  version,
  onVersionChange,
}: {
  row: CloudSessionStatus;
  checked: boolean;
  onToggle: () => void;
  version: string;
  onVersionChange: (file: string) => void;
}) {
  const label = STATE_LABEL[row.state];
  const showVersionPicker = isPullEligible(row) && row.versions.length > 1;

  return (
    <div
      onClick={onToggle}
      className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${checked ? "border-gold-500/50 bg-gold-500/5" : "border-base-800"}`}
    >
      <input type="checkbox" readOnly checked={checked} className="shrink-0 accent-gold-500" />
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

      {showVersionPicker && (
        <select
          value={version}
          onChange={(e) => onVersionChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          title="Version to pull"
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
    </div>
  );
}

function formatBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

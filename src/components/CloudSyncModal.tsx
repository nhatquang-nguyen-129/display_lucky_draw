import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CloudProgress, CloudPullResult, CloudPushResult, CloudSessionStatus, CloudSyncState } from "@/types";
import { useSession } from "@/context/SessionContext";
import { onConflictResolved } from "@/lib/cloudSyncEvents";
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
export default function CloudSyncModal({ onClose, quitPending = false }: { onClose: () => void; quitPending?: boolean }) {
  const { refresh, deleteTab } = useSession();
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
  // Tốc độ tức thời (byte/giây) — tự tính ở renderer từ các mốc progress gần nhau (IPC không gửi kèm
  // tốc độ, xem useEffect onProgress bên dưới). null = chưa đủ 2 mốc để tính, hoặc giữa 2 lần Push
  // từng phần (upload) có thể cách nhau rất lâu (xem UPLOAD_PART_TIMEOUT_MS=0 trong cloudSync.ts) nên
  // con số này chỉ là trung bình giữa 2 mốc gần nhất, không phải tốc độ "sống" liên tục như lúc Pull.
  const [speed, setSpeed] = useState<number | null>(null);
  // Danh sách CỐ ĐỊNH các session trong lượt Push/Pull đang chạy (chụp lại lúc bấm nút, không đổi theo
  // selection/rows có thể refresh giữa chừng) — để biết đang ở session thứ mấy/tên gì trong cùng lượt,
  // hiện ngay trên progress bar thay vì chỉ 1 dòng chung "Pushing 3 sessions...".
  const [activeBatch, setActiveBatch] = useState<{ verb: string; items: { sessionId: string; name: string }[] } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  // SessionConflictDialog.tsx báo khi 1 conflict vừa resolve xong ở nơi khác (vd sau 1 lượt Pull tạo
  // file trùng) — tự load lại status() ngay, không chờ người dùng bấm Refresh. Guard !busy để không
  // chồng lên 1 lượt Push/Pull đang chạy dở.
  useEffect(
    () => onConflictResolved(() => {
      if (configured && !busy) void run("Checking for changes...", loadStatus);
    }),
    [configured, busy]
  );

  // Tính tốc độ byte/giây từ cửa sổ trượt ~2s các mốc progress gần nhất — không lấy nguyên khoảng từ
  // đầu lượt vì byte vẫn còn tính cả lúc mạng đang chậm/khựng trước đó, dễ ra số sai lệch quá khứ.
  const speedSamplesRef = useRef<{ t: number; sent: number; sessionId: string }[]>([]);
  useEffect(
    () =>
      window.api.cloud.onProgress((p) => {
        const now = performance.now();
        const samples = speedSamplesRef.current;
        if (samples.length && samples[0].sessionId !== p.sessionId) samples.length = 0; // đổi session — byte cũ không còn liên quan
        samples.push({ t: now, sent: p.sent, sessionId: p.sessionId });
        const cutoff = now - 2000;
        while (samples.length > 1 && samples[0].t < cutoff) samples.shift();
        const span = samples.length > 1 ? (now - samples[0].t) / 1000 : 0;
        const bytes = samples.length > 1 ? samples[samples.length - 1].sent - samples[0].sent : 0;
        setSpeed(span > 0.2 && bytes > 0 ? bytes / span : null);
        setProgress(p);
      }),
    []
  );

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setProgress(null);
    setSpeed(null);
    speedSamplesRef.current = [];
    try {
      await fn();
    } finally {
      if (mountedRef.current) {
        setBusy(null);
        setProgress(null);
        setSpeed(null);
        setActiveBatch(null);
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
  // Soft delete (chuyển vào Trash) chỉ cho local-only — session có mặt ở cloud rồi thì xoá local không
  // mất dữ liệu thật (Pull lại được), nhưng local-only xoá sai thì mất hẳn, nên chỉ cho đúng trạng thái
  // an toàn nhất; vẫn là Trash (không phải permanently delete) nên luôn khôi phục được qua Restore.
  const deleteTargets = rows?.filter((r) => selected.has(r.sessionId) && isDeleteEligible(r)) ?? [];

  async function handlePushSelected() {
    if (pushTargets.length === 0) return;
    setNotice(null);
    setActiveBatch({ verb: "Pushing", items: pushTargets.map((r) => ({ sessionId: r.sessionId, name: r.name })) });
    const ids = pushTargets.map((r) => r.sessionId);
    await run(`Pushing ${ids.length} session${ids.length === 1 ? "" : "s"}...`, async () => {
      const r = await window.api.cloud.push(ids);
      if (!mountedRef.current) return;
      if ("error" in r) return setError(r.error);
      summarizePush(r.results);
      await loadStatus();
    });
  }

  // Soft delete — chuyển các session local-only ĐANG CHỌN vào data/.trash/ (dùng đúng sessions:delete
  // sẵn có, qua deleteTab() để active tab/refresh() được xử lý nhất quán với mọi nơi khác trong app).
  // KHÔNG permanently delete — vẫn khôi phục được qua Restore nếu chọn nhầm. 1 session lỗi (vd đang bị
  // khoá) không chặn các session còn lại trong cùng lượt.
  async function handleDeleteSelected() {
    if (deleteTargets.length === 0) return;
    const ok = confirm(
      `Move ${deleteTargets.length} session${deleteTargets.length === 1 ? "" : "s"} to Trash? You can restore ${deleteTargets.length === 1 ? "it" : "them"} later.`
    );
    if (!ok) return;
    setNotice(null);
    await run(`Deleting ${deleteTargets.length} session${deleteTargets.length === 1 ? "" : "s"}...`, async () => {
      const failed: string[] = [];
      for (const r of deleteTargets) {
        try {
          await deleteTab(r.sessionId);
        } catch (err) {
          failed.push(`${r.name}: ${(err as Error).message}`);
        }
      }
      if (!mountedRef.current) return;
      const okCount = deleteTargets.length - failed.length;
      if (okCount) setNotice(`${okCount} session${okCount === 1 ? "" : "s"} moved to Trash.`);
      if (failed.length) setError(failed.join(" · "));
      await loadStatus();
    });
  }

  async function handlePullSelected() {
    if (pullTargets.length === 0) return;
    setNotice(null);
    setActiveBatch({ verb: "Pulling", items: pullTargets.map((r) => ({ sessionId: r.sessionId, name: r.name })) });
    // Luôn Pull bản MỚI NHẤT — các bản cũ hơn chỉ là lịch sử backup phía Cloudflare, app không cần cho
    // chọn (không có dropdown chọn phiên bản nữa).
    const items = pullTargets.map((r) => ({ sessionId: r.sessionId, file: r.versions[0]?.file ?? "" }));
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

  // "Force Exit" — CHỈ hiện khi modal tự mở do đóng app lúc còn session chưa Push (quitPending). Bỏ
  // qua cảnh báo, thật sự đóng cửa sổ chính (main.ts's app:forceQuit) — khác "Close" (chỉ huỷ lượt
  // thoát hiện tại, app vẫn chạy tiếp để người dùng Push).
  function handleForceExit() {
    if (!confirm("Exit without pushing? Changes on this computer will stay out of sync with the cloud until your next Push.")) return;
    void window.api.cloud.forceQuit();
  }

  const pending = rows?.filter((r) => r.state !== "in-sync").length ?? 0;
  const allSelected = !!rows && rows.length > 0 && selected.size === rows.length;

  return (
    <Modal open title="Cloud Sync" onClose={handleClose} maxWidth="max-w-4xl" hideCloseButton>
      {configured === false && (
        <div className="space-y-3 text-sm text-base-300">
          <p>Cloud Sync isn't set up on this computer yet.</p>
          <Button onClick={openSettings}>Open Settings</Button>
        </div>
      )}

      {configured && (
        <>
          {quitPending && (
            <div className="mb-3 rounded-md border border-highlight-500/30 bg-highlight-500/10 px-3 py-2 text-sm text-highlight-600">
              You're about to close the app with sessions not yet pushed to the cloud. Push first, or use{" "}
              <span className="font-medium">Force Exit</span> to leave anyway.
            </div>
          )}
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
              <SessionRow key={row.sessionId} row={row} checked={selected.has(row.sessionId)} onToggle={() => toggleOne(row.sessionId)} />
            ))}
          </div>
          {rows && !canWrite && rows.some(isPushEligible) && (
            <p className="mt-2 text-xs text-base-500">
              This computer is read-only — add the write token in Settings to push.
            </p>
          )}
        </>
      )}

      {busy && (
        <div className="mt-5 flex min-w-0 flex-col gap-1 text-xs text-base-500">
          {/* Push/Pull nhiều session chạy TUẦN TỰ từng cái một (xem push()/pull() trong cloudSync.ts) —
              activeBatch (chụp lúc bấm nút) + sessionId của progress hiện tại cho biết đang ở session
              thứ mấy/tên gì, thay vì chỉ 1 dòng chung chung "Pushing 3 sessions..." không rõ tới đâu. */}
          <span className="truncate">
            {activeBatch && progress
              ? (() => {
                  const i = activeBatch.items.findIndex((x) => x.sessionId === progress.sessionId);
                  const name = i >= 0 ? activeBatch.items[i].name : progress.sessionId;
                  return `${activeBatch.verb} ${Math.max(i, 0) + 1}/${activeBatch.items.length} — ${name}`;
                })()
              : busy}
          </span>
          {progress && progress.total > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-base-800">
                <div
                  className="h-full bg-teal-500 transition-[width] duration-150 ease-linear"
                  style={{ width: `${Math.min(100, (progress.sent / progress.total) * 100)}%` }}
                />
              </div>
              <span className="shrink-0 tabular-nums">
                {formatBytes(progress.sent)} / {formatBytes(progress.total)}
                {speed != null && <> · {formatBytes(speed)}/s</>}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 2 cụm tách 2 bên: Close/Force Exit (huỷ hoặc thoát hẳn) bên trái, Delete/Pull/Push (thao tác
          dữ liệu) bên phải — mỗi nút rộng cố định (w-28) để không nhảy kích thước khi đổi số lượng
          (vd "Push" -> "Push (3)"), cách nhau 1 khoảng nhỏ (gap-2). */}
      <div className="mt-5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleClose} className="w-28">
            Close
          </Button>
          {quitPending && (
            <Button variant="danger" onClick={handleForceExit} className="w-28">
              Force Exit
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="danger" onClick={handleDeleteSelected} disabled={!!busy || deleteTargets.length === 0} className="w-28">
            Delete{deleteTargets.length > 0 ? ` (${deleteTargets.length})` : ""}
          </Button>
          <Button variant="secondary" onClick={handlePullSelected} disabled={!!busy || pullTargets.length === 0} className="w-28">
            Pull{pullTargets.length > 0 ? ` (${pullTargets.length})` : ""}
          </Button>
          <Button onClick={handlePushSelected} disabled={!!busy || !canWrite || pushTargets.length === 0} className="w-28">
            Push{pushTargets.length > 0 ? ` (${pushTargets.length})` : ""}
          </Button>
        </div>
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

// Kiểu "Delivery" của Facebook Ads: 1 chấm tròn màu + chữ ngắn gọn, KHÔNG phải pill nền màu — xem
// SessionRow. `dot` chỉ tô màu cái chấm, chữ dùng chung 1 màu trung tính (text-base-400) cho mọi trạng
// thái để không rối mắt như pill cũ.
const STATE_LABEL: Record<CloudSyncState, { text: string; hint: string; dot: string }> = {
  "in-sync": { text: "Up to date", hint: "Same as the latest version in the cloud", dot: "bg-blue-500" },
  "local-only": { text: "Local-only", hint: "Only on this computer", dot: "bg-base-500" },
  "cloud-only": { text: "Cloud-only", hint: "Not on this computer yet", dot: "bg-green-500" },
  "local-newer": { text: "Local newer", hint: "Edited on this computer since the last push", dot: "bg-amber-500" },
  "cloud-newer": { text: "Cloud newer", hint: "The cloud has a newer version than this computer", dot: "bg-sky-500" },
  diverged: {
    text: "Diverged",
    hint: "Edited here and in the cloud — syncing keeps both copies so you can choose",
    dot: "bg-danger-500",
  },
};

function isPushEligible(r: CloudSessionStatus): boolean {
  return r.state === "local-only" || r.state === "local-newer" || r.state === "diverged";
}

function isPullEligible(r: CloudSessionStatus): boolean {
  // "in-sync" (Up to date) không cần Pull gì nữa — local đã khớp hệt bản mới nhất trên cloud rồi.
  return r.versions.length > 0 && r.state !== "local-only" && r.state !== "local-newer" && r.state !== "in-sync";
}

function isDeleteEligible(r: CloudSessionStatus): boolean {
  return r.state === "local-only";
}

function SessionRow({ row, checked, onToggle }: { row: CloudSessionStatus; checked: boolean; onToggle: () => void }) {
  const label = STATE_LABEL[row.state];
  // Mốc sửa gần nhất — ưu tiên local (gần với việc người dùng đang thao tác hơn); cloud-only (không có
  // file local) thì dùng mốc cloud bản MỚI NHẤT (versions[0] — không còn cho chọn phiên bản cũ hơn
  // trong app, những bản đó chỉ là lịch sử backup phía Cloudflare R2). Dùng formatDateCompact() để vừa
  // cột, title= formatDate() đầy đủ phòng khi bị crop.
  const lastEditedSource = row.local ? ["this computer", row.local.modifiedAt] : row.versions[0] ? ["the cloud", row.versions[0].modifiedAt] : null;
  const lastEdited = lastEditedSource && `Last edited on ${lastEditedSource[0]} ${formatDateCompact(lastEditedSource[1])}`;
  const lastEditedFull = lastEditedSource && `Last edited on ${lastEditedSource[0]} ${formatDate(lastEditedSource[1])}`;
  // Diverged là trạng thái DUY NHẤT mà cả Push và Pull đều "hợp lệ" cùng lúc — người dùng dễ không biết
  // bấm nút nào. row.newer (status() trong cloudSync.ts đã tự tính theo modifiedAt) cho biết bên nào
  // sửa sau — hiện thẳng thành gợi ý rõ ràng ở đây thay vì giấu trong 1 dòng chữ nhỏ bị cắt ở cột
  // "Last edited..." như trước. Vẫn chỉ là GỢI Ý — người dùng tự tick + bấm Push/Pull như cũ, không có
  // gì tự chạy.
  const recommendation =
    row.state === "diverged"
      ? row.newer === "local"
        ? { text: "Recommended: Push", className: "text-gold-400" }
        : { text: "Recommended: Pull", className: "text-teal-400" }
      : null;

  return (
    <div
      onClick={onToggle}
      className={`grid cursor-pointer grid-cols-[auto_9rem_1fr_14rem] items-center gap-3 rounded-md border px-3 py-2 ${checked ? "border-gold-500/50 bg-gold-500/5" : "border-base-800"}`}
    >
      <input type="checkbox" readOnly checked={checked} className="shrink-0 accent-gold-500" />

      {/* Cột 1: status (chấm tròn + nhãn ngắn) + gợi ý Recommended riêng dòng dưới, chỉ Diverged mới có. */}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span title={label.hint} className="flex min-w-0 items-center gap-1.5 text-xs text-base-400">
          <span className={`h-2 w-2 shrink-0 rounded-full ${label.dot}`} />
          {label.text}
        </span>
        {recommendation && <span className={`text-[11px] font-medium ${recommendation.className}`}>{recommendation.text}</span>}
      </div>

      {/* Cột 2: Tên session — crop + "...", hover hiện tên đầy đủ qua title. */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm text-base-100" title={row.name}>
          {row.name}
        </span>
        {row.local?.closed && <span className="shrink-0 text-[10px] text-base-500">closed tab</span>}
      </div>

      {/* Cột 3: Thời gian sửa gần nhất — text thuần, không còn dropdown chọn phiên bản. */}
      {lastEdited && (
        <span className="truncate text-right text-[11px] text-base-500" title={lastEditedFull ?? undefined}>
          {lastEdited}
        </span>
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

// Bản gọn hơn formatDate() — chỉ cho dòng "Last edited..." trong cột Status (cột hẹp, dễ bị cắt với
// dd/mm/yyyy, hh:mm:ss đầy đủ). Vẫn còn `title` với formatDate() đầy đủ bên ngoài nếu bị crop.
function formatDateCompact(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

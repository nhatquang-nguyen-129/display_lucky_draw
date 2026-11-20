import { useEffect, useRef, useState } from "react";
import { SessionFileInfo } from "@/types";
import { useSession } from "@/context/SessionContext";
import { onConflictResolved } from "@/lib/cloudSyncEvents";
import Modal from "./Modal";
import Button from "./Button";

// Danh sách MỌI session của account đang login (kể cả tab Closed, xem sessions.listAll() trong
// electron/db.ts) — chọn 1 hoặc nhiều dòng rồi bấm Open để vào thẳng app. Push/Pull giờ tự động hoàn
// toàn (xem electron/cloudSync.ts scheduleAutoPush/catchUpPull) — modal này chỉ còn để MỞ session,
// không còn nút Push/Pull/Connect nào nữa. Dialog browse OS vẫn còn là lối phụ ("Browse for a file not
// shown here...") cho file ngoài data/ (USB, backup máy khác). Mở từ nút "Open" ở TabBar.tsx. Xem
// docs/architecture/cloud-sync.md.
export default function SessionsModal({ onClose }: { onClose: () => void }) {
  const { refresh, switchTab, openFile } = useSession();
  const [rows, setRows] = useState<SessionFileInfo[] | null>(null);
  // Session nào đang chờ auto-push (debounce) — chấm "Saving..." nhỏ, chỉ thông tin, không phải nút.
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Đóng modal lúc đang load vẫn không sao (fetch rất nhanh, chỉ đọc local) — ref này chỉ để tránh
  // setState lên component đã unmount, giống mọi modal khác trong app.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void load();
  }, []);

  // SessionConflictDialog.tsx báo khi 1 conflict vừa resolve xong ở nơi khác (vd Browse trùng id với
  // session có sẵn) — tự load lại ngay, không chờ người dùng bấm Refresh.
  useEffect(() => onConflictResolved(() => { if (!busy) void load(); }), [busy]);

  // Poll nhẹ — chỉ để người dùng yên tâm dữ liệu đang được tự đẩy lên cloud, không cần chính xác
  // real-time (auto-push vốn đã debounce 5s, xem cloudSync.ts).
  useEffect(() => {
    const tick = () => void window.api.auth.pendingPushSessionIds().then((ids) => mountedRef.current && setPending(new Set(ids)));
    tick();
    const timer = setInterval(tick, 2000);
    return () => clearInterval(timer);
  }, []);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const list = await window.api.sessions.listAll();
      if (!mountedRef.current) return;
      const sorted = [...list].sort((a, b) => Number(a.closed) - Number(b.closed) || a.name.localeCompare(b.name));
      setRows(sorted);
      // Bỏ chọn session không còn trong danh sách (vd vừa bị Delete ở nơi khác).
      setSelected((prev) => new Set([...prev].filter((id) => sorted.some((r) => r.id === id))));
    } catch (err) {
      if (mountedRef.current) setError((err as Error).message);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
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
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  const openTargets = rows?.filter((r) => selected.has(r.id)) ?? [];

  // Mở mọi dòng đang chọn — Closed thì setClosed(false), đã Open rồi thì bỏ qua (idempotent). Chỉ
  // switchTab khi đúng 1 session mở trong lượt này (và tự đóng modal); > 1 thì giữ nguyên tab đang
  // active, chỉ báo notice số lượng.
  async function handleOpenSelected() {
    const targets = openTargets;
    if (targets.length === 0) return;
    setNotice(null);
    setError(null);
    setBusy(true);
    const failed: string[] = [];
    const openedIds: string[] = [];
    try {
      for (const r of targets) {
        try {
          if (r.closed) await window.api.sessions.setClosed({ id: r.id, closed: false });
          openedIds.push(r.id);
        } catch (err) {
          failed.push(`${r.name}: ${(err as Error).message}`);
        }
      }
      await refresh();
    } finally {
      if (mountedRef.current) setBusy(false);
    }
    if (!mountedRef.current) return;
    if (failed.length) setError(failed.join(" · "));
    if (openedIds.length === 1) {
      switchTab(openedIds[0]);
      if (!failed.length) {
        onClose();
        return;
      }
    } else if (openedIds.length > 1) {
      setNotice(`${openedIds.length} sessions opened.`);
    }
    await load();
  }

  // Lối phụ cho file KHÔNG hiện trong danh sách (USB, backup máy khác) — tái dùng nguyên openFile() của
  // SessionContext.tsx (dialog OS mặc định data/, tự refresh + switchTab + báo "already open" nếu trùng
  // tab đang mở), chỉ thêm đóng modal khi thành công.
  async function handleBrowse() {
    await openFile();
    onClose();
  }

  const allSelected = !!rows && rows.length > 0 && selected.size === rows.length;

  return (
    <Modal open title="Open Session" onClose={onClose} maxWidth="max-w-2xl" hideCloseButton>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-base-500">
          {rows === null ? "Loading sessions..." : `${rows.length} session${rows.length === 1 ? "" : "s"} in your account.`}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={handleBrowse} disabled={busy}>
            Browse...
          </Button>
          <Button variant="secondary" size="sm" onClick={load} disabled={busy}>
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-2 rounded-md border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">
          {error}
        </div>
      )}
      {notice && <p className="mb-2 text-xs text-teal-500">{notice}</p>}
      {rows && rows.length === 0 && <p className="text-xs text-base-500">No sessions yet.</p>}

      {rows && rows.length > 0 && (
        <label className="mb-1.5 flex items-center gap-2 px-1 text-xs text-base-400">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-gold-500" />
          Select all
        </label>
      )}

      <div className="max-h-[26rem] space-y-2 overflow-y-auto">
        {rows?.map((row) => (
          <SessionRow key={row.id} row={row} checked={selected.has(row.id)} saving={pending.has(row.id)} onToggle={() => toggleOne(row.id)} />
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} className="w-20">
          Close
        </Button>
        <Button variant="secondary" size="sm" onClick={handleOpenSelected} disabled={busy || openTargets.length === 0} className="w-24">
          Open{openTargets.length > 0 ? ` (${openTargets.length})` : ""}
        </Button>
      </div>
    </Modal>
  );
}

function SessionRow({
  row,
  checked,
  saving,
  onToggle,
}: {
  row: SessionFileInfo;
  checked: boolean;
  saving: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      className={`grid cursor-pointer grid-cols-[auto_5rem_1fr_5rem] items-center gap-3 rounded-md border px-3 py-2 ${checked ? "border-gold-500/50 bg-gold-500/5" : "border-base-800"}`}
    >
      <input type="checkbox" readOnly checked={checked} className="shrink-0 accent-gold-500" />
      <span className={`truncate text-xs ${row.closed ? "text-base-600" : "text-base-300"}`}>{row.closed ? "Closed" : "Open"}</span>
      <span className="min-w-0 truncate text-sm text-base-100" title={row.name}>
        {row.name}
      </span>
      <span className="truncate text-right text-[11px] text-base-500">{saving ? "Saving..." : "Saved"}</span>
    </div>
  );
}

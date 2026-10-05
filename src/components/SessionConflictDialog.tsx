import { useCallback, useEffect, useState } from "react";
import { SessionConflict } from "@/types";
import { useSession } from "@/context/SessionContext";
import Button from "./Button";

// Mỗi session = 1 file trong data/ (xem electron/db.ts). Cùng 1 session (cùng id) có ≥ 2 file — vd copy
// qua lại giữa 2 máy mà mỗi bên sửa riêng — thì KHÔNG gộp được (gộp kết quả quay có thể làm 1 người
// trúng 2 lần / trừ sai số giải). Hộp thoại này hiện NGAY khi mở app (và mỗi lần quay lại cửa sổ nếu
// vừa có file mới chép vào): gợi ý bản sửa gần nhất nhưng để người dùng tự chọn; các bản không chọn
// được chuyển vào data/.trash/ (không xoá hẳn). Chưa chọn thì app vẫn dùng bản mới nhất lúc khởi động.
// "Keep both": 2 file cùng id là 2 bản dựng CỐ Ý khác nhau (vd copy rồi đổi tên LED-Ngang/LED-Doc) — giữ
// mọi bản, bản đang chọn được cấp id mới thành tab riêng (keepBothConflict trong db.ts).
export default function SessionConflictDialog() {
  const { refresh } = useSession();
  const [conflicts, setConflicts] = useState<SessionConflict[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const list = await window.api.sessions.conflicts();
    setConflicts(list);
    setChoice((prev) => {
      const next: Record<string, string> = {};
      for (const c of list) {
        const kept = prev[c.sessionId];
        next[c.sessionId] =
          kept && c.copies.some((x) => x.file === kept) ? kept : (c.copies.find((x) => x.recommended) ?? c.copies[0]).file;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  async function handleKeepBoth() {
    setSaving(true);
    try {
      for (const c of conflicts) {
        await window.api.sessions.keepBothConflict({ sessionId: c.sessionId, file: choice[c.sessionId] });
      }
      await refresh();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirm() {
    setSaving(true);
    try {
      for (const c of conflicts) {
        await window.api.sessions.resolveConflict({ sessionId: c.sessionId, keepFile: choice[c.sessionId] });
      }
      await refresh();
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (conflicts.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-xl border border-base-800 bg-base-900 p-6 shadow-2xl">
        <h2 className="font-display text-lg font-medium text-base-100">Different copies of the same session</h2>
        <p className="mt-2 text-sm text-base-400">
          The data folder has more than one file for the session(s) below — probably copied between machines and edited
          on both. They can't be merged safely (draw results could conflict), so choose which copy to keep. The other
          copies are moved to <span className="font-mono text-base-300">data/.trash</span>, not deleted.
        </p>
        <p className="mt-2 text-sm text-base-400">
          If they are intentionally different setups (e.g. one copy per LED layout), use{" "}
          <span className="font-medium text-base-200">Keep both</span>: every copy is kept and the selected one gets a
          new session ID, so it opens as its own tab.
        </p>

        <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto">
          {conflicts.map((c) => (
            <div key={c.sessionId}>
              <p className="mb-2 text-sm font-medium text-base-100">
                {c.name} <span className="font-mono text-xs text-base-500">({c.sessionId.slice(0, 8)})</span>
              </p>
              <table className="w-full text-left text-xs">
                <thead className="text-base-500">
                  <tr>
                    <th className="w-8 py-1" />
                    <th className="py-1 font-medium">File</th>
                    <th className="py-1 font-medium">Last modified</th>
                    <th className="py-1 text-right font-medium">Participants</th>
                    <th className="py-1 text-right font-medium">Prizes</th>
                    <th className="py-1 text-right font-medium">Confirmed draws</th>
                  </tr>
                </thead>
                <tbody>
                  {c.copies.map((copy) => {
                    const selected = choice[c.sessionId] === copy.file;
                    return (
                      <tr
                        key={copy.file}
                        onClick={() => setChoice((prev) => ({ ...prev, [c.sessionId]: copy.file }))}
                        className={`cursor-pointer border-t border-base-800 text-base-300 ${selected ? "bg-gold-500/10" : "hover:bg-base-800/60"}`}
                      >
                        <td className="py-2 pl-1">
                          <input type="radio" readOnly checked={selected} className="accent-gold-500" />
                        </td>
                        <td className="py-2 font-mono">
                          {copy.file}
                          {copy.recommended && (
                            <span className="ml-2 rounded bg-teal-500/15 px-1.5 py-0.5 font-sans text-[10px] font-medium text-teal-400">
                              Newest — recommended
                            </span>
                          )}
                        </td>
                        <td className="py-2">{new Date(copy.modifiedAt).toLocaleString()}</td>
                        <td className="py-2 text-right">{copy.participants}</td>
                        <td className="py-2 text-right">{copy.prizes}</td>
                        <td className="py-2 text-right">{copy.confirmedDraws}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => window.api.sessions.openDataFolder()}>
            Open data folder
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={handleKeepBoth}
              disabled={saving}
              title="Keep every copy — the selected copy gets a new session ID and opens as its own tab"
            >
              Keep both (new ID for selected)
            </Button>
            <Button onClick={handleConfirm} disabled={saving}>
              {saving ? "Saving..." : "Keep selected copies"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

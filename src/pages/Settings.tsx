import { useEffect, useState } from "react";
import { CloudSettings, CloudSpace } from "@/types";
import Button from "@/components/Button";

// Cloud server mặc định của app — 1 app chỉ dùng 1 cloud (Worker + R2 do chủ dự án deploy, xem
// cloud/worker/). Vẫn sửa được trong ô Server URL (vd chạy `wrangler dev` local để thử).
const DEFAULT_WORKER_URL = "https://lucky-draw-sync.luckydrawstudio.workers.dev";

// Trang Settings (sidebar). Hiện chỉ có Cloud Sync: khai báo kết nối (URL + read code + write token, lưu
// ở data/.cloud-sync.json). So sánh local ↔ cloud + Push/Sync nằm ở nút "Cloud" trên TabBar
// (CloudSyncModal.tsx). Xem docs/architecture/cloud-sync.md.
export default function Settings() {
  return (
    <div>
      <header className="mb-6">
        <p className="text-sm text-base-400">App-wide settings — shared by every session on this computer.</p>
      </header>
      <div className="max-w-2xl space-y-6">
        <CloudConnectionCard />
      </div>
    </div>
  );
}

function CloudConnectionCard() {
  const [form, setForm] = useState<CloudSettings>({ workerUrl: DEFAULT_WORKER_URL, readCode: "", writeToken: "" });
  const [showToken, setShowToken] = useState(false);
  const [space, setSpace] = useState<CloudSpace | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Đã có mã lưu từ trước → tự Connect lại để kiểm tra mã còn hợp lệ + lấy tên Space.
  useEffect(() => {
    window.api.cloud.getSettings().then((saved) => {
      const next = { ...saved, workerUrl: saved.workerUrl || DEFAULT_WORKER_URL };
      setForm(next);
      if (saved.workerUrl && (saved.readCode || saved.writeToken)) void connect(next);
      else setEditing(true);
    });
  }, []);

  async function connect(settings: CloudSettings) {
    setBusy(true);
    setError(null);
    try {
      const r = await window.api.cloud.connect(settings);
      if ("error" in r) {
        setError(r.error);
        setSpace(null);
        setEditing(true);
      } else {
        setSpace(r);
        setEditing(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    await window.api.cloud.disconnect();
    setForm({ workerUrl: DEFAULT_WORKER_URL, readCode: "", writeToken: "" });
    setSpace(null);
    setEditing(true);
  }

  const canConnect = form.workerUrl.trim() !== "" && (form.readCode.trim() !== "" || form.writeToken.trim() !== "") && !busy;

  return (
    <div className="rounded-xl border border-base-800 bg-base-900 p-6">
      <h2 className="font-display text-base font-medium text-base-100">Cloud Sync</h2>
      <p className="mt-1 text-xs text-base-400">
        Connect this computer to the cloud. Use the Cloud button on the tab bar to compare, push and sync sessions.
      </p>

      {space && !editing ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-base-800 px-3 py-2 text-sm">
          <div className="min-w-0">
            <div className="truncate text-base-100">{space.name || "Untitled space"}</div>
            <div className="text-xs text-base-500">
              Connected · {space.role === "write" ? "Read & write" : "Read only"}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <button onClick={() => setEditing(true)} className="px-2 text-xs text-base-400 hover:text-base-100">
              Change
            </button>
            <button onClick={disconnect} className="px-2 text-xs text-base-400 hover:text-danger-500">
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-base-400">
            Server URL
            <input
              value={form.workerUrl}
              onChange={(e) => setForm({ ...form, workerUrl: e.target.value })}
              className="mt-1 w-full rounded-md border border-base-700 bg-base-950 px-2 py-1.5 text-sm text-base-100 outline-none"
            />
          </label>
          <label className="block text-xs font-medium text-base-400">
            Read code
            <input
              value={form.readCode}
              onChange={(e) => setForm({ ...form, readCode: e.target.value })}
              placeholder="XXXXX-XXXXX"
              className="mt-1 w-full rounded-md border border-base-700 bg-base-950 px-2 py-1.5 font-mono text-sm text-base-100 outline-none"
            />
          </label>
          <label className="block text-xs font-medium text-base-400">
            Write token <span className="font-normal text-base-500">(optional — only needed to push)</span>
            <div className="mt-1 flex gap-1.5">
              <input
                type={showToken ? "text" : "password"}
                value={form.writeToken}
                onChange={(e) => setForm({ ...form, writeToken: e.target.value })}
                className="w-full rounded-md border border-base-700 bg-base-950 px-2 py-1.5 font-mono text-sm text-base-100 outline-none"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="shrink-0 px-2 text-xs text-base-400 hover:text-base-100"
              >
                {showToken ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <p className="text-xs text-base-500">
            The codes are saved in your data folder so this computer stays connected. Leave the write token
            empty on computers that should only download sessions.
          </p>
          <div className="flex justify-end gap-2">
            {space && (
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </Button>
            )}
            <Button onClick={() => connect(form)} disabled={!canConnect}>
              {busy ? "Connecting..." : "Connect"}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">
          {error}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { LooseSessionFile, PublicSession } from "@/types";
import Button from "@/components/Button";

// Cố định trong mã nguồn, KHÔNG có ô nào trong UI để sửa (xem docs/architecture/cloud-sync.md). Tự
// chọn môi trường theo CÁCH APP ĐANG CHẠY, không cần cờ/biến gì thêm lúc build:
// - `npm run electron:dev` (Vite dev server, `import.meta.env.DEV === true`) → Worker dev
//   (`cloud/worker/wrangler.toml`'s `[env.dev]`, deploy bằng `wrangler deploy --env dev`).
// - `npm run package` (Vite production build) → Worker prod.
const WORKER_URL = import.meta.env.DEV
  ? "https://dev.lucky-draw-studio.workers.dev"
  : "https://prod.lucky-draw-studio.workers.dev";

// Màn hình ĐẦU TIÊN người dùng thấy khi mở app lần đầu (hoặc sau khi logout) — cố tình tối giản như 1
// màn "Activate" sản phẩm: chỉ 1 ô nhập mã + 1 nút, không lặp lại tên app (đã có ở thanh tiêu đề cửa
// sổ), không giải thích dài dòng. Mã đăng nhập do admin tạo (Settings → Accounts) — KHÔNG có username/
// password/"quên mật khẩu" (hệ thống không lưu email để khôi phục), mất mã thì admin Regenerate code.
export default function Login({ onSuccess }: { onSuccess: (session: PublicSession) => void }) {
  const [loginCode, setLoginCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lần đầu account này login trên máy này mà máy đã có sẵn file .db rời (từ trước khi có tính năng
  // Account) — hỏi 1 lần có muốn nhận vào account không (xem auth.login()/listRootLooseSessionFiles()).
  const [loose, setLoose] = useState<{ session: PublicSession; files: LooseSessionFile[] } | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  async function submit() {
    if (busy || !loginCode.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await window.api.auth.login({ workerUrl: WORKER_URL, loginCode: loginCode.trim() });
      if ("error" in r) return setError(r.error);
      const { looseFiles, ...session } = r;
      if (looseFiles.length > 0) {
        setLoose({ session, files: looseFiles });
        setChosen(new Set(looseFiles.map((f) => f.file)));
      } else {
        onSuccess(session);
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleFile(file: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  }

  async function finishImport(doImport: boolean) {
    if (!loose) return;
    setImporting(true);
    try {
      if (doImport && chosen.size > 0) await window.api.auth.importLooseFiles([...chosen]);
      onSuccess(loose.session);
    } finally {
      setImporting(false);
    }
  }

  if (loose) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-950 px-4">
        <div className="w-full max-w-md rounded-xl border border-base-800 bg-base-900 p-6">
          <h1 className="font-display text-lg font-medium text-base-100">
            Found {loose.files.length} session{loose.files.length === 1 ? "" : "s"} on this computer
          </h1>
          <p className="mt-1 text-xs text-base-400">
            These were never linked to an account. Add them to <span className="text-base-200">{loose.session.name}</span> now, or
            leave them as they are.
          </p>
          <div className="mt-4 max-h-64 space-y-1.5 overflow-y-auto">
            {loose.files.map((f) => (
              <label
                key={f.file}
                className="flex items-center gap-2 rounded-md border border-base-800 px-2.5 py-1.5 text-sm text-base-100"
              >
                <input type="checkbox" checked={chosen.has(f.file)} onChange={() => toggleFile(f.file)} className="accent-gold-500" />
                <span className="truncate">{f.name}</span>
              </label>
            ))}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => finishImport(false)} disabled={importing}>
              Skip
            </Button>
            <Button onClick={() => finishImport(true)} disabled={importing || chosen.size === 0}>
              {importing ? "Importing..." : `Import${chosen.size ? ` (${chosen.size})` : ""}`}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-950 px-4">
      <div className="w-full max-w-xs">
        <label className="mb-1.5 block text-center text-xs font-medium text-base-500">Access Code</label>
        <input
          value={loginCode}
          onChange={(e) => setLoginCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="XXXXX-XXXXX"
          autoFocus
          className="w-full rounded-md border border-base-700 bg-base-950 px-3 py-2 text-center font-mono text-sm text-base-100 outline-none"
        />

        {error && <p className="mt-3 text-center text-sm text-danger-500">{error}</p>}

        <Button onClick={submit} disabled={busy || !loginCode.trim()} className="mt-4 w-full">
          {busy ? "Activating..." : "Activate"}
        </Button>
      </div>
    </div>
  );
}

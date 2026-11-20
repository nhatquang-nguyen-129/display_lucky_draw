import { useEffect, useState } from "react";
import { AccountRow, PublicSession } from "@/types";
import Button from "@/components/Button";

// Trang Settings (sidebar) — app-wide, dùng chung cho mọi session trên máy này. Hiện Account đang login
// (+ Log out) và, CHỈ với account isAdmin, bảng quản lý mọi account (tạo mới/regenerate code/force
// logout/disable). Mở session/đổi tab nằm ở nút "Open" trên TabBar (SessionsModal.tsx). Xem
// docs/architecture/cloud-sync.md.
export default function Settings() {
  const [session, setSession] = useState<PublicSession | null>(null);

  useEffect(() => {
    void window.api.auth.getSession().then(setSession);
  }, []);

  return (
    <div>
      <header className="mb-6">
        <p className="text-sm text-base-400">App-wide settings — shared by every session on this computer.</p>
      </header>
      <div className="max-w-2xl space-y-6">
        <AccountCard session={session} />
        {session?.isAdmin && <AccountsAdminCard />}
      </div>
    </div>
  );
}

function AccountCard({ session }: { session: PublicSession | null }) {
  const [busy, setBusy] = useState(false);

  async function logout() {
    if (!confirm("Log out of this account on this computer?")) return;
    setBusy(true);
    try {
      await window.api.auth.logout();
      // Reload — gọn nhất để toàn bộ renderer (SessionContext, danh sách tab...) khởi động lại sạch
      // theo trạng thái "chưa đăng nhập" (<RequireAuth> trong src/App.tsx sẽ tự hiện màn Login).
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-base-800 bg-base-900 p-6">
      <h2 className="font-display text-base font-medium text-base-100">Account</h2>
      <p className="mt-1 text-xs text-base-400">Signed in on this computer. Only 1 device can be signed in to an account at a time.</p>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-base-800 px-3 py-2 text-sm">
        <div className="min-w-0">
          <div className="truncate text-base-100">{session?.name ?? "..."}</div>
          <div className="text-xs text-base-500">{session?.isAdmin ? "Admin" : "Member"}</div>
        </div>
        <Button variant="danger" size="sm" onClick={logout} disabled={busy}>
          Log out
        </Button>
      </div>
    </div>
  );
}

function AccountsAdminCard() {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // accountId (hoặc "create") đang xử lý
  const [error, setError] = useState<string | null>(null);
  // Mã mới tạo/regenerate — hiện ĐÚNG 1 LẦN, mất là không lấy lại được (giống Read/Write code cũ).
  const [revealedCode, setRevealedCode] = useState<{ name: string; loginCode: string } | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const r = await window.api.auth.listAccounts();
    if ("error" in r) return setError(r.error);
    setAccounts(r.accounts);
  }

  async function createAccount() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy("create");
    setError(null);
    try {
      const r = await window.api.auth.createAccount(trimmed);
      if ("error" in r) return setError(r.error);
      setRevealedCode({ name: r.name, loginCode: r.loginCode });
      setName("");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function regenerateCode(accountId: string, accountName: string) {
    if (!confirm(`Generate a new login code for "${accountName}"? The old code will stop working immediately.`)) return;
    setBusy(accountId);
    setError(null);
    try {
      const r = await window.api.auth.regenerateCode(accountId);
      if ("error" in r) return setError(r.error);
      setRevealedCode({ name: accountName, loginCode: r.loginCode });
    } finally {
      setBusy(null);
    }
  }

  async function forceLogout(accountId: string, accountName: string) {
    if (!confirm(`Sign "${accountName}" out everywhere right now (without waiting for it to time out)?`)) return;
    setBusy(accountId);
    setError(null);
    try {
      const r = await window.api.auth.forceLogoutAccount(accountId);
      if ("error" in r) return setError(r.error);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function toggleDisabled(accountId: string, disabled: boolean) {
    setBusy(accountId);
    setError(null);
    try {
      const r = await window.api.auth.setAccountDisabled({ accountId, disabled });
      if ("error" in r) return setError(r.error);
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-base-800 bg-base-900 p-6">
      <h2 className="font-display text-base font-medium text-base-100">Accounts</h2>
      <p className="mt-1 text-xs text-base-400">
        Create a login code for each team borrowing the app — their data stays completely separate from everyone else's.
      </p>

      <div className="mt-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Team name"
          onKeyDown={(e) => e.key === "Enter" && createAccount()}
          className="w-full rounded-md border border-base-700 bg-base-950 px-2 py-1.5 text-sm text-base-100 outline-none"
        />
        <Button onClick={createAccount} disabled={!name.trim() || busy === "create"}>
          {busy === "create" ? "Creating..." : "Create"}
        </Button>
      </div>

      {revealedCode && (
        <div className="mt-3 rounded-md border border-gold-500/30 bg-gold-500/5 px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-base-300">
              Login code for <span className="font-medium text-base-100">{revealedCode.name}</span>:
            </span>
            <button onClick={() => setRevealedCode(null)} className="text-xs text-base-500 hover:text-base-100">
              Dismiss
            </button>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <code className="rounded bg-base-950 px-2 py-1 font-mono text-sm text-gold-300">{revealedCode.loginCode}</code>
            <button
              onClick={() => navigator.clipboard.writeText(revealedCode.loginCode)}
              className="text-xs text-base-400 hover:text-base-100"
            >
              Copy
            </button>
          </div>
          <p className="mt-1 text-xs text-base-500">Save this now — it won't be shown again.</p>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">{error}</div>
      )}

      <div className="mt-4 space-y-2">
        {accounts?.map((a) => (
          <div key={a.accountId} className="flex items-center justify-between gap-3 rounded-md border border-base-800 px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className={`truncate ${a.disabled ? "text-base-500 line-through" : "text-base-100"}`}>
                {a.name}
                {a.isAdmin && <span className="ml-1.5 text-xs text-base-500">(Admin)</span>}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-base-500">
                <span className={`h-1.5 w-1.5 rounded-full ${a.online ? "bg-teal-500" : "bg-base-600"}`} />
                {a.online ? "Online" : "Offline"}
                {a.disabled && " · Disabled"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => regenerateCode(a.accountId, a.name)}
                disabled={!!busy}
                className="px-2 text-xs text-base-400 hover:text-base-100 disabled:opacity-50"
              >
                Regenerate code
              </button>
              {a.online && (
                <button
                  onClick={() => forceLogout(a.accountId, a.name)}
                  disabled={!!busy}
                  className="px-2 text-xs text-base-400 hover:text-base-100 disabled:opacity-50"
                >
                  Force logout
                </button>
              )}
              {!a.isAdmin && (
                <button
                  onClick={() => toggleDisabled(a.accountId, !a.disabled)}
                  disabled={!!busy}
                  className="px-2 text-xs text-base-400 hover:text-danger-500 disabled:opacity-50"
                >
                  {a.disabled ? "Enable" : "Disable"}
                </button>
              )}
            </div>
          </div>
        ))}
        {accounts && accounts.length === 0 && <p className="text-xs text-base-500">No accounts yet.</p>}
      </div>
    </div>
  );
}

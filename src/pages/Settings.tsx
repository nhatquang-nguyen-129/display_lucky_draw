import { useEffect, useState } from "react";
import { AccountRow, PublicSession } from "@/types";
import Button from "@/components/Button";
import Modal from "@/components/Modal";

// Trang Settings (sidebar) — app-wide, dùng chung cho mọi session trên máy này. Hiện Account đang login
// (+ Log out) và, CHỈ với account isAdmin, bảng quản lý mọi account (tạo mới bằng username/password, đặt
// lại mật khẩu, force logout, disable). Mở session/đổi tab nằm ở nút "Open" trên TabBar (SessionsModal.tsx). Xem
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

// Danh sách tài khoản (chỉ admin thấy) + trạng thái Online — tạo tài khoản / đặt lại mật khẩu mở popup
// (Modal) thay vì ô nhập có sẵn trên trang. Tự làm mới mỗi 30 giây khi trang đang mở (Online = máy đó còn
// gửi heartbeat trong 90 giây gần nhất, xem electron/auth.ts).
function AccountsAdminCard() {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // accountId đang xử lý
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetTarget, setResetTarget] = useState<AccountRow | null>(null);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, []);

  async function load() {
    const r = await window.api.auth.listAccounts();
    if ("error" in r) return setError(r.error);
    setAccounts(r.accounts);
  }

  async function forceLogout(a: AccountRow) {
    if (!confirm(`Sign "${a.username}" out everywhere right now (without waiting for it to time out)?`)) return;
    setBusy(a.accountId);
    setError(null);
    try {
      const r = await window.api.auth.forceLogoutAccount(a.accountId);
      if ("error" in r) return setError(r.error);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function toggleDisabled(a: AccountRow) {
    setBusy(a.accountId);
    setError(null);
    try {
      const r = await window.api.auth.setAccountDisabled({ accountId: a.accountId, disabled: !a.disabled });
      if ("error" in r) return setError(r.error);
      await load();
    } finally {
      setBusy(null);
    }
  }

  const onlineCount = accounts?.filter((a) => a.online).length ?? 0;

  return (
    <div className="rounded-xl border border-base-800 bg-base-900 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-medium text-base-100">Accounts</h2>
          <p className="mt-1 text-xs text-base-400">
            {accounts === null
              ? "Loading accounts..."
              : `${accounts.length} account${accounts.length === 1 ? "" : "s"} · ${onlineCount} online`}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setNotice(null);
            setCreating(true);
          }}
        >
          Create account
        </Button>
      </div>

      {notice && <p className="mt-3 text-sm text-teal-500">{notice}</p>}
      {error && (
        <div className="mt-3 rounded-md border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">{error}</div>
      )}

      <div className="mt-4 space-y-2">
        {accounts?.map((a) => (
          <div key={a.accountId} className="flex items-center justify-between gap-3 rounded-md border border-base-800 px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className={`truncate ${a.disabled ? "text-base-500 line-through" : "text-base-100"}`}>
                {a.username}
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
                onClick={() => {
                  setNotice(null);
                  setResetTarget(a);
                }}
                disabled={!!busy}
                className="px-2 text-xs text-base-400 hover:text-base-100 disabled:opacity-50"
              >
                Reset password
              </button>
              {a.online && (
                <button
                  onClick={() => forceLogout(a)}
                  disabled={!!busy}
                  className="px-2 text-xs text-base-400 hover:text-base-100 disabled:opacity-50"
                >
                  Force logout
                </button>
              )}
              {!a.isAdmin && (
                <button
                  onClick={() => toggleDisabled(a)}
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

      {creating && (
        <CreateAccountModal
          onClose={() => setCreating(false)}
          onCreated={async (username) => {
            setCreating(false);
            setNotice(`Account "${username}" created. Share the username and password with that team.`);
            await load();
          }}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal
          account={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={() => {
            setNotice(`Password updated for "${resetTarget.username}".`);
            setResetTarget(null);
          }}
        />
      )}
    </div>
  );
}

const modalInputClass =
  "w-full rounded-md border border-base-700 bg-base-950 px-3 py-2 text-sm text-base-100 outline-none placeholder:text-base-500 focus:border-gold-500";

function CreateAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = !busy && !!username.trim() && !!password && !!confirmPassword;

  async function submit() {
    if (!canSubmit) return;
    if (password !== confirmPassword) return setError("Passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      const r = await window.api.auth.createAccount({ username: username.trim(), password });
      if ("error" in r) return setError(r.error);
      onCreated(r.username);
    } finally {
      setBusy(false);
    }
  }

  const onEnter = (e: React.KeyboardEvent) => e.key === "Enter" && submit();

  return (
    <Modal open title="Create account" onClose={onClose} hideCloseButton>
      <p className="mb-4 text-center text-xs text-base-400">
        One account per team borrowing the app — its data stays completely separate from every other account.
      </p>
      <div className="space-y-3">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={onEnter}
          placeholder="Username"
          aria-label="Username"
          autoComplete="off"
          autoFocus
          className={modalInputClass}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={onEnter}
          placeholder="Password"
          aria-label="Password"
          autoComplete="new-password"
          className={modalInputClass}
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onKeyDown={onEnter}
          placeholder="Confirm password"
          aria-label="Confirm password"
          autoComplete="new-password"
          className={modalInputClass}
        />
      </div>
      <p className="mt-2 text-[11px] text-base-500">
        Username: 3–32 characters — letters, numbers, dot, dash or underscore. Password: at least 8 characters.
      </p>
      {error && <p className="mt-3 text-center text-sm text-danger-500">{error}</p>}
      <div className="mt-5 flex justify-between gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} className="w-20">
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={!canSubmit}>
          {busy ? "Creating..." : "Create account"}
        </Button>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ account, onClose, onDone }: { account: AccountRow; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = !busy && !!password && !!confirmPassword;

  async function submit() {
    if (!canSubmit) return;
    if (password !== confirmPassword) return setError("Passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      const r = await window.api.auth.resetAccountPassword({ accountId: account.accountId, password });
      if ("error" in r) return setError(r.error);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  const onEnter = (e: React.KeyboardEvent) => e.key === "Enter" && submit();

  return (
    <Modal open title={`Reset password — ${account.username}`} onClose={onClose} hideCloseButton>
      <div className="space-y-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={onEnter}
          placeholder="New password"
          aria-label="New password"
          autoComplete="new-password"
          autoFocus
          className={modalInputClass}
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onKeyDown={onEnter}
          placeholder="Confirm password"
          aria-label="Confirm password"
          autoComplete="new-password"
          className={modalInputClass}
        />
      </div>
      <p className="mt-2 text-[11px] text-base-500">At least 8 characters.</p>
      {error && <p className="mt-3 text-center text-sm text-danger-500">{error}</p>}
      <div className="mt-5 flex justify-between gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} className="w-20">
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={!canSubmit}>
          {busy ? "Saving..." : "Set password"}
        </Button>
      </div>
    </Modal>
  );
}

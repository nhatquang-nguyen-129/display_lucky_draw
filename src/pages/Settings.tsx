import { useEffect, useState } from "react";
import { AccountRow, AdminSessionRow, PublicSession } from "@/types";
import Modal from "@/components/Modal";
import { BusyIndicator } from "@/components/Spinner";

// Trang Settings (sidebar) — app-wide, dùng chung cho mọi session trên máy này. Account đang login +
// Log out giờ nằm ở TabBar.tsx (cạnh Open/Restore), KHÔNG còn card riêng ở đây. Admin thấy ĐÚNG 1 khung
// — quản lý mọi account (tạo mới bằng username/password, đặt lại mật khẩu, force logout, disable); tài
// khoản thường không có gì để cấu hình ở trang này. Mở session/đổi tab nằm ở nút "Open" trên TabBar
// (SessionsModal.tsx). Xem docs/architecture/cloud-sync.md.
export default function Settings() {
  const [session, setSession] = useState<PublicSession | null>(null);

  useEffect(() => {
    void window.api.auth.getSession().then(setSession);
  }, []);

  return (
    <div>
      {session?.isAdmin ? <AccountsAdminCard /> : <p className="text-sm text-base-500">Nothing to configure here yet.</p>}
    </div>
  );
}

// Danh sách tài khoản (chỉ admin thấy) + trạng thái Online — tạo tài khoản / đặt lại mật khẩu mở popup
// (Modal) thay vì ô nhập có sẵn trên trang. Tự làm mới mỗi 30 giây khi trang đang mở (Online = máy đó còn
// gửi heartbeat trong 90 giây gần nhất, xem electron/auth.ts).
// Nút trong CÙNG 1 cụm điều khiển (thanh công cụ, chân popup) dùng chung khung kích thước `BTN_BASE` — cùng
// cao, cùng rộng, không co theo độ dài chữ (quy tắc "Nút bấm" ở CLAUDE.md). Màu GIỮ NGUYÊN kiểu nút sẵn có
// của app (không lấy theo bộ màu thương hiệu): primary/secondary/danger = đúng các variant của Button.tsx,
// outline = nút viền mảnh xám của thanh công cụ (hover mới đổi màu).
const BTN_BASE =
  "inline-flex h-8 w-32 shrink-0 items-center justify-center whitespace-nowrap rounded-md border text-xs font-medium transition-colors disabled:cursor-default disabled:opacity-40";
const BTN = {
  primary: `${BTN_BASE} border-gold-500 bg-gold-500 text-base-950 hover:bg-gold-400 disabled:hover:bg-gold-500`,
  secondary: `${BTN_BASE} border-base-700 bg-base-800 text-base-100 hover:bg-base-700 disabled:hover:bg-base-800`,
  danger: `${BTN_BASE} border-danger-500/30 bg-danger-500/10 text-danger-500 hover:bg-danger-500/20 disabled:hover:bg-danger-500/10`,
  outline: `${BTN_BASE} border-base-700 text-base-400 hover:border-gold-500/50 hover:text-gold-500 disabled:hover:border-base-700 disabled:hover:text-base-400`,
  outlineDanger: `${BTN_BASE} border-base-700 text-base-400 hover:border-danger-500/50 hover:text-danger-500 disabled:hover:border-base-700 disabled:hover:text-base-400`,
};

// Cột: (chọn) | Trạng thái | Account (tối đa 16rem) | Sessions | Storage | Last sync | (giãn).
// 1 grid chung cho cả bảng, hàng tiêu đề + từng dòng account là subgrid (grid-cols-subgrid) — cột tự co
// theo nội dung dài nhất mà vẫn thẳng hàng giữa các dòng (mỗi dòng vẫn có khung viền riêng).
const ACCOUNTS_TABLE = "grid grid-cols-[auto_auto_minmax(0,16rem)_auto_auto_auto_minmax(0,1fr)] gap-x-6 gap-y-2";
const ACCOUNT_ROW = "col-span-full grid grid-cols-subgrid items-center";

// Danh sách tài khoản (chỉ admin thấy). Tick chọn ĐÚNG 1 account (bấm vào dòng hoặc ô tick), rồi dùng các
// nút trên thanh công cụ (View Session / Reset Password / Logout / Disable) cho account đang chọn — Logout và
// Disable hỏi lại "Are you sure?" bằng popup trong app (không dùng window.confirm, xem TabBar.tsx). Tự làm
// mới mỗi 30 giây khi trang đang mở (Online = máy đó còn gửi heartbeat trong 90 giây gần nhất).
function AccountsAdminCard() {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetTarget, setResetTarget] = useState<AccountRow | null>(null);
  const [sessionsTarget, setSessionsTarget] = useState<AccountRow | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ kind: "logout" | "disable"; account: AccountRow } | null>(null);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, []);

  async function load() {
    const r = await window.api.auth.listAccounts();
    if ("error" in r) return setError(r.error);
    setAccounts(r.accounts);
    // Account đang chọn không còn (vd vừa bị xoá ở nơi khác) → bỏ chọn.
    setSelectedId((id) => (id && r.accounts.some((a) => a.accountId === id) ? id : null));
  }

  async function runAction(action: () => Promise<{ error: string } | object>, doneNotice?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await action();
      if ("error" in r) return setError((r as { error: string }).error);
      if (doneNotice) setNotice(doneNotice);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const statusRank = (a: AccountRow) => (a.disabled ? 2 : a.online ? 0 : 1);
  const sorted = accounts
    ? [...accounts].sort(
        (x, y) =>
          Number(y.isAdmin) - Number(x.isAdmin) ||
          statusRank(x) - statusRank(y) ||
          (y.lastSyncedAt ? Date.parse(y.lastSyncedAt) : 0) - (x.lastSyncedAt ? Date.parse(x.lastSyncedAt) : 0) ||
          y.storageBytes - x.storageBytes
      )
    : null;
  const selected = accounts?.find((a) => a.accountId === selectedId) ?? null;

  return (
    // Nằm thẳng trên nền trắng của trang (không lồng card trong card), trải hết chiều rộng.
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-medium text-base-100">Accounts</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setNotice(null);
              if (selected) setSessionsTarget(selected);
            }}
            disabled={!selected || busy}
            className={BTN.outline}
          >
            View Session
          </button>
          <button
            onClick={() => {
              setNotice(null);
              if (selected) setResetTarget(selected);
            }}
            disabled={!selected || busy}
            className={BTN.outline}
          >
            Reset Password
          </button>
          <button
            onClick={() => selected && setConfirmAction({ kind: "logout", account: selected })}
            disabled={!selected || !selected.online || busy}
            title={selected && !selected.online ? "Only available while the account is online" : undefined}
            className={BTN.outline}
          >
            Logout
          </button>
          {selected?.disabled ? (
            <button
              onClick={() =>
                void runAction(
                  () => window.api.auth.setAccountDisabled({ accountId: selected.accountId, disabled: false }),
                  `"${selected.username}" enabled.`
                )
              }
              disabled={busy}
              className={BTN.outline}
            >
              Enable
            </button>
          ) : (
            <button
              onClick={() => selected && setConfirmAction({ kind: "disable", account: selected })}
              disabled={!selected || selected.isAdmin || busy}
              title={selected?.isAdmin ? "The admin account can't be disabled" : undefined}
              className={BTN.outlineDanger}
            >
              Disable
            </button>
          )}
          <button
            onClick={() => {
              setNotice(null);
              setCreating(true);
            }}
            className={BTN.primary}
          >
            Create
          </button>
        </div>
      </div>

      {notice && <p className="mt-3 text-sm text-teal-500">{notice}</p>}
      {error && (
        <div className="mt-3 rounded-md border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500">{error}</div>
      )}

      <div className={`${ACCOUNTS_TABLE} mt-5`}>
        {accounts && accounts.length > 0 && (
          <div className={`${ACCOUNT_ROW} px-4 text-[11px] font-medium uppercase tracking-wide text-base-500`}>
            <span className="w-4" />
            <span>Status</span>
            <span>Account</span>
            <span className="text-right">Sessions</span>
            <span className="text-right">Storage</span>
            <span>Last sync</span>
            <span />
          </div>
        )}

        {sorted?.map((a) => {
          const isSelected = a.accountId === selectedId;
          return (
            <div
              key={a.accountId}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onClick={() => setSelectedId(isSelected ? null : a.accountId)}
              onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setSelectedId(isSelected ? null : a.accountId)}
              // Dòng admin nổi bật: viền màu thương hiệu dày hơn + nền xanh rất nhạt + bóng nhẹ. Dòng đang chọn:
              // nền xanh nhạt hơn nữa. Viền admin dày hơn 1px → bớt 1px padding để các cột vẫn thẳng hàng.
              className={`${ACCOUNT_ROW} cursor-pointer rounded-lg text-sm outline-none transition-colors ${
                a.isAdmin
                  ? "border-2 border-gold-500/60 px-[15px] py-[11px] shadow-sm shadow-gold-500/10"
                  : `border px-4 py-3 ${isSelected ? "border-gold-500/40" : "border-base-800"}`
              } ${isSelected ? "bg-gold-500/10" : a.isAdmin ? "bg-gold-500/5" : "hover:bg-base-900"}`}
            >
              {/* Ô tick — chỉ chọn được 1 account tại 1 thời điểm */}
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border ${
                  isSelected ? "border-gold-500 bg-gold-500 text-white" : "border-base-600 bg-base-950"
                }`}
              >
                {isSelected && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="h-3 w-3">
                    <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>

              {/* Trạng thái */}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${a.disabled ? "bg-danger-500" : a.online ? "bg-teal-500" : "bg-base-600"}`} />
                  <span className={a.disabled ? "text-danger-500" : a.online ? "text-teal-600" : "text-base-500"}>
                    {a.disabled ? "Disabled" : a.online ? "Online" : "Offline"}
                  </span>
                </div>
                {!a.online && a.lastSeen && (
                  <div className="mt-0.5 max-w-[7rem] truncate text-[11px] text-base-500" title={`Last seen ${new Date(a.lastSeen).toLocaleString()}`}>
                    seen {timeAgo(a.lastSeen)}
                  </div>
                )}
              </div>

              {/* Tên — quá dài thì "..." + tooltip khi rê chuột */}
              <div
                className={`min-w-0 truncate font-medium ${a.disabled ? "text-base-500 line-through" : "text-base-100"}`}
                title={a.isAdmin ? `${a.username} (Admin)` : a.username}
              >
                {a.username}
                {a.isAdmin && <span className="ml-1.5 text-xs font-normal text-base-500">(Admin)</span>}
              </div>

              {/* Số session — còn hiện / đã xoá hình thức */}
              <div
                className="max-w-[9rem] truncate text-right tabular-nums text-base-300"
                title={`${a.sessionCount} active session${a.sessionCount === 1 ? "" : "s"}${a.deletedCount > 0 ? `, ${a.deletedCount} deleted` : ""}`}
              >
                {a.sessionCount}
                {a.deletedCount > 0 && <span className="text-xs text-base-500"> · {a.deletedCount} deleted</span>}
              </div>

              {/* Dung lượng cloud — MỌI bản đang giữ (tối đa 10 bản/session), kể cả session đã xoá hình thức */}
              <div className="whitespace-nowrap text-right tabular-nums text-base-300" title="All copies kept in the cloud, including deleted sessions">
                {formatSize(a.storageBytes)}
              </div>

              {/* Lần đồng bộ gần nhất */}
              <div
                className="whitespace-nowrap text-xs text-base-400"
                title={a.lastSyncedAt ? new Date(a.lastSyncedAt).toLocaleString() : undefined}
              >
                {a.lastSyncedAt ? timeAgo(a.lastSyncedAt) : "Never"}
              </div>

              <span />
            </div>
          );
        })}
      </div>
      {accounts && accounts.length === 0 && <p className="mt-4 text-xs text-base-500">No accounts yet.</p>}

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
      {sessionsTarget && (
        <AccountSessionsModal account={sessionsTarget} onClose={() => setSessionsTarget(null)} onChanged={() => void load()} />
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
      {confirmAction && (
        <ConfirmModal
          title="Are you sure?"
          message={
            confirmAction.kind === "logout"
              ? `Sign "${confirmAction.account.username}" out of the device it's using right now?`
              : `Disable "${confirmAction.account.username}"? It won't be able to sign in until you enable it again. Its data stays in the cloud.`
          }
          confirmLabel={confirmAction.kind === "logout" ? "Logout" : "Disable"}
          busy={busy}
          onCancel={() => setConfirmAction(null)}
          onConfirm={async () => {
            const { kind, account } = confirmAction;
            await runAction(
              () =>
                kind === "logout"
                  ? window.api.auth.forceLogoutAccount(account.accountId)
                  : window.api.auth.setAccountDisabled({ accountId: account.accountId, disabled: true }),
              kind === "logout" ? `"${account.username}" was signed out.` : `"${account.username}" disabled.`
            );
            setConfirmAction(null);
          }}
        />
      )}
    </div>
  );
}

// Popup xác nhận trong app (thay window.confirm — hộp thoại native hay làm Electron mất focus bàn phím).
function ConfirmModal({
  title,
  message,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open title={title} onClose={() => !busy && onCancel()} maxWidth="max-w-sm" hideCloseButton>
      <p className="text-center text-sm text-base-400">{message}</p>
      <div className="mt-5 flex justify-center gap-2">
        <button onClick={onCancel} disabled={busy} className={BTN.secondary}>
          Cancel
        </button>
        <button onClick={onConfirm} disabled={busy} className={BTN.danger}>
          {confirmLabel}
        </button>
      </div>
      <BusyIndicator busy={busy} />
    </Modal>
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
      <div className="space-y-3">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={onEnter}
          placeholder="Username (3–32 characters)"
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
          placeholder="Password (at least 8 characters)"
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
      {error && <p className="mt-3 text-center text-sm text-danger-500">{error}</p>}
      <div className="mt-5 flex justify-center gap-2">
        <button onClick={onClose} className={BTN.secondary}>
          Cancel
        </button>
        <button onClick={submit} disabled={!canSubmit} className={BTN.primary}>
          Create account
        </button>
      </div>
      <BusyIndicator busy={busy} />
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
          placeholder="New password (at least 8 characters)"
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
      {error && <p className="mt-3 text-center text-sm text-danger-500">{error}</p>}
      <div className="mt-5 flex justify-center gap-2">
        <button onClick={onClose} className={BTN.secondary}>
          Cancel
        </button>
        <button onClick={submit} disabled={!canSubmit} className={BTN.primary}>
          Set password
        </button>
      </div>
      <BusyIndicator busy={busy} />
    </Modal>
  );
}

// Mọi session của 1 account trên cloud kèm tình trạng — admin chỉ thấy metadata (tên, lần đồng bộ, số
// participant, dung lượng, số bản đang giữ), KHÔNG mở được nội dung (Worker không đọc file .db). Session
// "Deleted" = account đó đã xoá trong app — chỉ là xoá hình thức, dữ liệu vẫn còn; Restore = gỡ dấu xoá,
// máy của account đó tự tải session về lại ở lần đồng bộ kế tiếp (login, Open → Refresh, có mạng lại).
function AccountSessionsModal({ account, onClose, onChanged }: { account: AccountRow; onClose: () => void; onChanged: () => void }) {
  const [rows, setRows] = useState<AdminSessionRow[] | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "deleted">("all");
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const r = await window.api.auth.listAccountSessions(account.accountId);
    if ("error" in r) return setError(r.error);
    setRows(r.sessions);
  }

  async function restore(row: AdminSessionRow) {
    setRestoring(row.sessionId);
    setError(null);
    setNotice(null);
    try {
      const r = await window.api.auth.restoreDeletedSession({ accountId: account.accountId, sessionId: row.sessionId });
      if ("error" in r) return setError(r.error);
      setNotice(`"${row.sessionName}" restored — it will reappear for ${account.username} on their next sync.`);
      await load();
      onChanged();
    } finally {
      setRestoring(null);
    }
  }

  const activeCount = rows?.filter((r) => r.status === "active").length ?? 0;
  const deletedCount = rows?.filter((r) => r.status === "deleted").length ?? 0;
  const totalSize = rows?.reduce((sum, r) => sum + r.totalSize, 0) ?? 0;
  const visible = rows?.filter((r) => filter === "all" || r.status === filter) ?? [];

  return (
    <Modal open title={`Sessions — ${account.username}`} onClose={onClose} maxWidth="max-w-4xl" hideCloseButton>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-base-400">
          {rows === null
            ? "Loading sessions..."
            : `${activeCount} active · ${deletedCount} deleted · ${formatSize(totalSize)} in the cloud`}
        </p>
        <div className="flex rounded-md border border-base-800 p-0.5 text-xs">
          {(["all", "active", "deleted"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded px-2.5 py-1 capitalize ${filter === key ? "bg-gold-500 text-white" : "text-base-400 hover:text-base-100"}`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      {notice && <p className="mb-2 text-center text-sm text-teal-500">{notice}</p>}
      {error && <p className="mb-2 text-center text-sm text-danger-500">{error}</p>}

      <div className="max-h-[26rem] overflow-y-auto">
        {visible.length > 0 && (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-base-900 text-base-500">
              <tr>
                <th className="py-1.5 font-medium">Session</th>
                <th className="py-1.5 font-medium">Status</th>
                <th className="py-1.5 font-medium">Last sync</th>
                <th className="py-1.5 text-right font-medium">Participants</th>
                <th className="py-1.5 text-right font-medium" title="Latest copy">Size</th>
                <th className="py-1.5 text-right font-medium" title="All copies kept in the cloud (up to 10 per session)">Cloud storage</th>
                <th className="w-20 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.sessionId} className="border-t border-base-800 text-base-300">
                  <td className="max-w-[14rem] py-2 pr-2">
                    <div className="truncate font-medium text-base-100" title={row.sessionName}>
                      {row.sessionName}
                    </div>
                    {row.appVersion && <div className="text-[11px] text-base-500">App v{row.appVersion}</div>}
                  </td>
                  <td className="py-2">
                    {row.status === "active" ? (
                      <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[11px] text-teal-600">Active</span>
                    ) : (
                      <span
                        className="rounded-full bg-danger-500/10 px-2 py-0.5 text-[11px] text-danger-500"
                        title={row.deletedAt ? `Deleted ${new Date(row.deletedAt).toLocaleString()}` : undefined}
                      >
                        Deleted{row.deletedAt ? ` ${timeAgo(row.deletedAt)}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="py-2" title={new Date(row.lastSyncedAt).toLocaleString()}>
                    {timeAgo(row.lastSyncedAt)}
                  </td>
                  <td className="py-2 text-right">{row.participantCount}</td>
                  <td className="py-2 text-right">{formatSize(row.latestSize)}</td>
                  <td className="py-2 text-right" title={`${row.versions} cop${row.versions === 1 ? "y" : "ies"} kept`}>
                    {formatSize(row.totalSize)}
                    <span className="text-base-500"> · {row.versions}</span>
                  </td>
                  <td className="py-2 text-right">
                    {row.status === "deleted" && (
                      <button onClick={() => restore(row)} disabled={!!restoring} className={`${BTN.secondary} h-7 w-20`}>
                        Restore
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows && visible.length === 0 && <p className="py-6 text-center text-xs text-base-500">No sessions here.</p>}
      </div>
      <BusyIndicator busy={rows === null || !!restoring} />
      <div className="mt-5 flex justify-center">
        <button onClick={onClose} className={BTN.secondary}>
          Close
        </button>
      </div>
    </Modal>
  );
}

// "just now" / "5 min ago" / "3 h ago" / "2 days ago" — đủ để admin biết account còn dùng gần đây không.
function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return "";
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes === 0) return "0 KB";
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

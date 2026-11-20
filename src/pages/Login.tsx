import { useState } from "react";
import { LoginResult, LooseSessionFile, PublicSession } from "@/types";
import Button from "@/components/Button";
import AuthShell from "@/components/AuthShell";

// Địa chỉ Worker (dev/prod) cố định ở main process theo cách app đang chạy — xem
// electron/config/cloudEnv.ts. Renderer chỉ gửi thông tin đăng nhập.

type Mode = "welcome" | "createAdmin" | "login" | "reset";

// Màn hình ĐẦU TIÊN khi chưa đăng nhập:
// - App CHƯA kích hoạt (chưa có admin trên Worker) — 2 bước:
//   1. "welcome": "Welcome to Lucky Draw Studio" + 1 ô Access Code (= secret ADMIN_TOKEN của Worker). Bấm
//      Continue → Worker CHỈ kiểm tra mã (auth.verifyAccessCode, chưa tạo gì). Sai → ô rung nhẹ + báo lỗi.
//   2. "createAdmin": đúng mã → trượt sang "Create Admin Account" (username + mật khẩu ×2) → tạo admin
//      (Worker kiểm tra lại Access Code) rồi đăng nhập luôn.
//   Đã kích hoạt rồi thì mọi máy chỉ thấy màn đăng nhập (máy khác không "kích hoạt lại" được).
// - "login": username + password (mọi tài khoản, admin lẫn tài khoản team do admin tạo).
// - "reset": quên mật khẩu ADMIN — Access Code + mật khẩu mới. Tài khoản team quên mật khẩu thì nhờ admin
//   đặt lại trong Settings → Accounts.
export default function Login({ activated, onSuccess }: { activated: boolean; onSuccess: (session: PublicSession) => void }) {
  const [mode, setMode] = useState<Mode>(activated ? "login" : "welcome");
  const [accessCode, setAccessCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Tăng mỗi lần nhập sai Access Code — đổi `key` để chạy lại animation rung.
  const [shakeKey, setShakeKey] = useState(0);
  // Lần đầu account này login trên máy này mà máy đã có sẵn file .db rời (từ trước khi có tính năng
  // Account) — hỏi 1 lần có muốn nhận vào account không (xem auth.login()/listRootLooseSessionFiles()).
  const [loose, setLoose] = useState<{ session: PublicSession; files: LooseSessionFile[] } | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirm("");
    if (next !== "login") setNotice(null);
  }

  function afterLogin(r: LoginResult) {
    const { looseFiles, ...session } = r;
    if (looseFiles.length > 0) {
      setLoose({ session, files: looseFiles });
      setChosen(new Set(looseFiles.map((f) => f.file)));
    } else {
      onSuccess(session);
    }
  }

  const needsConfirm = mode === "createAdmin" || mode === "reset";
  const canSubmit =
    !busy &&
    (mode === "welcome"
      ? !!accessCode.trim()
      : !!password &&
        (mode === "reset" || !!username.trim()) &&
        (mode !== "reset" || !!accessCode.trim()) &&
        (!needsConfirm || !!confirm));

  async function submit() {
    if (!canSubmit) return;
    if (needsConfirm && password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      if (mode === "welcome") {
        const r = await window.api.auth.verifyAccessCode(accessCode.trim());
        if ("error" in r) {
          setError(r.error);
          setShakeKey((k) => k + 1);
          return;
        }
        switchMode("createAdmin");
      } else if (mode === "createAdmin") {
        const r = await window.api.auth.activate({ accessCode: accessCode.trim(), username: username.trim(), password });
        if ("error" in r) return setError(r.error);
        afterLogin(r);
      } else if (mode === "login") {
        const r = await window.api.auth.login({ username: username.trim(), password });
        if ("error" in r) return setError(r.error);
        afterLogin(r);
      } else {
        const r = await window.api.auth.resetAdminPassword({ accessCode: accessCode.trim(), password });
        if ("error" in r) return setError(r.error);
        switchMode("login");
        setUsername(r.username);
        setAccessCode("");
        setNotice(`Password updated for admin "${r.username}". Sign in with the new password.`);
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

  const onEnter = (e: React.KeyboardEvent) => e.key === "Enter" && submit();

  const title = {
    welcome: "Welcome to Lucky Draw Studio",
    createAdmin: "Create Admin Account",
    login: "Sign in",
    reset: "Reset admin password",
  }[mode];
  const subtitle = {
    welcome: null,
    createAdmin: null,
    login: null,
    reset: "Enter the Access Code to set a new password for the admin account.",
  }[mode];
  const submitLabel = {
    welcome: busy ? "Checking..." : "Continue",
    createAdmin: busy ? "Creating..." : "Create account",
    login: busy ? "Signing in..." : "Sign in",
    reset: busy ? "Saving..." : "Set new password",
  }[mode];

  return (
    <AuthShell>
      {/* key = mode → đổi bước là mount lại khối này, chạy animation trượt vào (login-step-in, index.css). */}
      <div key={mode} className={mode === "createAdmin" ? "login-step-in" : ""}>
        {mode === "welcome" ? (
          <div className="text-center">
            <p className="text-sm text-base-400">Welcome to</p>
            <h1 className="font-display text-2xl font-semibold text-base-100">Lucky Draw Studio</h1>
          </div>
        ) : (
          <h1 className="text-center font-display text-xl font-semibold text-base-100">{title}</h1>
        )}
        {subtitle && <p className="mt-1.5 text-center text-xs text-base-400">{subtitle}</p>}

        <div className="mt-6 space-y-3">
          {(mode === "welcome" || mode === "reset") && (
            <div key={shakeKey} className={shakeKey > 0 && mode === "welcome" ? "login-shake" : ""}>
              <input
                type="password"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                onKeyDown={onEnter}
                placeholder="Access Code"
                aria-label="Access Code"
                autoFocus
                className={`${inputClass} ${mode === "welcome" ? "py-2.5 text-center" : ""}`}
              />
            </div>
          )}
          {(mode === "createAdmin" || mode === "login") && (
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={onEnter}
              placeholder="Username"
              aria-label="Username"
              autoFocus={mode === "createAdmin" || !username}
              autoComplete="username"
              className={inputClass}
            />
          )}
          {mode !== "welcome" && (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onEnter}
              placeholder={mode === "login" ? "Password" : "New password (at least 8 characters)"}
              aria-label={mode === "login" ? "Password" : "New password"}
              autoFocus={mode === "login" && !!username}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className={inputClass}
            />
          )}
          {needsConfirm && (
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={onEnter}
              placeholder="Confirm password"
              aria-label="Confirm password"
              autoComplete="new-password"
              className={inputClass}
            />
          )}
        </div>

        {notice && <p className="mt-3 text-center text-sm text-teal-500">{notice}</p>}

        <Button onClick={submit} disabled={!canSubmit} className="mt-4 w-full">
          {submitLabel}
        </Button>
        {/* Lỗi (vd sai Access Code) hiện NGAY DƯỚI nút bấm. */}
        {error && <p className="mt-3 text-center text-sm text-danger-500">{error}</p>}

        {mode === "login" && (
          <button onClick={() => switchMode("reset")} className="mt-3 block w-full text-center text-xs text-base-500 hover:text-base-200">
            Forgot admin password?
          </button>
        )}
        {mode === "reset" && (
          <button onClick={() => switchMode("login")} className="mt-3 block w-full text-center text-xs text-base-500 hover:text-base-200">
            Back to sign in
          </button>
        )}
      </div>
    </AuthShell>
  );
}

const inputClass =
  "w-full rounded-md border border-base-700 bg-base-950 px-3 py-2 text-sm text-base-100 outline-none placeholder:text-base-500 focus:border-gold-500";

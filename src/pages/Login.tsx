import { useEffect, useRef, useState } from "react";
import { LoginResult, LooseSessionFile, PublicSession } from "@/types";
import Button from "@/components/Button";
import AuthShell, { AuthBackground } from "@/components/AuthShell";

// Địa chỉ Worker (dev/prod) cố định ở main process theo cách app đang chạy — xem
// electron/config/cloudEnv.ts. Renderer chỉ gửi thông tin đăng nhập.

type Mode = "welcome" | "createAdmin" | "login" | "reset";

// Màn "Welcome" (khác `mode === "welcome"` ở trên — đây là màn CHÀO MỪNG hiện SAU KHI tạo admin xong,
// xem `showWelcome` trong component): chỉ còn đúng chữ "WELCOME" (bỏ dòng phụ "to Lucky Draw Studio" —
// 1 chữ là đủ), hiện NGUYÊN KHỐI bằng 1 hiệu ứng mép hiện dần trái→phải kết hợp fade (clip-path +
// opacity, xem `.welcome-heading` trong index.css). Giữ màn hình thêm 1 khoảng sau khi hiện xong rồi
// mới chuyển vào app thật.
const HEADING_ANIM_MS = 2200;
const WELCOME_HOLD_MS = 2800;
const WELCOME_SCREEN_MS = HEADING_ANIM_MS + WELCOME_HOLD_MS; // 5s tổng

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
  // Icon con mắt show/hide — riêng từng ô, không ảnh hưởng nhau.
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  // Màn "Welcome to Lucky Draw Studio" hiện ~3s ngay sau khi tạo admin thành công, TRƯỚC khi vào app
  // thật (afterLogin) — chỉ cho lần kích hoạt đầu tiên, không áp dụng cho đăng nhập thường.
  const [showWelcome, setShowWelcome] = useState(false);
  const welcomeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (welcomeTimerRef.current) clearTimeout(welcomeTimerRef.current);
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirm("");
    setShowPassword(false);
    setShowConfirm(false);
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
        // Hiện màn "Welcome..." ~3s trước khi vào app thật — chỉ lần kích hoạt đầu tiên.
        setShowWelcome(true);
        welcomeTimerRef.current = setTimeout(() => afterLogin(r), WELCOME_SCREEN_MS);
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

  if (showWelcome) {
    // KHÔNG dùng AuthShell ở đây — không hiện logo nữa, chỉ nền trôi (AuthBackground variant="welcome")
    // + đúng chữ "WELCOME" (mép hiện dần trái→phải + fade, xem .welcome-heading trong index.css — tách
    // từng ký tự nhìn giật/khó chịu nên bỏ).
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-base-900 px-4">
        <AuthBackground variant="welcome" />
        <h1
          className="welcome-heading relative z-10 bg-gradient-to-r from-gold-500 via-gold-400 to-teal-400 bg-clip-text text-center font-display text-7xl font-extrabold tracking-tight text-transparent"
          style={{ animationDuration: `${HEADING_ANIM_MS}ms` }}
        >
          WELCOME
        </h1>
      </div>
    );
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
    createAdmin: "Set up your administrator account",
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
    createAdmin: busy ? "Creating account..." : "Create account",
    login: busy ? "Signing in..." : "Sign in",
    reset: busy ? "Saving..." : "Set new password",
  }[mode];

  return (
    <AuthShell>
      {/* key = mode → đổi bước là mount lại khối này, chạy animation trượt vào (login-step-in, index.css). */}
      <div key={mode} className={mode === "createAdmin" ? "login-step-in" : ""}>
        {mode === "welcome" ? (
          <h1 className="text-center font-display text-3xl font-semibold text-base-100">Activate your workspace</h1>
        ) : (
          // Cỡ chữ khớp với màn Access Code (text-3xl) — đồng bộ kích thước giữa các bước của auth flow.
          <h1 className="text-center font-display text-3xl font-semibold text-base-100">{title}</h1>
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
                placeholder={mode === "welcome" ? "Enter your access code to get started" : "Access Code"}
                aria-label="Access Code"
                autoFocus
                className={`${inputClass} ${mode === "welcome" ? "text-center" : ""}`}
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
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onEnter}
                placeholder={mode === "login" ? "Password" : "New password (at least 8 characters)"}
                aria-label={mode === "login" ? "Password" : "New password"}
                autoFocus={mode === "login" && !!username}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className={`${inputClass} pr-11`}
              />
              <EyeToggleButton visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
            </div>
          )}
          {needsConfirm && (
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={onEnter}
                placeholder="Confirm password"
                aria-label="Confirm password"
                autoComplete="new-password"
                className={`${inputClass} pr-11`}
              />
              <EyeToggleButton visible={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
            </div>
          )}
        </div>

        {notice && <p className="mt-3 text-center text-sm text-teal-500">{notice}</p>}

        <Button onClick={submit} disabled={!canSubmit} size="lg" className="mt-4 w-full">
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
  "w-full rounded-lg border border-base-700 bg-base-950 px-4 py-3 text-base text-base-100 outline-none placeholder:text-base-500 focus:border-gold-500";

// Icon con mắt show/hide mật khẩu — tabIndex=-1 để Tab không dừng ở đây (đi thẳng qua input kế tiếp).
function EyeToggleButton({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      tabIndex={-1}
      aria-label={visible ? "Hide password" : "Show password"}
      className="absolute inset-y-0 right-0 flex items-center px-3 text-base-500 hover:text-base-300"
    >
      {visible ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path d="M3 3l18 18" />
          <path d="M10.6 10.6a3 3 0 0 0 4.24 4.24M9.47 5.11A10.6 10.6 0 0 1 12 4.85c7 0 10.5 7 10.5 7a13.2 13.2 0 0 1-3.17 4.14M6.6 6.73C3.88 8.46 1.5 12 1.5 12s3.5 7 10.5 7a10.5 10.5 0 0 0 3.1-.47" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

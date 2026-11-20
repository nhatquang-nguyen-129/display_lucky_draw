/**
 * Auth — đăng nhập theo ACCOUNT qua Cloudflare Worker (cloud/worker/), thay cho mô hình Space ẩn danh
 * cũ (xem CloudSettings trong cloudSync.ts — đã gỡ bỏ). Mỗi account chỉ 1 phiên đăng nhập hoạt động tại
 * 1 thời điểm, server enforce qua khoá độc quyền + heartbeat (xem cloud/worker/src/index.ts).
 *
 * Lưu session local qua Electron `safeStorage` (OS keychain) ở `userData`, KHÔNG trong `data/` như
 * `.cloud-sync.json` cũ — đây là credential thật, không nên đi theo khi ai đó copy `data/` sang máy/USB
 * khác. `safeStorage` không khả dụng (hiếm, vài cấu hình Linux) → không lưu, bắt login lại mỗi lần mở
 * app thay vì âm thầm ghi plaintext.
 *
 * `switchAccount()`/`rescan()` ở db.ts tự trỏ data/ sang đúng thư mục riêng của account đang login — xem
 * db.ts. Auto-push/pull thật sự (snapshot, hash, multipart) nằm ở cloudSync.ts; file này chỉ lo danh
 * tính + vòng đời phiên đăng nhập, gọi `cloudSync.setAuthContext()` để 2 module không phụ thuộc vòng
 * tròn lẫn nhau. Xem docs/architecture/cloud-sync.md.
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { app, safeStorage } from "electron";
import {
  accountFolderExists,
  importLooseFileToAccount,
  listRootLooseSessionFiles,
  rescan,
  switchAccount,
  type LooseSessionFile,
} from "./db";
import { flushDirty, setAuthContext, syncAll } from "./cloudSync";
import { WORKER_URL } from "./config/cloudEnv";

const SESSION_FILE = path.join(app.getPath("userData"), "auth-session.enc");
const DEVICE_ID_FILE = path.join(app.getPath("userData"), "device-id.txt");
const HEARTBEAT_INTERVAL_MS = 30_000;

interface StoredSession {
  workerUrl: string;
  accountId: string;
  name: string;
  isAdmin: boolean;
  sessionToken: string;
}

// Phần trả ra renderer qua IPC — KHÔNG kèm sessionToken (chỉ main process cần giữ bí mật này).
export interface PublicSession {
  workerUrl: string;
  accountId: string;
  name: string;
  isAdmin: boolean;
}

export type AuthResult<T> = { error: string } | T;

export class AuthError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}
// Lỗi KHÔNG tới được server (offline/DNS/timeout) — khác hẳn lỗi server TRẢ VỀ rõ ràng (401/403/409...).
export class AuthNetworkError extends AuthError {}

// Phiên đăng nhập THẬT SỰ không còn hợp lệ (bị máy khác chiếm, admin Force logout, account bị Disable).
// Mọi lỗi khác (mất mạng, 5xx, 429 — server lỗi tạm thời) KHÔNG được làm đăng xuất người dùng.
function isSessionInvalid(err: unknown): boolean {
  return err instanceof AuthError && !(err instanceof AuthNetworkError) && (err.status === 401 || err.status === 403);
}

let current: StoredSession | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnecting = false;
let initPromise: Promise<void> | null = null;
// Mở app lúc không tới được server — app bắt buộc có mạng: renderer hiện màn "No internet connection"
// (nút Retry), KHÔNG xoá phiên đã lưu (có mạng lại bấm Retry là vào luôn, không phải nhập lại mã).
let startupOffline = false;

type Listener<T> = (payload: T) => void;
let revokedListener: Listener<void> | null = null;
let connectivityListener: Listener<boolean> | null = null; // true = vừa mất kết nối tạm thời, false = đã lại

export function onRevoked(cb: Listener<void>) {
  revokedListener = cb;
}
export function onConnectivityChange(cb: Listener<boolean>) {
  connectivityListener = cb;
}

function toPublic(s: StoredSession): PublicSession {
  return { workerUrl: s.workerUrl, accountId: s.accountId, name: s.name, isAdmin: s.isAdmin };
}

function normalizeWorkerUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    return trimmed;
  } catch {
    return null;
  }
}

// Thông báo lỗi hiện cho người dùng CỐ Ý không kèm chi tiết kỹ thuật (status code, message gốc của
// fetch/Worker) — người dùng thường (không phải admin) chỉ cần biết "sai mã"/"máy khác đang dùng"/
// "mất mạng", không cần debug. Chi tiết gốc vẫn log ra console cho admin/dev tự xem khi cần.
async function call(workerUrl: string, token: string | null, pathname: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${workerUrl}${pathname}`, { ...init, headers });
  } catch (err) {
    console.warn("[auth] network error:", err);
    throw new AuthNetworkError("Can't reach the server. Check your internet connection and try again.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    console.warn(`[auth] ${pathname} failed (HTTP ${res.status}):`, body?.error);
    if (res.status >= 500 || res.status === 429) {
      throw new AuthNetworkError("The server is temporarily unavailable. Please try again in a moment.", res.status);
    }
    throw new AuthError(body?.error || "Something went wrong. Please try again.", res.status);
  }
  return res;
}

async function guard<T>(fn: () => Promise<T>): Promise<AuthResult<T>> {
  try {
    return await fn();
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// Ổn định theo máy, chỉ để Worker ghi vào active-session.json.deviceId cho mục đích hiển thị/debug —
// KHÔNG dùng để xác thực (sessionToken mới là thứ duy nhất xác thực).
function deviceId(): string {
  try {
    return fs.readFileSync(DEVICE_ID_FILE, "utf8").trim();
  } catch {
    const id = randomUUID();
    fs.writeFileSync(DEVICE_ID_FILE, id, "utf8");
    return id;
  }
}

function saveSession(session: StoredSession) {
  if (!safeStorage.isEncryptionAvailable()) return;
  fs.writeFileSync(SESSION_FILE, safeStorage.encryptString(JSON.stringify(session)));
}

function loadSavedSession(): StoredSession | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const encrypted = fs.readFileSync(SESSION_FILE);
    return JSON.parse(safeStorage.decryptString(encrypted)) as StoredSession;
  } catch {
    return null;
  }
}

function clearSavedSession() {
  fs.rmSync(SESSION_FILE, { force: true });
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  reconnecting = false;
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    if (!current) return stopHeartbeat();
    try {
      await call(current.workerUrl, current.sessionToken, "/v1/heartbeat", { method: "POST" });
      if (reconnecting) {
        reconnecting = false;
        connectivityListener?.(false);
        // Có mạng lại — đẩy nốt mọi thứ đã sửa/Confirm trong lúc mất mạng.
        void syncAll();
      }
    } catch (err) {
      if (!isSessionInvalid(err)) {
        // Rớt mạng / server lỗi tạm thời — KHÔNG đăng xuất, KHÔNG đóng cửa sổ nào (app chạy live tại sự
        // kiện). Chỉ báo renderer hiện popup "Reconnecting...", tự đóng khi heartbeat kế tiếp thành công.
        if (!reconnecting) {
          reconnecting = true;
          connectivityListener?.(true);
        }
        return;
      }
      // 401/403 — phiên này thật sự không còn hợp lệ (bị chiếm, Force logout, Disable).
      if (reconnecting) {
        reconnecting = false;
        connectivityListener?.(false);
      }
      stopHeartbeat();
      current = null;
      clearSavedSession();
      setAuthContext(null);
      revokedListener?.();
    }
  }, HEARTBEAT_INTERVAL_MS);
}

// App đã kích hoạt chưa (đã có account admin trên Worker) — quyết định màn đầu tiên: Access Code (chưa)
// hay đăng nhập username/password (rồi). null = không tới được server (mất mạng/5xx).
let activated = true;

async function fetchActivated(): Promise<boolean | null> {
  try {
    const res = await call(WORKER_URL, null, "/v1/status");
    return ((await res.json()) as { activated: boolean }).activated;
  } catch (err) {
    if (err instanceof AuthNetworkError) return null;
    // Worker cũ chưa có route /v1/status (404...) — coi như đã kích hoạt, hiện màn đăng nhập.
    return true;
  }
}

async function doInit(): Promise<void> {
  startupOffline = false;
  const saved = loadSavedSession();
  // Phiên lưu từ môi trường khác (vd đăng nhập ở bản dev cũ, trước khi tách userData) — bỏ qua, không
  // bao giờ để bản prod nói chuyện với Worker dev hay ngược lại.
  if (saved && saved.workerUrl !== WORKER_URL) clearSavedSession();
  const usable = saved && saved.workerUrl === WORKER_URL ? saved : null;

  if (!usable) {
    switchAccount(null);
    const result = await fetchActivated();
    startupOffline = result === null;
    activated = result ?? true;
    return;
  }
  try {
    await call(usable.workerUrl, usable.sessionToken, "/v1/heartbeat", { method: "POST" });
    current = usable;
    switchAccount(usable.accountId);
    setAuthContext({ workerUrl: usable.workerUrl, sessionToken: usable.sessionToken, accountId: usable.accountId });
    startHeartbeat();
    void syncAll();
  } catch (err) {
    switchAccount(null);
    if (isSessionInvalid(err)) {
      // Phiên hết hiệu lực thật (bị chiếm/Force logout/Disable) → bắt login lại.
      clearSavedSession();
    } else {
      // Mất mạng/server lỗi lúc mở app — app bắt buộc có mạng nên chặn ở màn "No internet connection",
      // nhưng GIỮ phiên đã lưu để Retry vào lại được ngay.
      startupOffline = true;
    }
  }
}

function ensureInit(): Promise<void> {
  if (!initPromise) initPromise = doInit();
  return initPromise;
}

export async function getSession(): Promise<PublicSession | null> {
  await ensureInit();
  return current ? toPublic(current) : null;
}

export type StartupStatus =
  | { status: "ok"; session: PublicSession }
  | { status: "logged-out"; activated: boolean }
  | { status: "offline" };

/** Cổng vào app (`<RequireAuth>` trong App.tsx): đã đăng nhập / cần login (kèm đã kích hoạt chưa) / không
 *  có mạng. Chưa đăng nhập thì hỏi lại trạng thái kích hoạt mỗi lần (vd vừa logout, máy khác vừa kích hoạt). */
export async function getStartupStatus(): Promise<StartupStatus> {
  await ensureInit();
  if (current) return { status: "ok", session: toPublic(current) };
  if (startupOffline) return { status: "offline" };
  const result = await fetchActivated();
  if (result === null) return { status: "offline" };
  activated = result;
  return { status: "logged-out", activated };
}

/** Nút Retry ở màn "No internet connection" — chạy lại bước khởi động. */
export async function retryStartup(): Promise<StartupStatus> {
  if (!current) initPromise = null;
  return getStartupStatus();
}

export interface LoginResult extends PublicSession {
  // Chỉ có giá trị khi đây là LẦN ĐẦU account này login trên máy này — renderer hỏi người dùng có muốn
  // nhận các session rời (xem listRootLooseSessionFiles() ở db.ts) vào account không.
  looseFiles: LooseSessionFile[];
}

function workerUrlOrThrow(): string {
  // Địa chỉ Worker cố định theo môi trường (electron/config/cloudEnv.ts) — người dùng không nhập.
  const workerUrl = normalizeWorkerUrl(WORKER_URL);
  if (!workerUrl) throw new AuthError("Invalid server URL configured in this build.");
  return workerUrl;
}

/** Bước 1 màn kích hoạt: chỉ kiểm tra Access Code đúng (chưa tạo gì) để chuyển sang bước tạo admin. */
export function verifyAccessCode(accessCode: string): Promise<AuthResult<{ ok: true }>> {
  return guard(async () => {
    const res = await call(workerUrlOrThrow(), null, "/v1/admin/verify-access-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessCode: accessCode.trim() }),
    });
    return res.json();
  });
}

/** Lần đầu (chưa kích hoạt): Access Code (= secret ADMIN_TOKEN trên Worker) + username/password admin →
 *  tạo account admin rồi đăng nhập luôn. */
export function activate(params: { accessCode: string; username: string; password: string }): Promise<AuthResult<LoginResult>> {
  return guard(async () => {
    await ensureInit();
    const workerUrl = workerUrlOrThrow();
    await call(workerUrl, null, "/v1/admin/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessCode: params.accessCode.trim(), username: params.username.trim(), password: params.password }),
    });
    activated = true;
    const r = await login({ username: params.username, password: params.password });
    if ("error" in r) throw new AuthError(r.error);
    return r;
  });
}

/** Quên mật khẩu admin: Access Code + mật khẩu mới → trả lại username admin (phòng quên cả username). */
export function resetAdminPassword(params: { accessCode: string; password: string }): Promise<AuthResult<{ username: string }>> {
  return guard(async () => {
    const res = await call(workerUrlOrThrow(), null, "/v1/admin/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessCode: params.accessCode.trim(), password: params.password }),
    });
    return res.json();
  });
}

export function login(params: { username: string; password: string }): Promise<AuthResult<LoginResult>> {
  return guard(async () => {
    await ensureInit();
    const workerUrl = workerUrlOrThrow();
    const username = params.username.trim();
    if (!username || !params.password) throw new AuthError("Enter your username and password.");

    const res = await call(workerUrl, null, "/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: params.password, deviceId: deviceId() }),
    });
    const data = (await res.json()) as { accountId: string; sessionToken: string; name: string; isAdmin: boolean };
    const session: StoredSession = {
      workerUrl,
      accountId: data.accountId,
      name: data.name,
      isAdmin: data.isAdmin,
      sessionToken: data.sessionToken,
    };

    // Hỏi nhận file rời TRƯỚC khi switchAccount tạo thư mục account (đích đang trống/chưa tồn tại) —
    // sau khi switchAccount, listRootLooseSessionFiles() vẫn đúng (chỉ đọc thư mục gốc, không đụng thư
    // mục accounts/ con) nhưng hỏi trước cho renderer bớt 1 nhịp chờ.
    const looseFiles = accountFolderExists(session.accountId) ? [] : listRootLooseSessionFiles();

    current = session;
    startupOffline = false;
    saveSession(session);
    switchAccount(session.accountId);
    setAuthContext({ workerUrl, sessionToken: session.sessionToken, accountId: session.accountId });
    startHeartbeat();

    // Đồng bộ toàn bộ account ngay lúc login: tải session máy chưa có, cập nhật session đã cũ so với
    // cloud, đẩy phần còn cờ "chưa đồng bộ" từ lần trước (xem cloudSync.syncAll). Lỗi không chặn login.
    await syncAll();

    return { ...toPublic(session), looseFiles };
  });
}

/** Người dùng chọn Import ở hộp thoại "Tìm thấy N session trên máy này" — chuyển các file đã chọn vào
 *  thư mục account đang login rồi rescan() để chúng hiện thành tab ngay (sẽ tự auto-push ở lần sửa kế). */
export function importLooseFiles(files: string[]): AuthResult<{ imported: number }> {
  if (!current) return { error: "Not logged in." };
  for (const file of files) importLooseFileToAccount(file, current.accountId);
  rescan();
  // Session vừa nhận chưa có trạng thái đồng bộ = "chưa đồng bộ" — đẩy lên cloud luôn.
  void syncAll();
  return { imported: files.length };
}

export function logout(): Promise<AuthResult<{ ok: true }>> {
  return guard(async () => {
    await ensureInit();
    if (current) {
      // Đẩy nốt phần chưa đồng bộ trước khi nhả khoá (không xong cũng không sao — cờ còn trên đĩa, lần
      // login sau account này tự đẩy tiếp).
      await flushDirty(10_000);
      await call(current.workerUrl, current.sessionToken, "/v1/logout", { method: "POST" }).catch(() => undefined);
    }
    stopHeartbeat();
    current = null;
    clearSavedSession();
    setAuthContext(null);
    switchAccount(null);
    return { ok: true };
  });
}

/* ---------------- Admin: quản lý account (chỉ gọi được khi current.isAdmin) ---------------- */

export interface AccountRow {
  accountId: string;
  name: string;
  username: string;
  createdAt: string;
  isAdmin: boolean;
  disabled: boolean;
  online: boolean;
  lastSeen: string | null;
}

function requireLoggedIn(): StoredSession {
  if (!current) throw new AuthError("Not logged in.");
  return current;
}

export function createAccount(params: { username: string; password: string }): Promise<AuthResult<{ accountId: string; username: string }>> {
  return guard(async () => {
    const s = requireLoggedIn();
    const res = await call(s.workerUrl, s.sessionToken, "/v1/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: params.username.trim(), password: params.password }),
    });
    return res.json();
  });
}

export function listAccounts(): Promise<AuthResult<{ accounts: AccountRow[] }>> {
  return guard(async () => {
    const s = requireLoggedIn();
    const res = await call(s.workerUrl, s.sessionToken, "/v1/accounts");
    return res.json();
  });
}

/** Admin đặt mật khẩu mới cho 1 account (team quên mật khẩu). */
export function resetAccountPassword(params: { accountId: string; password: string }): Promise<AuthResult<{ ok: true }>> {
  return guard(async () => {
    const s = requireLoggedIn();
    const res = await call(s.workerUrl, s.sessionToken, `/v1/accounts/${encodeURIComponent(params.accountId)}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: params.password }),
    });
    return res.json();
  });
}

export function forceLogoutAccount(accountId: string): Promise<AuthResult<{ ok: true }>> {
  return guard(async () => {
    const s = requireLoggedIn();
    const res = await call(s.workerUrl, s.sessionToken, `/v1/accounts/${encodeURIComponent(accountId)}/force-logout`, { method: "POST" });
    return res.json();
  });
}

export function setAccountDisabled(accountId: string, disabled: boolean): Promise<AuthResult<{ ok: true; disabled: boolean }>> {
  return guard(async () => {
    const s = requireLoggedIn();
    const action = disabled ? "disable" : "enable";
    const res = await call(s.workerUrl, s.sessionToken, `/v1/accounts/${encodeURIComponent(accountId)}/${action}`, { method: "POST" });
    return res.json();
  });
}

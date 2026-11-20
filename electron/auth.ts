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
import { catchUpPull, setAuthContext } from "./cloudSync";

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

export class AuthError extends Error {}
// Lỗi KHÔNG tới được server (offline/DNS/timeout) — khác hẳn lỗi server TRẢ VỀ rõ ràng (401/403/409...).
// Heartbeat đang chạy chỉ tự đăng xuất khi gặp lỗi THỨ 2 (bị phiên khác chiếm thật), không phải lỗi 1.
export class AuthNetworkError extends AuthError {}

let current: StoredSession | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnecting = false;
let initPromise: Promise<void> | null = null;

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
    throw new AuthError(body?.error || "Something went wrong. Please try again.");
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
      }
    } catch (err) {
      if (err instanceof AuthNetworkError) {
        // Rớt mạng tạm thời — KHÔNG đăng xuất, KHÔNG đóng cửa sổ nào (app chạy live tại sự kiện). Chỉ
        // báo renderer hiện banner "Reconnecting...", tự hết khi heartbeat kế tiếp thành công.
        if (!reconnecting) {
          reconnecting = true;
          connectivityListener?.(true);
        }
        return;
      }
      // Lỗi server trả về rõ ràng (401 "logged in elsewhere") — phiên này thật sự không còn hợp lệ.
      stopHeartbeat();
      current = null;
      clearSavedSession();
      setAuthContext(null);
      revokedListener?.();
    }
  }, HEARTBEAT_INTERVAL_MS);
}

async function doInit(): Promise<void> {
  const saved = loadSavedSession();
  if (!saved) {
    switchAccount(null);
    return;
  }
  try {
    await call(saved.workerUrl, saved.sessionToken, "/v1/heartbeat", { method: "POST" });
    current = saved;
    switchAccount(saved.accountId);
    setAuthContext({ workerUrl: saved.workerUrl, sessionToken: saved.sessionToken, accountId: saved.accountId });
    startHeartbeat();
  } catch {
    // Không xác nhận được lúc khởi động (hết hạn/bị chiếm/mất mạng) — app vừa mở, chưa làm gì nên không
    // mất thao tác gì, an toàn hơn là bắt login lại thay vì đoán (khác hẳn heartbeat lúc ĐANG dùng app,
    // xem startHeartbeat() — ở đó mất mạng tạm thời KHÔNG tự đăng xuất).
    clearSavedSession();
    switchAccount(null);
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

export interface LoginResult extends PublicSession {
  // Chỉ có giá trị khi đây là LẦN ĐẦU account này login trên máy này — renderer hỏi người dùng có muốn
  // nhận các session rời (xem listRootLooseSessionFiles() ở db.ts) vào account không.
  looseFiles: LooseSessionFile[];
}

export function login(params: { workerUrl: string; loginCode: string }): Promise<AuthResult<LoginResult>> {
  return guard(async () => {
    await ensureInit();
    const workerUrl = normalizeWorkerUrl(params.workerUrl);
    if (!workerUrl) throw new AuthError("Invalid server URL — it should look like https://prod.lucky-draw-studio.workers.dev");
    const loginCode = params.loginCode.trim();
    if (!loginCode) throw new AuthError("Enter the login code.");

    const res = await call(workerUrl, null, "/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginCode, deviceId: deviceId() }),
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
    saveSession(session);
    switchAccount(session.accountId);
    setAuthContext({ workerUrl, sessionToken: session.sessionToken, accountId: session.accountId });
    startHeartbeat();

    // Pull 1 lần mọi session cloud mà máy này chưa có (máy mới, hoặc máy khác vừa login account này lần
    // đầu) — KHÔNG chạy nền định kỳ, chỉ đúng lúc login xong. Lỗi ở đây không chặn đăng nhập thành công.
    await catchUpPull().catch(() => undefined);

    return { ...toPublic(session), looseFiles };
  });
}

/** Người dùng chọn Import ở hộp thoại "Tìm thấy N session trên máy này" — chuyển các file đã chọn vào
 *  thư mục account đang login rồi rescan() để chúng hiện thành tab ngay (sẽ tự auto-push ở lần sửa kế). */
export function importLooseFiles(files: string[]): AuthResult<{ imported: number }> {
  if (!current) return { error: "Not logged in." };
  for (const file of files) importLooseFileToAccount(file, current.accountId);
  rescan();
  return { imported: files.length };
}

export function logout(): Promise<AuthResult<{ ok: true }>> {
  return guard(async () => {
    await ensureInit();
    if (current) {
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

export function createAccount(name: string): Promise<AuthResult<{ accountId: string; name: string; loginCode: string }>> {
  return guard(async () => {
    const s = requireLoggedIn();
    const res = await call(s.workerUrl, s.sessionToken, "/v1/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
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

export function regenerateCode(accountId: string): Promise<AuthResult<{ accountId: string; loginCode: string }>> {
  return guard(async () => {
    const s = requireLoggedIn();
    const res = await call(s.workerUrl, s.sessionToken, `/v1/accounts/${encodeURIComponent(accountId)}/regenerate-code`, { method: "POST" });
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

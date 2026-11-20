/**
 * Cloud Sync — Cloudflare Worker + R2 cho Lucky Draw Studio. Mô hình account (thay cho Space ẩn danh
 * cũ): mỗi account có dữ liệu riêng, đăng nhập bằng USERNAME + PASSWORD, CHỈ 1 thiết bị được giữ phiên
 * hoạt động tại 1 thời điểm (server enforce, không phải app tự nhường nhau). Worker vẫn chỉ lưu/trả
 * NGUYÊN file session (.db), KHÔNG đọc nội dung bên trong. Xem docs/architecture/cloud-sync.md.
 *
 * Kích hoạt: lần đầu (chưa có admin) app hiện màn Access Code — Access Code CHÍNH LÀ secret ADMIN_TOKEN.
 * Nhập đúng → tạo account admin (username + password). Đã kích hoạt thì mọi máy chỉ thấy màn đăng nhập
 * username/password. Quên mật khẩu admin → nhập lại Access Code để đặt mật khẩu mới.
 *
 * Bố cục R2 (bucket binding BUCKET):
 *   accounts/<accountId>/account.json         → { name, username, password, createdAt, isAdmin, disabled, failedLogins, lockedUntil }
 *   usernames/<username>.json                  → { accountId } — index username (chữ thường) → account
 *   accounts/<accountId>/active-session.json  → { sessionTokenHash, deviceId, loginAt, lastSeen } — khoá độc quyền
 *   sessionTokens/<sha256(token)>.json         → { accountId } — index tra Bearer token → account
 *   accounts/<accountId>/sessions/<sessionId>/<pushedAtMs>.db → file session, customMetadata xem pushMeta
 *   accounts/<accountId>/deleted/<sessionId>.json → { deletedAt } — dấu "đã xoá" (tombstone), KHÔNG xoá các
 *     bản .db ở trên (còn đường khôi phục); Push thành công lần sau (Restore từ Trash) tự gỡ dấu này
 *   admin/activated.json                       → { accountId } — đã kích hoạt (có admin), chặn kích hoạt lần 2
 *
 * Mật khẩu lưu dạng PBKDF2-SHA256 (salt riêng mỗi account), token chỉ lưu dạng hash — lộ bucket cũng không
 * lộ được mật khẩu/token dùng thật.
 */

export interface Env {
  BUCKET: R2Bucket;
  // Secret, đặt ở Dashboard (Settings → Variables and Secrets, tick Secret) hoặc `wrangler secret put
  // ADMIN_TOKEN`. Dùng làm ACCESS CODE: kích hoạt lần đầu + đặt lại mật khẩu admin.
  ADMIN_TOKEN: string;
}

interface PasswordHash {
  salt: string; // base64
  iterations: number;
  hash: string; // base64
}

interface Account {
  name: string; // tên hiển thị — hiện = username
  username: string;
  password: PasswordHash;
  createdAt: string;
  isAdmin: boolean;
  disabled: boolean;
  failedLogins?: number;
  lockedUntil?: string | null;
}

interface ActiveSession {
  sessionTokenHash: string;
  deviceId: string;
  loginAt: string;
  lastSeen: string;
}

interface Auth {
  accountId: string;
  isAdmin: boolean;
}

// Mỗi session giữ tối đa chừng này bản trên cloud — bản cũ hơn tự xoá sau mỗi lần Push thành công.
const KEEP_VERSIONS = 10;
// Phần upload: Worker giới hạn body ~100MB, RAM 128MB → 32MB/phần là an toàn (R2 yêu cầu ≥ 5MB trừ phần cuối).
const PART_SIZE = 32 * 1024 * 1024;
const ID_PATTERN = /^[0-9a-zA-Z_-]{1,64}$/;
const VERSION_FILE_PATTERN = /^\d{13}\.db$/;
// Metadata app gửi lên khi Push — đều là chuỗi (R2 customMetadata chỉ nhận string).
const META_FIELDS = ["sessionName", "modifiedAt", "sha256", "appVersion", "participantCount"] as const;
// Quá ngưỡng này không có heartbeat thì coi phiên là đã "nguội" (máy cũ crash/mất mạng) — login máy khác
// được phép giành khoá. Gấp 3 chu kỳ heartbeat (30s) để chịu được 1-2 nhịp rớt mạng tạm thời.
const HEARTBEAT_STALE_MS = 90_000;
// Key MỚI (khác "admin/bootstrapped.json" của bản login-code cũ) — admin tạo theo kiểu cũ (không có
// username/password) không được tính là đã kích hoạt, kích hoạt lại theo luồng mới được.
const ACTIVATED_MARKER_KEY = "admin/activated.json";
// PBKDF2: workerd giới hạn tối đa 100k vòng; 50k đủ chậm để dò mật khẩu tốn kém mà vẫn nằm trong giới hạn
// CPU của gói Workers miễn phí. Lưu số vòng theo từng account → tăng sau được mà không phá mật khẩu cũ.
const PBKDF2_ITERATIONS = 50_000;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const MIN_PASSWORD_LENGTH = 8;
// Sai mật khẩu liên tiếp chừng này lần → khoá đăng nhập account đó LOCKOUT_MS (chống dò mật khẩu).
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 5 * 60_000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      return json({ error: `Internal error: ${(err as Error).message}` }, 500);
    }
  },
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const method = request.method;

  if (parts[0] !== "v1") throw new HttpError(404, "Not found");
  const [, resource, a, b, c] = parts;

  if (resource === "status" && !a && method === "GET") return status(env);
  if (resource === "admin" && a === "verify-access-code" && !b && method === "POST") return verifyAccessCode(request, env);
  if (resource === "admin" && a === "activate" && !b && method === "POST") return activateAdmin(request, env);
  if (resource === "admin" && a === "reset-password" && !b && method === "POST") return resetAdminPassword(request, env);
  if (resource === "login" && !a && method === "POST") return login(request, env);

  if (resource === "logout" && !a && method === "POST") return withSession(request, env, (auth) => logout(env, auth));
  if (resource === "heartbeat" && !a && method === "POST")
    return withSession(request, env, (auth, account) => heartbeat(env, auth, account));

  if (resource === "sessions" && !a && method === "GET") return withSession(request, env, (auth) => listSessions(env, auth));
  if (resource === "sessions" && a && b === "head" && !c && method === "GET")
    return withSession(request, env, (auth) => sessionHead(env, auth, a));
  if (resource === "sessions" && a && b === "delete" && !c && method === "POST")
    return withSession(request, env, (auth) => markDeleted(env, auth, a));
  if (resource === "objects" && a && b && !c && method === "GET")
    return withSession(request, env, (auth) => download(env, auth, a, b));

  if (resource === "uploads") {
    if (!a && method === "POST") return withSession(request, env, (auth) => startUpload(request, env, auth));
    if (a && b === "parts" && c && method === "PUT") return withSession(request, env, (auth) => uploadPart(request, env, auth, a, c));
    if (a && b === "complete" && !c && method === "POST") return withSession(request, env, (auth) => completeUpload(request, env, auth, a));
    if (a && !b && method === "DELETE") return withSession(request, env, (auth) => abortUpload(request, env, auth, a));
  }

  if (resource === "accounts") {
    if (!a && method === "POST") return withSession(request, env, (auth) => createAccount(request, env, auth));
    if (!a && method === "GET") return withSession(request, env, (auth) => listAccounts(env, auth));
    if (a && b === "reset-password" && method === "POST") return withSession(request, env, (auth) => resetAccountPassword(request, env, auth, a));
    if (a && b === "force-logout" && method === "POST") return withSession(request, env, (auth) => forceLogout(env, auth, a));
    if (a && b === "disable" && method === "POST") return withSession(request, env, (auth) => setDisabled(env, auth, a, true));
    if (a && b === "enable" && method === "POST") return withSession(request, env, (auth) => setDisabled(env, auth, a, false));
  }

  throw new HttpError(404, "Not found");
}

/* ---------------- Crypto helpers ---------------- */

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));
}

async function hashPassword(password: string, salt?: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<PasswordHash> {
  const useSalt = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: useSalt, iterations }, key, 256);
  return { salt: toBase64(useSalt), iterations, hash: toBase64(new Uint8Array(bits)) };
}

async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const computed = await hashPassword(password, fromBase64(stored.salt), stored.iterations);
  return safeEqual(computed.hash, stored.hash);
}

// Username không phân biệt hoa thường, bỏ khoảng trắng 2 đầu.
function normalizeUsername(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

function validateUsername(username: string) {
  if (!USERNAME_PATTERN.test(username)) {
    throw new HttpError(400, "Username must be 3–32 characters: letters, numbers, dot, dash or underscore");
  }
}

function validatePassword(password: unknown): string {
  const p = String(password ?? "");
  if (p.length < MIN_PASSWORD_LENGTH) throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  if (p.length > 128) throw new HttpError(400, "Password is too long");
  return p;
}

// Access Code = secret ADMIN_TOKEN. So sánh không lộ thời gian.
function checkAccessCode(env: Env, accessCode: unknown) {
  if (!env.ADMIN_TOKEN) throw new HttpError(500, "ADMIN_TOKEN secret is not set on this Worker");
  if (!safeEqual(String(accessCode ?? "").trim(), env.ADMIN_TOKEN)) throw new HttpError(401, "Invalid access code");
}

// So sánh không lộ thời gian, tránh dò ADMIN_TOKEN theo từng ký tự.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------------- Account keys ---------------- */

function accountKey(id: string): string {
  return `accounts/${id}/account.json`;
}
function activeSessionKey(id: string): string {
  return `accounts/${id}/active-session.json`;
}
function sessionTokenKey(hash: string): string {
  return `sessionTokens/${hash}.json`;
}
function usernameKey(username: string): string {
  return `usernames/${username}.json`;
}

async function getAccount(env: Env, accountId: string): Promise<Account | null> {
  const obj = await env.BUCKET.get(accountKey(accountId));
  return obj ? ((await obj.json()) as Account) : null;
}

async function findAccountIdByUsername(env: Env, username: string): Promise<string | null> {
  const obj = await env.BUCKET.get(usernameKey(username));
  return obj ? ((await obj.json()) as { accountId: string }).accountId : null;
}

// Tạo account mới (admin lúc kích hoạt, hoặc account thường do admin tạo) — username phải chưa ai dùng.
async function createAccountRecord(env: Env, username: string, password: string, isAdmin: boolean): Promise<string> {
  validateUsername(username);
  if (await findAccountIdByUsername(env, username)) throw new HttpError(409, "This username is already taken");
  const accountId = crypto.randomUUID();
  const account: Account = {
    name: username,
    username,
    password: await hashPassword(password),
    createdAt: new Date().toISOString(),
    isAdmin,
    disabled: false,
    failedLogins: 0,
    lockedUntil: null,
  };
  await env.BUCKET.put(accountKey(accountId), JSON.stringify(account));
  await env.BUCKET.put(usernameKey(username), JSON.stringify({ accountId }));
  return accountId;
}

async function setPassword(env: Env, accountId: string, account: Account, password: string) {
  account.password = await hashPassword(password);
  account.failedLogins = 0;
  account.lockedUntil = null;
  await env.BUCKET.put(accountKey(accountId), JSON.stringify(account));
}

/* ---------------- Auth: login / logout / heartbeat ---------------- */

// Xác thực Bearer sessionToken: phải khớp ĐÚNG phiên đang hoạt động của account đó (không phải "bất kỳ
// token hợp lệ nào từng cấp") — đây là cơ chế khoá độc quyền, 1 account chỉ 1 thiết bị tại 1 thời điểm.
async function authenticateSession(request: Request, env: Env): Promise<{ auth: Auth; account: Account }> {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Missing session token");

  const tokenHash = await sha256Hex(token);
  const idxObj = await env.BUCKET.get(sessionTokenKey(tokenHash));
  if (!idxObj) throw new HttpError(401, "Invalid or expired session");
  const { accountId } = (await idxObj.json()) as { accountId: string };

  const activeObj = await env.BUCKET.get(activeSessionKey(accountId));
  const active = activeObj ? ((await activeObj.json()) as ActiveSession) : null;
  if (!active || active.sessionTokenHash !== tokenHash) {
    throw new HttpError(401, "Session expired — logged in elsewhere");
  }

  const account = await getAccount(env, accountId);
  if (!account) throw new HttpError(401, "Account not found");
  if (account.disabled) throw new HttpError(403, "Account disabled");
  return { auth: { accountId, isAdmin: account.isAdmin }, account };
}

async function withSession(
  request: Request,
  env: Env,
  handler: (auth: Auth, account: Account) => Promise<Response>
): Promise<Response> {
  const { auth, account } = await authenticateSession(request, env);
  return handler(auth, account);
}

function requireAdmin(auth: Auth) {
  if (!auth.isAdmin) throw new HttpError(403, "Admin only");
}

// Xoá khoá phiên hiện tại của 1 account (dùng chung cho tự logout, admin force-logout, và disable).
async function clearActiveSession(env: Env, accountId: string): Promise<void> {
  const activeObj = await env.BUCKET.get(activeSessionKey(accountId));
  if (!activeObj) return;
  const active = (await activeObj.json()) as ActiveSession;
  await env.BUCKET.delete(sessionTokenKey(active.sessionTokenHash));
  await env.BUCKET.delete(activeSessionKey(accountId));
}

/* ---------------- Kích hoạt + đặt lại mật khẩu admin (Access Code = ADMIN_TOKEN) ---------------- */

async function getActivatedAdminId(env: Env): Promise<string | null> {
  const obj = await env.BUCKET.get(ACTIVATED_MARKER_KEY);
  return obj ? ((await obj.json()) as { accountId: string }).accountId : null;
}

// Công khai (không cần đăng nhập) — app hỏi lúc mở để biết hiện màn Access Code (chưa kích hoạt) hay màn
// đăng nhập username/password (đã kích hoạt). Không lộ thông tin gì khác.
async function status(env: Env): Promise<Response> {
  return json({ activated: !!(await getActivatedAdminId(env)) });
}

// Bước 1 của màn kích hoạt: chỉ KIỂM TRA Access Code (chưa tạo gì) để app chuyển sang bước "Create Admin
// Account". Bước 2 (activateAdmin) vẫn kiểm tra lại Access Code — bước này không cấp quyền gì cả.
async function verifyAccessCode(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { accessCode?: string };
  checkAccessCode(env, body.accessCode);
  if (await getActivatedAdminId(env)) throw new HttpError(409, "This app has already been activated");
  return json({ ok: true });
}

// Lần đầu (chưa có admin): Access Code đúng → tạo account admin. Đã kích hoạt rồi thì từ chối (409) — máy
// khác không thể "kích hoạt lại" để chiếm quyền admin.
async function activateAdmin(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { accessCode?: string; username?: string; password?: string };
  checkAccessCode(env, body.accessCode);
  if (await getActivatedAdminId(env)) throw new HttpError(409, "This app has already been activated");
  const username = normalizeUsername(body.username);
  const password = validatePassword(body.password);
  const accountId = await createAccountRecord(env, username, password, true);
  await env.BUCKET.put(ACTIVATED_MARKER_KEY, JSON.stringify({ accountId }));
  return json({ accountId, username }, 201);
}

// Quên mật khẩu admin: Access Code đúng → đặt mật khẩu mới, trả lại username (phòng quên cả username).
// Nhả luôn khoá phiên đang giữ (nếu có) — máy đang đăng nhập bằng mật khẩu cũ bị đăng xuất.
async function resetAdminPassword(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { accessCode?: string; password?: string };
  checkAccessCode(env, body.accessCode);
  const adminId = await getActivatedAdminId(env);
  if (!adminId) throw new HttpError(404, "This app has not been activated yet");
  const account = await getAccount(env, adminId);
  if (!account) throw new HttpError(404, "Admin account not found");
  await setPassword(env, adminId, account, validatePassword(body.password));
  await clearActiveSession(env, adminId);
  return json({ username: account.username });
}

async function login(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string; deviceId?: string };
  const username = normalizeUsername(body.username);
  const password = String(body.password ?? "");
  if (!username || !password) throw new HttpError(400, "Enter your username and password");

  const invalid = () => new HttpError(401, "Invalid username or password");
  const accountId = await findAccountIdByUsername(env, username);
  const account = accountId ? await getAccount(env, accountId) : null;
  if (!accountId || !account?.password) {
    // Vẫn băm 1 lần cho thời gian phản hồi giống trường hợp sai mật khẩu — không lộ username có tồn tại.
    await hashPassword(password);
    throw invalid();
  }
  const nowMs = Date.now();
  if (account.lockedUntil && Date.parse(account.lockedUntil) > nowMs) {
    throw new HttpError(423, "Too many failed attempts. Try again in a few minutes.");
  }
  if (!(await verifyPassword(password, account.password))) {
    account.failedLogins = (account.failedLogins ?? 0) + 1;
    if (account.failedLogins >= MAX_FAILED_LOGINS) {
      account.failedLogins = 0;
      account.lockedUntil = new Date(nowMs + LOCKOUT_MS).toISOString();
    }
    await env.BUCKET.put(accountKey(accountId), JSON.stringify(account));
    throw invalid();
  }
  if (account.disabled) throw new HttpError(403, "This account has been disabled");
  if (account.failedLogins || account.lockedUntil) {
    account.failedLogins = 0;
    account.lockedUntil = null;
    await env.BUCKET.put(accountKey(accountId), JSON.stringify(account));
  }

  const now = Date.now();
  const existingObj = await env.BUCKET.get(activeSessionKey(accountId));
  const existing = existingObj ? ((await existingObj.json()) as ActiveSession) : null;
  if (existing && now - Date.parse(existing.lastSeen) < HEARTBEAT_STALE_MS) {
    throw new HttpError(409, "Already logged in on another device. Try again shortly if that device crashed.");
  }
  // Phiên cũ đã "nguội" (hoặc chưa từng có) — dọn index token cũ trước khi cấp phiên mới.
  if (existing) await env.BUCKET.delete(sessionTokenKey(existing.sessionTokenHash));

  const sessionToken = randomToken();
  const sessionTokenHash = await sha256Hex(sessionToken);
  const nowIso = new Date(now).toISOString();
  const active: ActiveSession = { sessionTokenHash, deviceId: String(body.deviceId ?? ""), loginAt: nowIso, lastSeen: nowIso };

  await env.BUCKET.put(activeSessionKey(accountId), JSON.stringify(active));
  await env.BUCKET.put(sessionTokenKey(sessionTokenHash), JSON.stringify({ accountId }));

  return json({ accountId, sessionToken, name: account.name, isAdmin: account.isAdmin });
}

async function logout(env: Env, auth: Auth): Promise<Response> {
  await clearActiveSession(env, auth.accountId);
  return json({ ok: true });
}

async function heartbeat(env: Env, auth: Auth, account: Account): Promise<Response> {
  const activeObj = await env.BUCKET.get(activeSessionKey(auth.accountId));
  if (!activeObj) throw new HttpError(401, "Session expired");
  const active = (await activeObj.json()) as ActiveSession;
  active.lastSeen = new Date().toISOString();
  await env.BUCKET.put(activeSessionKey(auth.accountId), JSON.stringify(active));
  return json({ ok: true, name: account.name, isAdmin: account.isAdmin });
}

/* ---------------- Admin: account management (trong app, dùng sessionToken của chính admin) ---------------- */

async function createAccount(request: Request, env: Env, auth: Auth): Promise<Response> {
  requireAdmin(auth);
  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = normalizeUsername(body.username);
  const password = validatePassword(body.password);
  const accountId = await createAccountRecord(env, username, password, false);
  return json({ accountId, username }, 201);
}

async function listAccounts(env: Env, auth: Auth): Promise<Response> {
  requireAdmin(auth);
  const keys = (await listAll(env, "accounts/")).map((o) => o.key).filter((k) => k.endsWith("/account.json"));
  const now = Date.now();

  const rows = await Promise.all(
    keys.map(async (key) => {
      const accountId = key.slice("accounts/".length, -"/account.json".length);
      const account = await getAccount(env, accountId);
      // Account kiểu login-code cũ (không có username/password) — không đăng nhập được nữa, ẩn khỏi danh sách.
      if (!account?.username) return null;
      const activeObj = await env.BUCKET.get(activeSessionKey(accountId));
      const active = activeObj ? ((await activeObj.json()) as ActiveSession) : null;
      const online = !!active && now - Date.parse(active.lastSeen) < HEARTBEAT_STALE_MS;
      return {
        accountId,
        name: account.name,
        username: account.username,
        createdAt: account.createdAt,
        isAdmin: account.isAdmin,
        disabled: account.disabled,
        online,
        lastSeen: active?.lastSeen ?? null,
      };
    })
  );

  const accounts = rows.filter((r): r is NonNullable<typeof r> => r !== null).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
  return json({ accounts });
}

// Admin đặt mật khẩu mới cho 1 account (team quên mật khẩu). Mật khẩu của CHÍNH admin thì đặt lại bằng
// Access Code ở màn đăng nhập (resetAdminPassword) — ở đây cũng cho phép nếu admin đang đăng nhập.
async function resetAccountPassword(request: Request, env: Env, auth: Auth, targetId: string): Promise<Response> {
  requireAdmin(auth);
  const account = await getAccount(env, targetId);
  if (!account?.username) throw new HttpError(404, "Account not found");
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  await setPassword(env, targetId, account, validatePassword(body.password));
  return json({ ok: true });
}

async function forceLogout(env: Env, auth: Auth, targetId: string): Promise<Response> {
  requireAdmin(auth);
  await clearActiveSession(env, targetId);
  return json({ ok: true });
}

async function setDisabled(env: Env, auth: Auth, targetId: string, disabled: boolean): Promise<Response> {
  requireAdmin(auth);
  const account = await getAccount(env, targetId);
  if (!account) throw new HttpError(404, "Account not found");
  if (disabled && account.isAdmin) throw new HttpError(400, "Cannot disable the admin account");

  account.disabled = disabled;
  await env.BUCKET.put(accountKey(targetId), JSON.stringify(account));
  if (disabled) await clearActiveSession(env, targetId);

  return json({ ok: true, disabled });
}

/* ---------------- List / download ---------------- */

async function listAll(env: Env, prefix: string): Promise<R2Object[]> {
  const out: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.BUCKET.list({ prefix, cursor, include: ["customMetadata"] });
    out.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

// Trả MỌI bản của mọi session (mới nhất trước) — app tự gom theo sessionId, gợi ý bản mới nhất nhưng
// vẫn cho người dùng chọn bản cũ hơn.
async function listSessions(env: Env, auth: Auth): Promise<Response> {
  const prefix = `accounts/${auth.accountId}/sessions/`;
  const objects = await listAll(env, prefix);
  const versions = objects
    .map((o) => {
      const [sessionId, file] = o.key.slice(prefix.length).split("/");
      const meta = o.customMetadata ?? {};
      return {
        sessionId,
        file,
        size: o.size,
        pushedAt: new Date(Number(file.slice(0, 13))).toISOString(),
        sessionName: decodeURIComponent(meta.sessionName ?? ""),
        modifiedAt: meta.modifiedAt ?? "",
        sha256: meta.sha256 ?? "",
        appVersion: meta.appVersion ?? "",
        participantCount: Number(meta.participantCount ?? 0),
      };
    })
    .filter((v) => v.sessionId && v.file && VERSION_FILE_PATTERN.test(v.file))
    .sort((x, y) => (x.pushedAt < y.pushedAt ? 1 : -1));
  // Session đã bị xoá (tombstone) — app chuyển bản local vào Trash thay vì tải về lại.
  const deleted = (await listAll(env, deletedPrefix(auth.accountId)))
    .map((o) => o.key.slice(deletedPrefix(auth.accountId).length).replace(/\.json$/, ""))
    .filter((id) => ID_PATTERN.test(id));
  return json({ versions, deleted });
}

/* ---------------- Head / tombstone (đồng bộ theo điểm chốt) ---------------- */

function sessionPrefix(accountId: string, sessionId: string): string {
  return `accounts/${accountId}/sessions/${sessionId}/`;
}
function deletedPrefix(accountId: string): string {
  return `accounts/${accountId}/deleted/`;
}

// Bản MỚI NHẤT của 1 session (tên file = phiên bản, vd "1763620000000.db") — null nếu chưa từng Push.
async function latestVersion(env: Env, accountId: string, sessionId: string): Promise<R2Object | null> {
  const prefix = sessionPrefix(accountId, sessionId);
  const objects = (await listAll(env, prefix)).filter((o) => VERSION_FILE_PATTERN.test(o.key.slice(prefix.length)));
  if (!objects.length) return null;
  return objects.reduce((a, b) => (a.key > b.key ? a : b));
}

// Request rất nhẹ (không tải file) — app gọi ở mỗi điểm chốt để biết cloud có bản mới hơn bản local
// đang dựa trên (`baseVersion`) hay không, rồi mới quyết Push/Pull/không làm gì.
async function sessionHead(env: Env, auth: Auth, sessionId: string): Promise<Response> {
  if (!ID_PATTERN.test(sessionId)) throw new HttpError(400, "Invalid sessionId");
  const latest = await latestVersion(env, auth.accountId, sessionId);
  const deleted = !!(await env.BUCKET.head(`${deletedPrefix(auth.accountId)}${sessionId}.json`));
  const prefix = sessionPrefix(auth.accountId, sessionId);
  return json({
    version: latest ? latest.key.slice(prefix.length) : null,
    sha256: latest?.customMetadata?.sha256 ?? "",
    sessionName: decodeURIComponent(latest?.customMetadata?.sessionName ?? ""),
    deleted,
  });
}

async function markDeleted(env: Env, auth: Auth, sessionId: string): Promise<Response> {
  if (!ID_PATTERN.test(sessionId)) throw new HttpError(400, "Invalid sessionId");
  await env.BUCKET.put(`${deletedPrefix(auth.accountId)}${sessionId}.json`, JSON.stringify({ deletedAt: new Date().toISOString() }));
  return json({ ok: true });
}

async function download(env: Env, auth: Auth, sessionId: string, file: string): Promise<Response> {
  if (!ID_PATTERN.test(sessionId) || !VERSION_FILE_PATTERN.test(file)) throw new HttpError(400, "Bad object path");
  const obj = await env.BUCKET.get(`accounts/${auth.accountId}/sessions/${sessionId}/${file}`);
  if (!obj) throw new HttpError(404, "Version not found");
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(obj.size),
      "X-Sha256": obj.customMetadata?.sha256 ?? "",
    },
  });
}

/* ---------------- Upload (multipart) ---------------- */

function uploadKey(auth: Auth, request: Request): string {
  // Key do Worker cấp ở startUpload, app gửi lại qua header — kiểm tra lại đúng account của token.
  const key = request.headers.get("X-Upload-Key") ?? "";
  if (!key.startsWith(`accounts/${auth.accountId}/sessions/`)) throw new HttpError(403, "Upload does not belong to this account");
  return key;
}

async function startUpload(request: Request, env: Env, auth: Auth): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const sessionId = String(body?.sessionId ?? "");
  if (!ID_PATTERN.test(sessionId)) throw new HttpError(400, "Invalid sessionId");

  const customMetadata: Record<string, string> = {};
  for (const field of META_FIELDS) {
    const value = String(body?.[field] ?? "");
    customMetadata[field] = field === "sessionName" ? encodeURIComponent(value) : value;
  }

  const key = `accounts/${auth.accountId}/sessions/${sessionId}/${Date.now()}.db`;
  const upload = await env.BUCKET.createMultipartUpload(key, { customMetadata });
  return json({ key, uploadId: upload.uploadId, partSize: PART_SIZE }, 201);
}

async function uploadPart(request: Request, env: Env, auth: Auth, uploadId: string, partNumberRaw: string): Promise<Response> {
  const key = uploadKey(auth, request);
  const partNumber = Number(partNumberRaw);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) throw new HttpError(400, "Invalid part number");
  const data = await request.arrayBuffer();
  if (data.byteLength === 0 || data.byteLength > PART_SIZE) throw new HttpError(400, "Invalid part size");
  const part = await env.BUCKET.resumeMultipartUpload(key, uploadId).uploadPart(partNumber, data);
  return json({ partNumber: part.partNumber, etag: part.etag });
}

async function completeUpload(request: Request, env: Env, auth: Auth, uploadId: string): Promise<Response> {
  const key = uploadKey(auth, request);
  const body = (await request.json().catch(() => null)) as { parts?: R2UploadedPart[]; baseVersion?: string | null } | null;
  if (!body?.parts?.length) throw new HttpError(400, "Missing parts");

  // Kiểm tra trước khi ghi: bản local được dựng từ `baseVersion` — nếu cloud đã có bản mới hơn thế (máy
  // khác đã Push trong lúc máy này mất mạng/khoá nguội) thì TỪ CHỐI, không đè. App nhận 409 rồi tự tải bản
  // cloud về + giữ bản local thành session riêng. Không cần atomic tuyệt đối: khoá phiên độc quyền đã đảm
  // bảo chỉ 1 thiết bị ghi tại 1 thời điểm, check này chỉ chặn trường hợp "dựa trên bản cũ".
  // `baseVersion` undefined = client cũ không gửi → bỏ qua check (tương thích ngược).
  const sessionDir = key.slice(0, key.lastIndexOf("/") + 1);
  const sessionId = sessionDir.split("/").filter(Boolean).pop() ?? "";
  if (body.baseVersion !== undefined) {
    const latest = await latestVersion(env, auth.accountId, sessionId);
    const latestName = latest ? latest.key.slice(sessionDir.length) : null;
    if (latestName !== (body.baseVersion ?? null)) {
      await env.BUCKET.resumeMultipartUpload(key, uploadId).abort().catch(() => undefined);
      throw new HttpError(409, "Session changed on another device");
    }
  }

  const obj = await env.BUCKET.resumeMultipartUpload(key, uploadId).complete(body.parts);
  await pruneOldVersions(env, key);
  // Push thành công = session đang "sống" — gỡ dấu đã xoá nếu có (vd vừa Restore từ Trash).
  await env.BUCKET.delete(`${deletedPrefix(auth.accountId)}${sessionId}.json`);
  return json({ key, size: obj.size, version: key.slice(sessionDir.length) });
}

async function abortUpload(request: Request, env: Env, auth: Auth, uploadId: string): Promise<Response> {
  const key = uploadKey(auth, request);
  await env.BUCKET.resumeMultipartUpload(key, uploadId).abort();
  return json({ ok: true });
}

async function pruneOldVersions(env: Env, newKey: string) {
  const sessionPrefix = newKey.slice(0, newKey.lastIndexOf("/") + 1);
  const objects = await listAll(env, sessionPrefix);
  const old = objects
    .map((o) => o.key)
    .sort()
    .reverse()
    .slice(KEEP_VERSIONS);
  if (old.length) await env.BUCKET.delete(old);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

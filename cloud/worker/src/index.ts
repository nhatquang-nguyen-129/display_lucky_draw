/**
 * Cloud Sync — Cloudflare Worker + R2 cho Lucky Draw Studio. Mô hình account (thay cho Space ẩn danh
 * cũ): mỗi account có dữ liệu riêng, đăng nhập bằng 1 login code do admin cấp, CHỈ 1 thiết bị được giữ
 * phiên hoạt động tại 1 thời điểm (server enforce, không phải app tự nhường nhau). Worker vẫn chỉ
 * lưu/trả NGUYÊN file session (.db), KHÔNG đọc nội dung bên trong. Xem docs/architecture/cloud-sync.md.
 *
 * Bố cục R2 (bucket binding BUCKET):
 *   accounts/<accountId>/account.json         → { name, loginCodeHash, createdAt, isAdmin, disabled }
 *   logincodes/<sha256(code)>.json             → { accountId }
 *   accounts/<accountId>/active-session.json  → { sessionTokenHash, deviceId, loginAt, lastSeen } — khoá độc quyền
 *   sessionTokens/<sha256(token)>.json         → { accountId } — index tra Bearer token → account
 *   accounts/<accountId>/sessions/<sessionId>/<pushedAtMs>.db → file session, customMetadata xem pushMeta
 *   admin/bootstrapped.json                    → { accountId } — đánh dấu đã tạo account admin, chặn tạo lần 2
 *
 * Mã/token chỉ lưu dạng hash — lộ bucket cũng không lộ được mã dùng thật.
 */

export interface Env {
  BUCKET: R2Bucket;
  ADMIN_TOKEN: string; // secret, đặt bằng `wrangler secret put ADMIN_TOKEN` — CHỈ dùng cho POST /v1/admin/bootstrap
}

interface Account {
  name: string;
  loginCodeHash: string;
  createdAt: string;
  isAdmin: boolean;
  disabled: boolean;
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
const BOOTSTRAP_MARKER_KEY = "admin/bootstrapped.json";

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

  if (resource === "admin" && a === "bootstrap" && !b && method === "POST") return bootstrapAdmin(request, env);
  if (resource === "login" && !a && method === "POST") return login(request, env);

  if (resource === "logout" && !a && method === "POST") return withSession(request, env, (auth) => logout(env, auth));
  if (resource === "heartbeat" && !a && method === "POST")
    return withSession(request, env, (auth, account) => heartbeat(env, auth, account));

  if (resource === "sessions" && !a && method === "GET") return withSession(request, env, (auth) => listSessions(env, auth));
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
    if (a && b === "regenerate-code" && method === "POST") return withSession(request, env, (auth) => regenerateCode(env, auth, a));
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

// Crockford base32 — bỏ I/L/O/U cho khỏi nhầm khi đọc mã qua điện thoại.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomCode(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((x) => CODE_ALPHABET[x % 32]).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function formatCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

// Login code người dùng gõ tay: bỏ gạch/khoảng trắng, không phân biệt hoa thường.
function normalizeLoginCode(raw: string): string {
  const t = raw.trim();
  return /^[0-9A-Za-z-\s]{10,16}$/.test(t) ? t.replace(/[-\s]/g, "").toUpperCase() : t;
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
function loginCodeKey(hash: string): string {
  return `logincodes/${hash}.json`;
}

async function getAccount(env: Env, accountId: string): Promise<Account | null> {
  const obj = await env.BUCKET.get(accountKey(accountId));
  return obj ? ((await obj.json()) as Account) : null;
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

// Làm ĐÚNG 1 LẦN NGOÀI APP (curl/script, dùng ADMIN_TOKEN) để tạo account admin đầu tiên. Từ chối nếu
// đã có admin — tránh tạo nhầm account admin thứ 2 do gọi lại endpoint này.
async function bootstrapAdmin(request: Request, env: Env): Promise<Response> {
  const header = request.headers.get("Authorization") ?? "";
  if (!env.ADMIN_TOKEN || !safeEqual(header, `Bearer ${env.ADMIN_TOKEN}`)) throw new HttpError(401, "Invalid admin token");
  if (await env.BUCKET.get(BOOTSTRAP_MARKER_KEY)) throw new HttpError(409, "Admin account already exists");

  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? "").trim() || "Admin";
  const accountId = crypto.randomUUID();
  const loginCode = randomCode(10);
  const loginCodeHash = await sha256Hex(loginCode);
  const account: Account = { name, loginCodeHash, createdAt: new Date().toISOString(), isAdmin: true, disabled: false };

  await env.BUCKET.put(accountKey(accountId), JSON.stringify(account));
  await env.BUCKET.put(loginCodeKey(loginCodeHash), JSON.stringify({ accountId }));
  await env.BUCKET.put(BOOTSTRAP_MARKER_KEY, JSON.stringify({ accountId }));

  // Mã chỉ trả về đúng 1 lần này — mất thì dùng account khác tạo lại qua regenerate-code.
  return json({ accountId, name, loginCode: formatCode(loginCode) }, 201);
}

async function login(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { loginCode?: string; deviceId?: string };
  const code = normalizeLoginCode(String(body.loginCode ?? ""));
  if (!code) throw new HttpError(400, "Missing login code");

  const idxObj = await env.BUCKET.get(loginCodeKey(await sha256Hex(code)));
  if (!idxObj) throw new HttpError(401, "Invalid login code");
  const { accountId } = (await idxObj.json()) as { accountId: string };
  const account = await getAccount(env, accountId);
  if (!account) throw new HttpError(401, "Invalid login code");
  if (account.disabled) throw new HttpError(403, "This account has been disabled");

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
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? "").trim() || "Untitled account";
  const accountId = crypto.randomUUID();
  const loginCode = randomCode(10);
  const loginCodeHash = await sha256Hex(loginCode);
  const account: Account = { name, loginCodeHash, createdAt: new Date().toISOString(), isAdmin: false, disabled: false };

  await env.BUCKET.put(accountKey(accountId), JSON.stringify(account));
  await env.BUCKET.put(loginCodeKey(loginCodeHash), JSON.stringify({ accountId }));

  // Mã chỉ trả về đúng 1 lần này — mất thì admin tự Regenerate code.
  return json({ accountId, name, loginCode: formatCode(loginCode) }, 201);
}

async function listAccounts(env: Env, auth: Auth): Promise<Response> {
  requireAdmin(auth);
  const keys = (await listAll(env, "accounts/")).map((o) => o.key).filter((k) => k.endsWith("/account.json"));
  const now = Date.now();

  const rows = await Promise.all(
    keys.map(async (key) => {
      const accountId = key.slice("accounts/".length, -"/account.json".length);
      const account = await getAccount(env, accountId);
      if (!account) return null;
      const activeObj = await env.BUCKET.get(activeSessionKey(accountId));
      const active = activeObj ? ((await activeObj.json()) as ActiveSession) : null;
      const online = !!active && now - Date.parse(active.lastSeen) < HEARTBEAT_STALE_MS;
      return {
        accountId,
        name: account.name,
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

async function regenerateCode(env: Env, auth: Auth, targetId: string): Promise<Response> {
  requireAdmin(auth);
  const account = await getAccount(env, targetId);
  if (!account) throw new HttpError(404, "Account not found");

  await env.BUCKET.delete(loginCodeKey(account.loginCodeHash));
  const loginCode = randomCode(10);
  account.loginCodeHash = await sha256Hex(loginCode);
  await env.BUCKET.put(accountKey(targetId), JSON.stringify(account));
  await env.BUCKET.put(loginCodeKey(account.loginCodeHash), JSON.stringify({ accountId: targetId }));

  return json({ accountId: targetId, loginCode: formatCode(loginCode) });
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
  return json({ versions });
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
  const body = (await request.json().catch(() => null)) as { parts?: R2UploadedPart[] } | null;
  if (!body?.parts?.length) throw new HttpError(400, "Missing parts");
  const obj = await env.BUCKET.resumeMultipartUpload(key, uploadId).complete(body.parts);
  await pruneOldVersions(env, key);
  return json({ key, size: obj.size });
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

/**
 * Cloud Sync — Cloudflare Worker + R2 cho Lucky Draw Studio. Chỉ lưu/trả NGUYÊN file session (.db),
 * KHÔNG đọc nội dung bên trong, KHÔNG đồng bộ từng dòng — việc "2 file có cùng 1 session không / giữ
 * bản nào" vẫn do app tự xử lý ở máy local (rescan()/SessionConflictDialog), y như copy file qua USB.
 * Xem docs/architecture/cloud-sync.md.
 *
 * Bố cục R2 (bucket binding BUCKET):
 *   tokens/<sha256(token)>.json                              → { spaceId, role: "read" | "write" }
 *   spaces/<spaceId>/space.json                              → { name, createdAt }
 *   spaces/<spaceId>/sessions/<sessionId>/<pushedAtMs>.db    → file session, customMetadata xem pushMeta
 *
 * Token chỉ lưu dạng hash — lộ bucket cũng không lộ được mã dùng thật.
 */

export interface Env {
  BUCKET: R2Bucket;
  ADMIN_TOKEN: string; // secret, đặt bằng `wrangler secret put ADMIN_TOKEN`
}

type Role = "read" | "write";
interface Auth {
  spaceId: string;
  role: Role;
}

// Mỗi session giữ tối đa chừng này bản trên cloud — bản cũ hơn tự xoá sau mỗi lần Push thành công.
const KEEP_VERSIONS = 10;
// Phần upload: Worker giới hạn body ~100MB, RAM 128MB → 32MB/phần là an toàn (R2 yêu cầu ≥ 5MB trừ phần cuối).
const PART_SIZE = 32 * 1024 * 1024;
const ID_PATTERN = /^[0-9a-zA-Z_-]{1,64}$/;
const VERSION_FILE_PATTERN = /^\d{13}\.db$/;
// Metadata app gửi lên khi Push — đều là chuỗi (R2 customMetadata chỉ nhận string).
const META_FIELDS = ["sessionName", "modifiedAt", "sha256", "appVersion", "participantCount"] as const;

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

  if (resource === "spaces" && method === "POST" && !a) return createSpace(request, env);

  const auth = await authenticate(request, env);

  if (resource === "space" && method === "GET" && !a) return getSpace(env, auth);
  if (resource === "sessions" && method === "GET" && !a) return listSessions(env, auth);
  if (resource === "objects" && method === "GET" && a && b && !c) return download(env, auth, a, b);

  if (resource === "uploads") {
    requireWrite(auth);
    if (method === "POST" && !a) return startUpload(request, env, auth);
    if (method === "PUT" && a && b === "parts" && c) return uploadPart(request, env, auth, a, c);
    if (method === "POST" && a && b === "complete" && !c) return completeUpload(request, env, auth, a);
    if (method === "DELETE" && a && !b) return abortUpload(request, env, auth, a);
  }
  throw new HttpError(404, "Not found");
}

/* ---------------- Auth ---------------- */

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Read code người dùng gõ tay: bỏ gạch/khoảng trắng, không phân biệt hoa thường. Write token để nguyên.
function normalizeToken(raw: string): string {
  const t = raw.trim();
  return /^[0-9A-Za-z-\s]{10,16}$/.test(t) ? t.replace(/[-\s]/g, "").toUpperCase() : t;
}

async function authenticate(request: Request, env: Env): Promise<Auth> {
  const header = request.headers.get("Authorization") ?? "";
  const raw = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!raw) throw new HttpError(401, "Missing access code");
  const obj = await env.BUCKET.get(`tokens/${await sha256Hex(normalizeToken(raw))}.json`);
  if (!obj) throw new HttpError(401, "Invalid access code");
  return (await obj.json()) as Auth;
}

function requireWrite(auth: Auth) {
  if (auth.role !== "write") throw new HttpError(403, "This code is read-only — use the write token to push");
}

// So sánh không lộ thời gian, tránh dò ADMIN_TOKEN theo từng ký tự.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------------- Space ---------------- */

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

async function createSpace(request: Request, env: Env): Promise<Response> {
  const header = request.headers.get("Authorization") ?? "";
  if (!env.ADMIN_TOKEN || !safeEqual(header, `Bearer ${env.ADMIN_TOKEN}`)) throw new HttpError(401, "Invalid admin token");

  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? "").trim() || "Untitled space";
  const spaceId = crypto.randomUUID();
  const readCode = randomCode(10);
  const writeToken = randomToken();

  await env.BUCKET.put(`spaces/${spaceId}/space.json`, JSON.stringify({ name, createdAt: new Date().toISOString() }));
  await env.BUCKET.put(`tokens/${await sha256Hex(readCode)}.json`, JSON.stringify({ spaceId, role: "read" }));
  await env.BUCKET.put(`tokens/${await sha256Hex(writeToken)}.json`, JSON.stringify({ spaceId, role: "write" }));

  // Mã chỉ trả về đúng 1 lần này — mất thì tạo Space mới.
  return json({ spaceId, name, readCode: `${readCode.slice(0, 5)}-${readCode.slice(5)}`, writeToken }, 201);
}

async function getSpace(env: Env, auth: Auth): Promise<Response> {
  const obj = await env.BUCKET.get(`spaces/${auth.spaceId}/space.json`);
  const space = obj ? ((await obj.json()) as { name: string; createdAt: string }) : { name: "", createdAt: "" };
  return json({ ...space, role: auth.role });
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
  const prefix = `spaces/${auth.spaceId}/sessions/`;
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
  const obj = await env.BUCKET.get(`spaces/${auth.spaceId}/sessions/${sessionId}/${file}`);
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
  // Key do Worker cấp ở startUpload, app gửi lại qua header — kiểm tra lại đúng Space của token.
  const key = request.headers.get("X-Upload-Key") ?? "";
  if (!key.startsWith(`spaces/${auth.spaceId}/sessions/`)) throw new HttpError(403, "Upload does not belong to this space");
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

  const key = `spaces/${auth.spaceId}/sessions/${sessionId}/${Date.now()}.db`;
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

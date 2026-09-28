import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import os from "os";
import { randomUUID } from "crypto";
import { app, dialog } from "electron";

/**
 * Lưu trữ theo SESSION: mỗi session (tab) là ĐÚNG 1 file SQLite trong thư mục `data/` — copy 1 file là
 * mang theo nguyên 1 session (participants, prizes, landing, lịch sử quay) sang máy khác. Xem
 * docs/architecture/database-schema.md mục "Lưu trữ theo session".
 *
 * Thư mục `data/`:
 * - Bản thư mục/portable (giải nén từ zip): `data/` cạnh exe (Windows) / cạnh `.app` (macOS).
 * - Dev, bản Setup Windows, app macOS trong Applications: `<userData>/data/`.
 *
 * Mỗi file giữ NGUYÊN schema 4 bảng (kể cả cột session_id) nhưng chỉ chứa đúng 1 dòng `sessions` —
 * mọi câu SQL cũ dùng lại được y nguyên, chỉ đổi từ 1 kết nối chung sang `getDb(sessionId)`.
 * Định danh = `sessions.id` (UUID) BÊN TRONG file, không phải tên file — tên file
 * (`<tên-session>__<8 ký tự đầu id>.db`) chỉ để người dùng dễ nhận biết, trùng tên session không sao.
 */
const IS_MAC = process.platform === "darwin";

// Thư mục đặt `data\` của bản thư mục, hoặc null = dùng userData.
function folderBuildBaseDir(): string | null {
  if (!app.isPackaged) return null;

  if (process.platform === "win32") {
    if (process.env.PORTABLE_EXECUTABLE_DIR) return null;
    const exeDir = path.dirname(process.execPath);
    const isInstalled = fs.readdirSync(exeDir).some((f) => /^Uninstall .+\.exe$/i.test(f));
    return isInstalled ? null : exeDir;
  }

  if (IS_MAC) {
    // execPath = .../Lucky Draw Studio.app/Contents/MacOS/Lucky Draw Studio → lùi 3 cấp ra bundle.
    // KHÔNG ghi vào bên trong bundle (Gatekeeper coi bundle bị sửa, vỡ chữ ký) — ghi cạnh bundle.
    const bundleDir = path.resolve(process.execPath, "..", "..", "..");
    if (!bundleDir.endsWith(".app")) return null;
    const parentDir = path.dirname(bundleDir);
    const applicationsDirs = ["/Applications", path.join(os.homedir(), "Applications")];
    return applicationsDirs.includes(parentDir) ? null : parentDir;
  }

  return null;
}

// Bản thư mục mà chạy từ chỗ tạm/không ghi được thì dữ liệu sẽ mất/không lưu được — chặn hẳn, KHÔNG
// âm thầm fallback về userData (người dùng sẽ tưởng dữ liệu vẫn nằm trong thư mục app).
function failFolderBuild(message: string): never {
  dialog.showErrorBox("Lucky Draw Studio", message);
  process.exit(1);
}

// Thư mục chứa `lucky-draw.db` KIỂU CŨ (1 file cho mọi session, trước khi tách theo session) — chính
// là chỗ `data/` của bản thư mục, hoặc thẳng `userData` ở các trường hợp còn lại.
function resolveLegacyDir(): string {
  const baseDir = folderBuildBaseDir();
  if (!baseDir) return app.getPath("userData");

  // macOS App Translocation: app còn cờ quarantine (giải nén từ zip tải về/AirDrop) bị macOS âm thầm
  // chạy từ 1 bản sao chỉ-đọc ở đường dẫn ngẫu nhiên → không thấy `data/` thật cạnh app.
  if (IS_MAC && process.execPath.includes("/AppTranslocation/")) {
    failFolderBuild(
      "macOS is running the app from a protected temporary copy, so it cannot find or save the data " +
        "folder next to it.\n\n" +
        "Fix (once per copy): open Terminal, type\n\n" +
        "    xattr -dr com.apple.quarantine \n\n" +
        "(with a space at the end), drag the Lucky Draw Studio folder into the Terminal window, " +
        "press Return, then open the app again."
    );
  }

  // Windows: mở exe ngay trong file zip chưa giải nén → Windows tự bung ra %TEMP%.
  const tmpDir = path.resolve(os.tmpdir()).toLowerCase();
  if (path.resolve(baseDir).toLowerCase().startsWith(tmpDir + path.sep)) {
    failFolderBuild(
      "The app is running from a temporary folder (probably straight from inside a .zip file).\n\n" +
        "Please extract the whole folder first (right-click the .zip → Extract All), then run " +
        "Lucky Draw Studio from the extracted folder. Otherwise your data will not be saved."
    );
  }
  return path.join(baseDir, "data");
}

function ensureWritableDir(dir: string) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    // Ghi thử + xoá 1 file dò — đáng tin hơn fs.accessSync (chỉ đọc bit quyền) với USB/ổ mạng.
    const probe = path.join(dir, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, "");
    fs.unlinkSync(probe);
  } catch {
    failFolderBuild(
      `Cannot write to the data folder:\n${dir}\n\n` +
        "Move the Lucky Draw Studio folder to a writable location (e.g. Desktop, Documents or a USB " +
        "drive without write protection), then run it again." +
        (IS_MAC ? "\n\nOn a Mac, USB drives formatted as NTFS are read-only — use an exFAT-formatted drive." : "")
    );
  }
}

// Chặn mở 2 app đóng gói cùng lúc (2 process cùng ghi 1 file DB) — phải xin lock TRƯỚC khi mở DB,
// nên đặt ở đây thay vì main.ts (main.ts import db.ts trước mọi dòng code khác). Instance thứ 2 thoát
// luôn, instance đang chạy tự focus lại cửa sổ (xem "second-instance" trong main.ts). Chỉ áp dụng bản
// đóng gói — dev vẫn mở song song được như cũ.
if (app.isPackaged && !app.requestSingleInstanceLock()) {
  process.exit(0);
}

const LEGACY_DIR = resolveLegacyDir();
export const DATA_DIR = folderBuildBaseDir() ? LEGACY_DIR : path.join(LEGACY_DIR, "data");
const TRASH_DIR = path.join(DATA_DIR, ".trash");
ensureWritableDir(DATA_DIR);

/* ---------------- Schema + migration (áp cho TỪNG file) ---------------- */

type DB = Database.Database;

function columnsOf(db: DB, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

function addColumnIfMissing(db: DB, table: string, name: string, ddl: string) {
  if (!columnsOf(db, table).includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function ensureSchema(db: DB) {
  db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  allow_duplicate_prize INTEGER NOT NULL DEFAULT 0,
  exclude_previous_winners INTEGER NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'draft',
  landing_config TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  code TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  extra_data TEXT,
  sort_order INTEGER,
  source TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prizes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  code TEXT,
  name TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  quantity INTEGER NOT NULL DEFAULT 1,
  remaining INTEGER NOT NULL DEFAULT 1,
  weight REAL NOT NULL DEFAULT 1,
  allow_duplicate_with_other_prizes INTEGER NOT NULL DEFAULT 1,
  allow_duplicate_with_same_prize INTEGER NOT NULL DEFAULT 0,
  max_win_count INTEGER NOT NULL DEFAULT 1,
  display_image TEXT,
  image_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS draw_results (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  prize_id TEXT NOT NULL,
  drawn_at TEXT DEFAULT (datetime('now')),
  rng_seed TEXT,
  confirmed INTEGER NOT NULL DEFAULT 1
);
`);
  migrateToPerSessionData(db);
  migratePrizeFields(db);
  migrateParticipantSortOrder(db);
  // Cột cấu hình Data Editor ở sessions — JSON text, per-session (xem docs/participants/schema.md).
  // participant_duplicate_columns không còn được đọc/ghi, giữ để không phá DB cũ.
  addColumnIfMissing(db, "sessions", "participant_column_types", "participant_column_types TEXT");
  addColumnIfMissing(db, "sessions", "participant_duplicate_columns", "participant_duplicate_columns TEXT");
  addColumnIfMissing(db, "sessions", "participant_column_labels", "participant_column_labels TEXT");
  // draw_results.confirmed — lượt pick chưa Confirm ghi confirmed = 0 (xem drawEngine.ts). DEFAULT 1
  // cho dữ liệu cũ vì mọi dòng có trước migration này đều đã đi qua commitDraw.
  addColumnIfMissing(db, "draw_results", "confirmed", "confirmed INTEGER NOT NULL DEFAULT 1");
  // Khoá session (chặn sửa/xoá Participant/Prize, mở Data Editor/Presentation/Builder) — không phải
  // bảo mật, chỉ tránh nhầm lẫn chỉnh sửa sau khi đã quay xong. Không có password/khôi phục.
  addColumnIfMissing(db, "sessions", "locked", "locked INTEGER NOT NULL DEFAULT 0");
  migratePrizeLevelRules(db);
}

export function setSessionLocked(sessionId: string, locked: boolean) {
  getDb(sessionId).prepare(`UPDATE sessions SET locked = ? WHERE id = ?`).run(locked ? 1 : 0, sessionId);
}

// Gọi ở ĐẦU mọi IPC handler sửa/xoá dữ liệu hoặc mở cửa sổ Data Editor/Presentation/Builder — xem
// docs/deploy (Session Lock). Throw để ipcRenderer.invoke ở phía renderer reject, dù nút bấm tương
// ứng đã bị disable khi khoá (đây là lớp chặn thật, không chỉ ẩn nút).
export function assertSessionUnlocked(sessionId: string) {
  const row = getDb(sessionId).prepare(`SELECT locked FROM sessions WHERE id = ?`).get(sessionId) as
    | { locked: number }
    | undefined;
  if (row?.locked) throw new Error("Session is locked");
}

/**
 * Chuyển luật trùng lặp từ cấp session sang HẲN cấp giải (xem pickWinner trong drawEngine.ts). Cờ cũ
 * `sessions.exclude_previous_winners = 1` (bật sẵn cho mọi session, không có UI để tắt) loại mọi người đã
 * trúng, che mất 2 tuỳ chọn "Allow duplicate" của từng giải. Để session cũ GIỮ NGUYÊN hành vi, tắt cả 2
 * tuỳ chọn trên mọi giải của session đó — tương đương chính xác "mỗi người trúng tối đa 1 giải, 1 lần" —
 * rồi hạ cờ về 0. Chạy đúng 1 lần mỗi file (đánh dấu bằng PRAGMA user_version), nên sau đó người tổ chức
 * tự bật tuỳ chọn nào thì tuỳ chọn đó có hiệu lực, không bị ghi đè lại. File DB kiểu cũ nhiều session
 * được migrate TRƯỚC khi tách (splitMultiSessionFile mở file nguồn qua openFile → ensureSchema).
 */
function migratePrizeLevelRules(db: DB) {
  if ((db.pragma("user_version", { simple: true }) as number) >= 1) return;
  db.transaction(() => {
    db.prepare(
      `UPDATE prizes SET allow_duplicate_with_other_prizes = 0, allow_duplicate_with_same_prize = 0, max_win_count = 1
       WHERE session_id IN (SELECT id FROM sessions WHERE exclude_previous_winners = 1)`
    ).run();
    db.prepare(`UPDATE sessions SET exclude_previous_winners = 0`).run();
    db.pragma("user_version = 1");
  })();
}

/**
 * Migration cũ nhất: từ mô hình participants/prizes dùng chung toàn app sang mỗi session sở hữu
 * participants + prizes riêng. Chỉ còn tác dụng với file DB rất cũ (được tách ra theo session ngay
 * sau đó, xem splitMultiSessionFile). An toàn chạy nhiều lần.
 */
function migrateToPerSessionData(db: DB) {
  const participantCols = columnsOf(db, "participants");
  const hasParticipantSession = participantCols.includes("session_id");
  const hasPrizeSession = columnsOf(db, "prizes").includes("session_id");

  addColumnIfMissing(db, "sessions", "landing_config", "landing_config TEXT");
  addColumnIfMissing(db, "participants", "extra_data", "extra_data TEXT");

  if (hasParticipantSession && hasPrizeSession) return;

  const tx = db.transaction(() => {
    const defaultId = randomUUID();
    db.prepare(`INSERT INTO sessions (id, name, status) VALUES (?, ?, 'draft')`).run(defaultId, "Default session (legacy data)");

    if (!hasParticipantSession) {
      // Tạo lại bảng thay vì chỉ ALTER, vì cần bỏ UNIQUE global trên "code".
      db.exec(`
        CREATE TABLE participants_new (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          code TEXT,
          name TEXT NOT NULL,
          phone TEXT,
          email TEXT,
          extra_data TEXT,
          source TEXT DEFAULT 'manual',
          status TEXT DEFAULT 'active',
          created_at TEXT DEFAULT (datetime('now'))
        );
        INSERT INTO participants_new (id, session_id, code, name, phone, email, extra_data, source, status, created_at)
        SELECT id, '${defaultId}', code, name, phone, email, extra_data, source, status, created_at FROM participants;
        DROP TABLE participants;
        ALTER TABLE participants_new RENAME TO participants;
      `);
    }

    if (!hasPrizeSession) {
      db.exec(`ALTER TABLE prizes ADD COLUMN session_id TEXT`);
      const hasSessionPrizesTable = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='session_prizes'`)
        .get();
      if (hasSessionPrizesTable) {
        const links = db.prepare(`SELECT prize_id, session_id FROM session_prizes`).all() as {
          prize_id: string;
          session_id: string;
        }[];
        const assigned = new Set<string>();
        const updatePrize = db.prepare(`UPDATE prizes SET session_id = ? WHERE id = ?`);
        for (const link of links) {
          if (assigned.has(link.prize_id)) continue;
          updatePrize.run(link.session_id, link.prize_id);
          assigned.add(link.prize_id);
        }
        db.exec(`DROP TABLE session_prizes`);
      }
      db.prepare(`UPDATE prizes SET session_id = ? WHERE session_id IS NULL`).run(defaultId);
    }
  });
  tx();
}

/** Thêm các cột thiết kế giải thưởng vào DB cũ (chỉ ALTER cột thật sự chưa có). */
function migratePrizeFields(db: DB) {
  addColumnIfMissing(db, "prizes", "code", "code TEXT");
  addColumnIfMissing(db, "prizes", "category", "category TEXT");
  addColumnIfMissing(db, "prizes", "status", "status TEXT NOT NULL DEFAULT 'active'");
  addColumnIfMissing(db, "prizes", "allow_duplicate_with_other_prizes", "allow_duplicate_with_other_prizes INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing(db, "prizes", "allow_duplicate_with_same_prize", "allow_duplicate_with_same_prize INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "prizes", "max_win_count", "max_win_count INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing(db, "prizes", "display_image", "display_image TEXT");
}

/** sort_order cho participants (kéo-thả sắp xếp dòng trong Data Editor), backfill theo created_at DESC. */
function migrateParticipantSortOrder(db: DB) {
  addColumnIfMissing(db, "participants", "sort_order", "sort_order INTEGER");
  const needsBackfill = db.prepare(`SELECT COUNT(*) as cnt FROM participants WHERE sort_order IS NULL`).get() as {
    cnt: number;
  };
  if (needsBackfill.cnt > 0) {
    const rows = db.prepare(`SELECT id FROM participants ORDER BY created_at DESC`).all() as { id: string }[];
    const update = db.prepare(`UPDATE participants SET sort_order = ? WHERE id = ?`);
    db.transaction(() => rows.forEach((r, i) => update.run(i, r.id)))();
  }
}

/* ---------------- Mở file ---------------- */

// journal_mode = DELETE (không dùng WAL): mỗi lần ghi xong, file .db đã tự chứa đủ dữ liệu — người dùng
// copy riêng file .db đi lúc nào cũng an toàn, không sợ phần mới nhất còn nằm trong file -wal.
function openFile(file: string, readonly = false): DB {
  const db = new Database(file, readonly ? { readonly: true, fileMustExist: true } : undefined);
  if (!readonly) {
    db.pragma("journal_mode = DELETE");
    ensureSchema(db);
  }
  return db;
}

/** Tên file từ tên session — bỏ dấu tiếng Việt, ký tự lạ thành "-", tối đa 40 ký tự. */
function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"))
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "Session";
}

function fileNameFor(name: string, id: string): string {
  return `${slugify(name)}__${id.slice(0, 8)}.db`;
}

// Tránh ghi đè file có sẵn (vd 2 session trùng tên VÀ trùng 8 ký tự đầu id — gần như không thể, nhưng
// rẻ để chặn): thêm hậu tố -2, -3...
function uniquePath(dir: string, fileName: string): string {
  let target = path.join(dir, fileName);
  const ext = path.extname(fileName);
  const base = fileName.slice(0, -ext.length);
  for (let n = 2; fs.existsSync(target); n++) target = path.join(dir, `${base}-${n}${ext}`);
  return target;
}

function sameFile(a: string, b: string): boolean {
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

// Chuyển 1 file vào data/.trash/ thay vì xoá hẳn — có đường lấy lại nếu bấm nhầm.
function moveToTrash(file: string) {
  fs.mkdirSync(TRASH_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = uniquePath(TRASH_DIR, `${path.basename(file, ".db")}__deleted-${stamp}.db`);
  fs.renameSync(file, target);
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (fs.existsSync(file + suffix)) fs.renameSync(file + suffix, target + suffix);
  }
}

/* ---------------- Tách file nhiều session (DB kiểu cũ) ---------------- */

const SESSION_TABLES = ["sessions", "participants", "prizes", "draw_results"] as const;

/**
 * Tách 1 file chứa NHIỀU session (lucky-draw.db kiểu cũ, hoặc file đó bị copy thẳng vào data/) thành
 * từng file theo session trong data/, rồi đổi tên file gốc thành `*.migrated-<thời điểm>.bak` — KHÔNG
 * xoá, luôn còn bản sao lưu nguyên vẹn. Copy theo danh sách cột của file đích (ATTACH + INSERT … SELECT
 * đúng tên cột) nên không phụ thuộc thứ tự cột của 2 file.
 */
function splitMultiSessionFile(source: string) {
  const src = openFile(source); // ensureSchema: đưa file cũ lên schema hiện tại trước khi copy
  const sessions = src.prepare(`SELECT id, name FROM sessions`).all() as { id: string; name: string }[];
  src.pragma("wal_checkpoint(TRUNCATE)");
  src.close();

  for (const s of sessions) {
    const target = uniquePath(DATA_DIR, fileNameFor(s.name, s.id));
    const dst = openFile(target);
    dst.prepare(`ATTACH DATABASE ? AS src`).run(source);
    dst.transaction(() => {
      for (const table of SESSION_TABLES) {
        const cols = columnsOf(dst, table)
          .map((c) => `"${c}"`)
          .join(", ");
        const key = table === "sessions" ? "id" : "session_id";
        dst.prepare(`INSERT INTO main.${table} (${cols}) SELECT ${cols} FROM src.${table} WHERE ${key} = ?`).run(s.id);
      }
    })();
    dst.exec(`DETACH DATABASE src`);
    dst.close();
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `${source}.migrated-${stamp}.bak`;
  fs.renameSync(source, backup);
  for (const suffix of ["-wal", "-shm"]) {
    if (fs.existsSync(source + suffix)) fs.renameSync(source + suffix, backup + suffix);
  }
  console.log(`[db] Split ${source} into ${sessions.length} session file(s); original kept as ${backup}`);
}

/* ---------------- Registry: session id → file đang dùng ---------------- */

interface Entry {
  file: string;
  db: DB;
}

const entries = new Map<string, Entry>();
// Các BẢN KHÁC của 1 session đang dùng (cùng id, khác file) — chờ người dùng chọn giữ bản nào.
const conflictFiles = new Map<string, Set<string>>();

function readSessionIds(file: string): { id: string; name: string }[] | null {
  try {
    const db = openFile(file, true);
    try {
      return db.prepare(`SELECT id, name FROM sessions`).all() as { id: string; name: string }[];
    } finally {
      db.close();
    }
  } catch {
    return null; // không phải DB hợp lệ / thiếu bảng sessions → bỏ qua
  }
}

/**
 * Quét lại data/: mở file mới xuất hiện, bỏ đăng ký file đã biến mất, phát hiện bản trùng. Gọi lúc
 * khởi động và mỗi lần renderer lấy danh sách session (cửa sổ chính được focus lại) — copy file vào
 * data/ trong lúc app đang mở cũng tự hiện tab mới.
 */
export function rescan() {
  // File đã đăng ký nhưng bị xoá/đổi tên ngoài app.
  for (const [id, entry] of entries) {
    if (!fs.existsSync(entry.file)) {
      entry.db.close();
      entries.delete(id);
    }
  }
  for (const [id, files] of conflictFiles) {
    for (const f of files) if (!fs.existsSync(f)) files.delete(f);
    if (files.size === 0) conflictFiles.delete(id);
  }

  const known = new Set<string>();
  for (const e of entries.values()) known.add(e.file.toLowerCase());
  for (const files of conflictFiles.values()) for (const f of files) known.add(f.toLowerCase());

  // Mới nhất trước — lúc khởi động, bản sửa gần nhất của 1 session được đăng ký làm bản dùng mặc định.
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.toLowerCase().endsWith(".db") && !f.startsWith("."))
    .map((f) => path.join(DATA_DIR, f))
    .filter((f) => !known.has(f.toLowerCase()))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  for (const file of files) {
    const rows = readSessionIds(file);
    if (!rows || rows.length === 0) continue;
    if (rows.length > 1) {
      splitMultiSessionFile(file);
      rescan(); // file tách ra là file mới trong data/ — quét lại để đăng ký
      return;
    }
    const { id } = rows[0];
    if (entries.has(id)) {
      if (!conflictFiles.has(id)) conflictFiles.set(id, new Set());
      conflictFiles.get(id)!.add(file);
    } else {
      entries.set(id, { file, db: openFile(file) });
    }
  }
}

// Khởi động: tách lucky-draw.db kiểu cũ (nếu còn) rồi quét data/.
const legacyFile = path.join(LEGACY_DIR, "lucky-draw.db");
if (fs.existsSync(legacyFile)) splitMultiSessionFile(legacyFile);
rescan();

/* ---------------- API cho main.ts / drawEngine.ts ---------------- */

export function getDb(sessionId: string): DB {
  const entry = entries.get(sessionId);
  if (!entry) throw new Error(`Session not found: ${sessionId}`);
  return entry.db;
}

export function hasSession(sessionId: string): boolean {
  return entries.has(sessionId);
}

export function listSessions(): any[] {
  rescan();
  const rows = [...entries.values()]
    .map((e) => e.db.prepare(`SELECT * FROM sessions LIMIT 1`).get())
    .filter(Boolean) as { created_at: string }[];
  return rows.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
}

export function createSession(data: { name: string; allowDuplicatePrize?: boolean; excludePreviousWinners?: boolean }): string {
  const id = randomUUID();
  const file = uniquePath(DATA_DIR, fileNameFor(data.name, id));
  const db = openFile(file);
  db.prepare(
    `INSERT INTO sessions (id, name, allow_duplicate_prize, exclude_previous_winners, status) VALUES (?, ?, ?, ?, 'draft')`
  ).run(id, data.name, data.allowDuplicatePrize ? 1 : 0, 0); // exclude_previous_winners: không còn dùng, xem migratePrizeLevelRules
  entries.set(id, { file, db });
  return id;
}

/** Đổi tên session + đổi tên file theo. Đổi tên file lỗi (bị khoá…) thì giữ tên file cũ — định danh
 *  nằm trong file nên không ảnh hưởng gì. */
export function renameSession(id: string, name: string) {
  const entry = entries.get(id);
  if (!entry) throw new Error(`Session not found: ${id}`);
  entry.db.prepare(`UPDATE sessions SET name = ? WHERE id = ?`).run(name, id);

  const desired = path.join(DATA_DIR, fileNameFor(name, id));
  if (sameFile(desired, entry.file)) return;
  const target = uniquePath(DATA_DIR, path.basename(desired));
  entry.db.close();
  try {
    fs.renameSync(entry.file, target);
    entry.file = target;
  } catch (e) {
    console.warn(`[db] Could not rename ${entry.file}:`, e);
  }
  entry.db = openFile(entry.file);
}

/** Xoá tab = chuyển file vào data/.trash/ (không xoá hẳn). */
export function deleteSession(id: string) {
  const entry = entries.get(id);
  if (!entry) return;
  entry.db.close();
  entries.delete(id);
  moveToTrash(entry.file);
}

export interface SessionCopyInfo {
  file: string; // tên file (không kèm thư mục)
  modifiedAt: string; // ISO
  participants: number;
  prizes: number;
  confirmedDraws: number;
  inUse: boolean; // bản app đang dùng
  recommended: boolean; // bản sửa gần nhất
}

export interface SessionConflict {
  sessionId: string;
  name: string;
  copies: SessionCopyInfo[];
}

function copyInfo(file: string, inUse: boolean, db?: DB): Omit<SessionCopyInfo, "recommended"> {
  // Bản chưa dùng mở READ-ONLY: không chạy migration lên nó (sẽ đổi mtime — chính là tiêu chí "bản mới
  // nhất"). File cũ có thể thiếu cột (vd confirmed) → đếm lỗi thì trả 0.
  const handle = db ?? openFile(file, true);
  try {
    const count = (sql: string) => {
      try {
        return (handle.prepare(sql).get() as { n: number }).n;
      } catch {
        return 0;
      }
    };
    return {
      file: path.basename(file),
      modifiedAt: fs.statSync(file).mtime.toISOString(),
      participants: count(`SELECT COUNT(*) AS n FROM participants WHERE status != 'removed'`),
      prizes: count(`SELECT COUNT(*) AS n FROM prizes`),
      confirmedDraws: count(`SELECT COUNT(*) AS n FROM draw_results WHERE confirmed = 1`),
      inUse,
    };
  } finally {
    if (!db) handle.close();
  }
}

/** Session nào đang có ≥ 2 file cùng id trong data/ — renderer hiện hộp thoại cho người dùng chọn. */
export function listConflicts(): SessionConflict[] {
  rescan();
  const out: SessionConflict[] = [];
  for (const [sessionId, others] of conflictFiles) {
    const entry = entries.get(sessionId);
    if (!entry || others.size === 0) continue;
    const copies = [
      copyInfo(entry.file, true, entry.db),
      ...[...others].map((f) => copyInfo(f, false)),
    ];
    const newest = copies.reduce((a, b) => (a.modifiedAt >= b.modifiedAt ? a : b));
    const name = (entry.db.prepare(`SELECT name FROM sessions LIMIT 1`).get() as { name: string }).name;
    out.push({ sessionId, name, copies: copies.map((c) => ({ ...c, recommended: c === newest })) });
  }
  return out;
}

/** Giữ đúng 1 bản (`keepFile`, tên file) của session, các bản còn lại chuyển vào data/.trash/. */
export function resolveConflict(sessionId: string, keepFile: string) {
  const entry = entries.get(sessionId);
  const others = conflictFiles.get(sessionId);
  if (!entry || !others) return;
  const all = [entry.file, ...others];
  const keep = all.find((f) => sameFile(path.basename(f), keepFile));
  if (!keep) throw new Error(`File not found: ${keepFile}`);

  if (!sameFile(keep, entry.file)) {
    entry.db.close();
    moveToTrash(entry.file);
    entries.set(sessionId, { file: keep, db: openFile(keep) });
  }
  for (const f of others) if (!sameFile(f, keep) && fs.existsSync(f)) moveToTrash(f);
  conflictFiles.delete(sessionId);

  // Bản giữ lại thường mang tên kiểu "... (2).db" do Windows/Finder tự đặt lúc copy — đổi về tên chuẩn
  // (tên chuẩn giờ đã trống vì các bản khác vừa vào .trash).
  const kept = entries.get(sessionId)!;
  const name = (kept.db.prepare(`SELECT name FROM sessions LIMIT 1`).get() as { name: string }).name;
  const desired = path.join(DATA_DIR, fileNameFor(name, sessionId));
  if (!sameFile(desired, kept.file) && !fs.existsSync(desired)) {
    kept.db.close();
    try {
      fs.renameSync(kept.file, desired);
      kept.file = desired;
    } catch (e) {
      console.warn(`[db] Could not rename ${kept.file}:`, e);
    }
    kept.db = openFile(kept.file);
  }
}

export function closeAll() {
  for (const e of entries.values()) if (e.db.open) e.db.close();
}

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import os from "os";
import { randomUUID } from "crypto";
import { app, dialog } from "electron";

/**
 * Chọn thư mục chứa lucky-draw.db — xem docs/deploy/portable.md + installer.md.
 *
 * - Dev (`!app.isPackaged`), bản Setup Windows (NSIS, có "Uninstall *.exe" cạnh exe), bản portable
 *   exe Windows (có PORTABLE_EXECUTABLE_DIR), app macOS đã kéo vào Applications (= "cài đặt" kiểu
 *   Mac): giữ nguyên `userData` như cũ.
 * - Bản thư mục (giải nén từ file zip): `data\` cạnh exe (Windows) / cạnh `.app` bundle (macOS) —
 *   copy nguyên thư mục app sang máy khác là mang theo luôn toàn bộ dữ liệu.
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

function resolveDbDir(): string {
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

  const dataDir = path.join(baseDir, "data");
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    // Ghi thử + xoá 1 file dò — đáng tin hơn fs.accessSync (chỉ đọc bit quyền) với USB/ổ mạng.
    const probe = path.join(dataDir, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, "");
    fs.unlinkSync(probe);
  } catch {
    failFolderBuild(
      `Cannot write to the data folder:\n${dataDir}\n\n` +
        "Move the Lucky Draw Studio folder to a writable location (e.g. Desktop, Documents or a USB " +
        "drive without write protection), then run it again." +
        (IS_MAC
          ? "\n\nOn a Mac, USB drives formatted as NTFS are read-only — use an exFAT-formatted drive."
          : "")
    );
  }
  return dataDir;
}

// Chặn mở 2 app đóng gói cùng lúc (2 process cùng ghi 1 file DB) — phải xin lock TRƯỚC khi mở DB,
// nên đặt ở đây thay vì main.ts (main.ts import db.ts trước mọi dòng code khác). Instance thứ 2 thoát
// luôn, instance đang chạy tự focus lại cửa sổ (xem "second-instance" trong main.ts). Chỉ áp dụng bản
// đóng gói — dev vẫn mở song song được như cũ.
if (app.isPackaged && !app.requestSingleInstanceLock()) {
  process.exit(0);
}

const dbDir = resolveDbDir();
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const dbPath = path.join(dbDir, "lucky-draw.db");
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

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

/**
 * Migration: chuyển từ mô hình cũ (participants/prizes dùng chung toàn app)
 * sang mô hình mới (mỗi session/tab sở hữu participants + prizes riêng, độc lập).
 * An toàn để chạy nhiều lần — chỉ thực hiện đúng 1 lần khi phát hiện schema cũ,
 * không làm mất dữ liệu đã nhập trước đó (tự gom vào 1 session mặc định).
 */
function migrateToPerSessionData() {
  const participantCols = db.prepare(`PRAGMA table_info(participants)`).all() as { name: string }[];
  const hasParticipantSession = participantCols.some((c) => c.name === "session_id");

  const prizeCols = db.prepare(`PRAGMA table_info(prizes)`).all() as { name: string }[];
  const hasPrizeSession = prizeCols.some((c) => c.name === "session_id");

  const sessionCols = db.prepare(`PRAGMA table_info(sessions)`).all() as { name: string }[];
  if (!sessionCols.some((c) => c.name === "landing_config")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN landing_config TEXT`);
  }
  if (!participantCols.some((c) => c.name === "extra_data")) {
    db.exec(`ALTER TABLE participants ADD COLUMN extra_data TEXT`);
  }

  if (hasParticipantSession && hasPrizeSession) return; // đã ở schema mới, không cần làm gì thêm

  const tx = db.transaction(() => {
    const defaultId = randomUUID();
    db.prepare(`INSERT INTO sessions (id, name, status) VALUES (?, ?, 'draft')`).run(
      defaultId,
      "Default session (legacy data)"
    );

    if (!hasParticipantSession) {
      // Tạo lại bảng thay vì chỉ ALTER, vì cần bỏ UNIQUE global trên "code" —
      // giờ mỗi session độc lập, 2 session khác nhau được phép trùng mã người chơi.
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

      // Nếu có bảng session_prizes cũ (many-to-many), dùng nó để gán prize về đúng session
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
          if (assigned.has(link.prize_id)) continue; // giải bị gán >1 session trước đây -> giữ session đầu tiên
          updatePrize.run(link.session_id, link.prize_id);
          assigned.add(link.prize_id);
        }
        db.exec(`DROP TABLE session_prizes`);
      }
      // Giải nào chưa có session_id (không có link cũ) -> gán vào session mặc định
      db.prepare(`UPDATE prizes SET session_id = ? WHERE session_id IS NULL`).run(defaultId);
    }
  });
  tx();
}

migrateToPerSessionData();

/**
 * Migration: thêm các cột thiết kế giải thưởng mới vào DB cũ đã tồn tại trước đó
 * (code, category, status, 2 cờ trùng lặp, max_win_count, display_image).
 * An toàn khi chạy nhiều lần — chỉ ALTER cột nào thực sự chưa có, giữ nguyên
 * quantity/remaining/weight đang có sẵn.
 */
function migratePrizeFields() {
  const cols = (db.prepare(`PRAGMA table_info(prizes)`).all() as { name: string }[]).map((c) => c.name);
  const addIfMissing = (name: string, ddl: string) => {
    if (!cols.includes(name)) db.exec(`ALTER TABLE prizes ADD COLUMN ${ddl}`);
  };
  addIfMissing("code", "code TEXT");
  addIfMissing("category", "category TEXT");
  addIfMissing("status", "status TEXT NOT NULL DEFAULT 'active'");
  addIfMissing("allow_duplicate_with_other_prizes", "allow_duplicate_with_other_prizes INTEGER NOT NULL DEFAULT 1");
  addIfMissing("allow_duplicate_with_same_prize", "allow_duplicate_with_same_prize INTEGER NOT NULL DEFAULT 0");
  addIfMissing("max_win_count", "max_win_count INTEGER NOT NULL DEFAULT 1");
  addIfMissing("display_image", "display_image TEXT");
}

migratePrizeFields();

/**
 * Migration: thêm sort_order cho participants (phục vụ kéo-thả sắp xếp dòng trong Data Editor).
 * Backfill theo thứ tự đang hiển thị hiện tại (created_at DESC) để không gây xáo trộn bất ngờ
 * cho dữ liệu đã có sẵn trước khi tính năng này tồn tại.
 */
function migrateParticipantSortOrder() {
  const cols = (db.prepare(`PRAGMA table_info(participants)`).all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("sort_order")) {
    db.exec(`ALTER TABLE participants ADD COLUMN sort_order INTEGER`);
  }
  const needsBackfill = db
    .prepare(`SELECT COUNT(*) as cnt FROM participants WHERE sort_order IS NULL`)
    .get() as { cnt: number };
  if (needsBackfill.cnt > 0) {
    const rows = db.prepare(`SELECT id FROM participants ORDER BY created_at DESC`).all() as { id: string }[];
    const update = db.prepare(`UPDATE participants SET sort_order = ? WHERE id = ?`);
    const tx = db.transaction(() => {
      rows.forEach((r, i) => update.run(i, r.id));
    });
    tx();
  }
}

migrateParticipantSortOrder();

/**
 * Migration: thêm participant_column_types vào sessions — lưu mapping "cột nào thuộc loại
 * dữ liệu chuẩn hoá nào" (vd cột lạ "Số ĐT liên hệ" được gán type "phone" để Validate/Clean
 * áp đúng quy tắc). JSON dạng { [tênCột]: "phone" | "name" | "email" | "text" ... }.
 */
function migrateSessionColumnTypes() {
  const cols = (db.prepare(`PRAGMA table_info(sessions)`).all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("participant_column_types")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN participant_column_types TEXT`);
  }
}

migrateSessionColumnTypes();

/**
 * Migration: thêm participant_duplicate_columns vào sessions — danh sách cột (tên) dùng để
 * xác định trùng lặp trong Data Editor. JSON dạng string[]. Nhiều cột nghĩa là phải trùng
 * TẤT CẢ các cột đó cùng lúc mới tính là trùng (compound key), thay cho quy tắc cũ mặc định
 * luôn tính trùng theo SĐT.
 */
function migrateSessionDuplicateColumns() {
  const cols = (db.prepare(`PRAGMA table_info(sessions)`).all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("participant_duplicate_columns")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN participant_duplicate_columns TEXT`);
  }
}

migrateSessionDuplicateColumns();

/**
 * Migration: thêm participant_column_labels vào sessions — nhãn HIỂN THỊ tùy biến cho từng cột trong
 * Data Editor (JSON dạng { [tênCột]: "Nhãn" }). Với cột lõi name/phone/code/email đây chỉ là nhãn,
 * dữ liệu vẫn nằm ở cột SQL tương ứng. An toàn khi chạy nhiều lần — chỉ ADD COLUMN khi chưa có,
 * không đụng dữ liệu cũ (session cũ = NULL = dùng nhãn mặc định).
 */
function migrateSessionColumnLabels() {
  const cols = (db.prepare(`PRAGMA table_info(sessions)`).all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("participant_column_labels")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN participant_column_labels TEXT`);
  }
}

migrateSessionColumnLabels();

/**
 * Migration: thêm confirmed vào draw_results — trước đây bảng này CHỈ chứa lượt đã Confirm (ghi lúc
 * commitDraw), lượt bị Redo bỏ qua không để lại dấu vết gì. Giờ mỗi lần pickWinner() cho Landing Page
 * (draw:pick) đều ghi ngay 1 dòng confirmed = 0, rồi commitDraw() chỉ UPDATE lên confirmed = 1 — nhờ
 * vậy Dashboard có đủ lịch sử "đã quay nhưng không Confirm" (xem drawEngine.ts, docs/architecture/
 * draw-engine.md). DEFAULT 1 cho dữ liệu cũ vì mọi dòng có sẵn trước migration này chắc chắn đã từng
 * đi qua commitDraw (luồng cũ không có cách nào ghi dòng chưa confirm).
 */
function migrateDrawResultsConfirmed() {
  const cols = (db.prepare(`PRAGMA table_info(draw_results)`).all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("confirmed")) {
    db.exec(`ALTER TABLE draw_results ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 1`);
  }
}

migrateDrawResultsConfirmed();

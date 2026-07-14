import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { app } from "electron";

const userDataPath = app.getPath("userData");
if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });

const dbPath = path.join(userDataPath, "lucky-draw.db");
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
  rng_seed TEXT
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
      "Phiên mặc định (dữ liệu cũ)"
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

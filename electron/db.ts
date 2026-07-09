import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { app } from "electron";

const userDataPath = app.getPath("userData");
if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });

const dbPath = path.join(userDataPath, "lucky-draw.db");
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  source TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prizes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  remaining INTEGER NOT NULL DEFAULT 1,
  weight REAL NOT NULL DEFAULT 1,
  image_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  allow_duplicate_prize INTEGER NOT NULL DEFAULT 0,
  exclude_previous_winners INTEGER NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_prizes (
  session_id TEXT NOT NULL,
  prize_id TEXT NOT NULL,
  PRIMARY KEY (session_id, prize_id)
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

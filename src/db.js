const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'ranktracker.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      email                 TEXT    NOT NULL UNIQUE,
      password              TEXT    NOT NULL,
      tier                  TEXT    NOT NULL DEFAULT 'free',
      stripe_customer_id    TEXT,
      stripe_subscription_id TEXT,
      subscription_status   TEXT,
      last_batch_check      TEXT,
      created_at            TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      name        TEXT    NOT NULL,
      domain      TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS keywords (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL,
      keyword     TEXT    NOT NULL,
      search_engine TEXT  NOT NULL DEFAULT 'google',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rank_checks (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword_id      INTEGER NOT NULL,
      position        INTEGER,
      checked_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      search_engine   TEXT    NOT NULL DEFAULT 'google',
      FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword_id      INTEGER NOT NULL,
      project_id      INTEGER NOT NULL,
      previous_pos    INTEGER,
      current_pos     INTEGER,
      change_amount   INTEGER NOT NULL,
      direction       TEXT    NOT NULL CHECK(direction IN ('up', 'down')),
      message         TEXT    NOT NULL,
      triggered_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      acknowledged    INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);
// Migrations for columns added after initial schema
  const migrations = [
    "ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'free'",
    "ALTER TABLE users ADD COLUMN stripe_customer_id TEXT",
    "ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT",
    "ALTER TABLE users ADD COLUMN subscription_status TEXT",
    "ALTER TABLE users ADD COLUMN last_batch_check TEXT",
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch (e) { /* column already exists */ }
  }
}

module.exports = { getDb };
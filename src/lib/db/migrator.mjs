// SQLite schema migrations for the planner (plain ESM so the host CLI
// `scripts/db.mjs` and the app share one implementation).
//
// - Migrations are db/migrations/NNNN_name.sql, applied in order, each in
//   its own transaction, recorded in schema_migrations with a SHA-256.
// - An applied migration whose file changed is a hard error (drift).
// - Nothing is applied implicitly in production: deploys run
//   `node scripts/db.mjs migrate` after a backup (E:DEN release rules).
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import Database from "better-sqlite3";

const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;

/** Opens (optionally creating) a database with the planner's connection settings. */
export function openDatabase(path, { create = false } = {}) {
  if (create && path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o750 });
  const db = new Database(path, { fileMustExist: !create && path !== ":memory:" });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  return db;
}

export function listMigrations(directory) {
  return readdirSync(directory)
    .filter((file) => FILE_PATTERN.test(file))
    .sort()
    .map((file) => {
      const [, version, name] = FILE_PATTERN.exec(file);
      const sql = readFileSync(join(directory, file), "utf8");
      return { version: Number(version), name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
    });
}

function ensureTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
}

/** Current schema version (0 when nothing is applied). Read-only. */
export function schemaVersion(db) {
  const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
  if (!table) return 0;
  return db.prepare("SELECT coalesce(max(version), 0) AS version FROM schema_migrations").get().version;
}

/** Applies pending migrations; returns the versions applied now. */
export function applyMigrations(db, directory) {
  ensureTable(db);
  const applied = new Map(db.prepare("SELECT version, checksum FROM schema_migrations").all().map((r) => [r.version, r.checksum]));
  const migrations = listMigrations(directory);
  for (const migration of migrations) {
    const recorded = applied.get(migration.version);
    if (recorded && recorded !== migration.checksum) {
      throw new Error(`Migration ${migration.version}_${migration.name} was modified after being applied`);
    }
  }
  const done = [];
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)").run(
        migration.version,
        migration.name,
        migration.checksum,
        new Date().toISOString(),
      );
    })();
    done.push(migration.version);
  }
  return done;
}

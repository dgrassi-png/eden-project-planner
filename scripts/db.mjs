#!/usr/bin/env node
// E:DEN Planner database CLI (run on the host, outside the Next.js process).
//
//   node scripts/db.mjs migrate --database /var/lib/eden/planner-production/planner.sqlite3 [--create]
//   node scripts/db.mjs status  --database <path>
//   node scripts/db.mjs backup  --database <path> --destination /var/backups/eden --product planner-production --retention-days 7
//
// `backup` produces the same layout and manifest as the E:DEN
// ops/backup/backup_sqlite.py (online backup, quick_check, gzip -9, SHA-256,
// 0600 files / 0700 dirs, atomic publish, retention). Once the planner lives in
// the monorepo, that script can be used directly by adding "planner" to its
// --product choices.
import { createHash } from "node:crypto";
import { chmodSync, createReadStream, createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";

import Database from "better-sqlite3";

import { applyMigrations, listMigrations, openDatabase, schemaVersion } from "../src/lib/db/migrator.mjs";

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const STAMP = /^\d{8}T\d{6}Z$/;

function fail(message) {
  console.error(`db: ERROR: ${message}`);
  process.exit(1);
}

function option(name, { required = false } = {}) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index > 0 ? process.argv[index + 1] : undefined;
  if (required && !value) fail(`--${name} is required`);
  return value;
}

function databasePath() {
  const path = option("database", { required: true });
  if (!isAbsolute(path)) fail("--database must be an absolute path");
  return path;
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function migrate() {
  const path = databasePath();
  const create = process.argv.includes("--create");
  if (!create && !existsSync(path)) fail(`${path} does not exist (pass --create for a new database)`);
  const db = openDatabase(path, { create });
  const applied = applyMigrations(db, MIGRATIONS);
  console.log(applied.length ? `applied migrations: ${applied.join(", ")}` : "schema up to date");
  console.log(`schema version: ${schemaVersion(db)}`);
  const check = db.pragma("quick_check", { simple: true });
  db.close();
  if (check !== "ok") fail(`quick_check failed: ${check}`);
}

function status() {
  const path = databasePath();
  if (!existsSync(path)) fail(`${path} does not exist`);
  const db = new Database(path, { readonly: true, fileMustExist: true });
  const current = schemaVersion(db);
  const latest = listMigrations(MIGRATIONS).at(-1)?.version ?? 0;
  db.close();
  console.log(JSON.stringify({ schema_version: current, latest_migration: latest, up_to_date: current >= latest }));
  if (current < latest) process.exit(2);
}

async function backup() {
  const source = databasePath();
  if (!existsSync(source)) fail(`${source} does not exist`);
  const destination = option("destination", { required: true });
  const product = option("product", { required: true });
  const retentionDays = Number(option("retention-days", { required: true }));
  if (!isAbsolute(destination)) fail("--destination must be an absolute path");
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(product)) fail("--product must be lowercase letters, digits and hyphens");
  if (!Number.isInteger(retentionDays) || retentionDays < 1) fail("--retention-days must be positive");

  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const productRoot = join(destination, product);
  mkdirSync(productRoot, { recursive: true, mode: 0o700 });
  chmodSync(productRoot, 0o700);
  const finalDir = join(productRoot, stamp);
  if (existsSync(finalDir)) fail(`backup destination already exists: ${finalDir}`);

  const temporary = mkdtempSync(join(productRoot, ".backup-"));
  try {
    const database = join(temporary, `${product}.sqlite3`);
    const archive = `${database}.gz`;
    const reader = new Database(source, { readonly: true, fileMustExist: true });
    await reader.backup(database);
    reader.close();
    // The copy inherits WAL mode; switch it to a single self-contained file.
    const copy = new Database(database);
    copy.pragma("journal_mode = DELETE");
    const integrity = copy.pragma("quick_check", { simple: true });
    copy.close();
    if (integrity !== "ok") fail(`backup integrity check failed: ${integrity}`);
    await pipeline(createReadStream(database), createGzip({ level: 9 }), createWriteStream(archive));
    const [y, m, d] = [now.getUTCFullYear(), String(now.getUTCMonth() + 1).padStart(2, "0"), String(now.getUTCDate()).padStart(2, "0")];
    const manifest = {
      schema_version: 1,
      product,
      created_at: now.toISOString(),
      source_filename: basename(source),
      database: { filename: basename(database), size_bytes: statSync(database).size, sha256: await sha256(database), integrity_check: integrity },
      archive: { filename: basename(archive), size_bytes: statSync(archive).size, sha256: await sha256(archive), content_encoding: "gzip" },
      retention_days: retentionDays,
      s3_ready_key_prefix: `sqlite/${product}/${y}/${m}/${d}/${stamp}`,
    };
    writeFileSync(join(temporary, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    unlinkSync(database);
    for (const file of readdirSync(temporary)) chmodSync(join(temporary, file), 0o600);
    renameSync(temporary, finalDir);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }

  const cutoff = now.getTime() - retentionDays * 86_400_000;
  for (const candidate of readdirSync(productRoot)) {
    if (!STAMP.test(candidate)) continue;
    const created = Date.parse(`${candidate.slice(0, 4)}-${candidate.slice(4, 6)}-${candidate.slice(6, 8)}T${candidate.slice(9, 11)}:${candidate.slice(11, 13)}:${candidate.slice(13, 15)}Z`);
    if (created < cutoff) rmSync(join(productRoot, candidate), { recursive: true, force: true });
  }
  console.log(finalDir);
}

const command = process.argv[2];
if (command === "migrate") migrate();
else if (command === "status") status();
else if (command === "backup") await backup();
else fail("usage: db.mjs migrate|status|backup --database <absolute path> [...]");

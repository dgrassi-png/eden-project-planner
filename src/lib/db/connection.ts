import "server-only";

import { join } from "node:path";

import type BetterSqlite3 from "better-sqlite3";

import { resolveDatabaseConfig } from "@/config/database";
import { getServerEnv } from "@/config/env.server";
import { PlanningError } from "@/lib/planning/errors";
import { EXPECTED_SCHEMA_VERSION } from "@/lib/planning/schemaVersion";

import { applyMigrations, openDatabase, schemaVersion } from "./migrator.mjs";

const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

let cached: { path: string; db: BetterSqlite3.Database } | undefined;

/**
 * Process-wide connection to the planner database (one Next.js process per
 * environment). Refuses to serve a database whose schema is behind this
 * release. Throws PlanningError("unavailable") with an actionable message.
 */
export function getDatabase(): BetterSqlite3.Database {
  const config = resolveDatabaseConfig(getServerEnv(), process.env.NODE_ENV, process.cwd());
  if (!config.ok) throw new PlanningError("unavailable", config.problem);
  if (cached?.path === config.path) return cached.db;

  let db: BetterSqlite3.Database;
  try {
    db = openDatabase(config.path, { create: config.autoMigrate });
    if (config.autoMigrate) applyMigrations(db, MIGRATIONS_DIR);
  } catch (error) {
    if (error instanceof Error && /directory does not exist|unable to open/i.test(error.message)) {
      throw new PlanningError("unavailable", "Planning database not found. Run the migrations (scripts/db.mjs migrate).");
    }
    throw new PlanningError("unavailable", "Planning database could not be opened.");
  }
  const version = schemaVersion(db);
  if (version < EXPECTED_SCHEMA_VERSION) {
    db.close();
    throw new PlanningError(
      "unavailable",
      `Planning database schema is at version ${version}, this release needs ${EXPECTED_SCHEMA_VERSION}. Run the migrations.`,
    );
  }
  cached = { path: config.path, db };
  return db;
}

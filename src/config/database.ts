import { isAbsolute, join } from "node:path";

import type { ServerEnv } from "./env.schema";

/**
 * Where the planner's SQLite database lives. Pure, so it can be tested.
 *
 * - production: PLANNER_DATABASE_PATH must be an absolute path; migrations
 *   are never applied implicitly (deploys run `scripts/db.mjs migrate` after a
 *   backup, per the E:DEN release rules).
 * - development: defaults to `<cwd>/.data/planner.sqlite3`, created and
 *   migrated automatically so `npm run dev` works offline.
 */
export type DatabaseConfig = { ok: true; path: string; autoMigrate: boolean } | { ok: false; problem: string };

export function resolveDatabaseConfig(env: ServerEnv, nodeEnv: string | undefined, cwd: string): DatabaseConfig {
  const production = nodeEnv === "production";
  const configured = env.PLANNER_DATABASE_PATH;
  if (!configured) {
    return production
      ? { ok: false, problem: "PLANNER_DATABASE_PATH is required in production" }
      : { ok: true, path: join(cwd, ".data", "planner.sqlite3"), autoMigrate: true };
  }
  if (!isAbsolute(configured)) return { ok: false, problem: "PLANNER_DATABASE_PATH must be an absolute path" };
  return { ok: true, path: configured, autoMigrate: !production };
}

import { describe, expect, it } from "vitest";

import { resolveDatabaseConfig } from "./database";
import { parseServerEnv } from "./env.schema";

describe("resolveDatabaseConfig", () => {
  it("uses a local file with auto-migration in development", () => {
    expect(resolveDatabaseConfig(parseServerEnv({}), "development", "/work")).toEqual({
      ok: true,
      path: "/work/.data/planner.sqlite3",
      autoMigrate: true,
    });
  });

  it("requires an explicit absolute path in production and never auto-migrates", () => {
    expect(resolveDatabaseConfig(parseServerEnv({}), "production", "/work").ok).toBe(false);
    expect(resolveDatabaseConfig(parseServerEnv({ PLANNER_DATABASE_PATH: "data/planner.sqlite3" }), "production", "/work").ok).toBe(false);
    expect(
      resolveDatabaseConfig(parseServerEnv({ PLANNER_DATABASE_PATH: "/var/lib/eden/planner-production/planner.sqlite3" }), "production", "/work"),
    ).toEqual({ ok: true, path: "/var/lib/eden/planner-production/planner.sqlite3", autoMigrate: false });
  });
});

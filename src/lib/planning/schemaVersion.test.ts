import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { listMigrations } from "@/lib/db/migrator.mjs";

import { EXPECTED_SCHEMA_VERSION } from "./schemaVersion";

describe("EXPECTED_SCHEMA_VERSION", () => {
  it("matches the latest migration file", () => {
    const migrations = listMigrations(fileURLToPath(new URL("../../../db/migrations", import.meta.url)));
    expect(migrations.at(-1)?.version).toBe(EXPECTED_SCHEMA_VERSION);
    expect(migrations.map((m) => m.version)).toEqual(migrations.map((_, i) => i + 1));
  });
});

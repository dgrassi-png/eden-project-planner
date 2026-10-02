import { fileURLToPath } from "node:url";

import type BetterSqlite3 from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { applyMigrations, listMigrations, openDatabase, schemaVersion } from "./migrator.mjs";

const MIGRATIONS = fileURLToPath(new URL("../../../db/migrations", import.meta.url));
const NOW = "2026-09-30T08:00:00.000Z";

let db: BetterSqlite3.Database;

function run(sql: string, ...params: unknown[]) {
  return db.prepare(sql).run(...params);
}

/** Asserts the statement fails with a trigger code ("CODE: …") or a SQLite constraint code. */
function expectRejected(fn: () => unknown, expected: string) {
  let error: unknown;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  expect(error, `expected ${expected}`).toBeDefined();
  const { code, message } = error as { code?: string; message: string };
  expect(message.startsWith(`${expected}:`) || code === expected).toBe(true);
}

const task = (id: string, code: string, extra: Record<string, unknown> = {}) => {
  const row = {
    id,
    project_id: "p1",
    workstream_id: "ws-tec",
    parent_task_id: null,
    eden_code: code,
    title: code,
    is_milestone: 0,
    planned_start: null,
    planned_duration_days: null,
    planned_finish: null,
    created_at: NOW,
    updated_at: NOW,
    ...extra,
  };
  const keys = Object.keys(row);
  return run(`INSERT INTO tasks (${keys.join(",")}) VALUES (${keys.map((k) => `@${k}`).join(",")})`, row);
};

beforeEach(() => {
  db = openDatabase(":memory:", { create: true });
  applyMigrations(db, MIGRATIONS);
  run("INSERT INTO projects (id, name, slug, created_at, updated_at) VALUES ('p1', 'Test', 'test', ?, ?)", NOW, NOW);
  run("INSERT INTO workstreams (id, project_id, code, name, created_at, updated_at) VALUES ('ws-tec', 'p1', 'TEC', 'Eng', ?, ?)", NOW, NOW);
  run("INSERT INTO workstreams (id, project_id, code, name, created_at, updated_at) VALUES ('ws-cert', 'p1', 'CERT', 'Cert', ?, ?)", NOW, NOW);
  task("t1", "TEC-001");
});

describe("migrations", () => {
  it("records versions and is idempotent", () => {
    expect(schemaVersion(db)).toBe(listMigrations(MIGRATIONS).at(-1)?.version);
    expect(applyMigrations(db, MIGRATIONS)).toEqual([]);
  });

  it("detects a modified applied migration", () => {
    run("UPDATE schema_migrations SET checksum = 'tampered' WHERE version = 1");
    expect(() => applyMigrations(db, MIGRATIONS)).toThrow(/modified after being applied/);
  });
});

describe("E:DEN codes and hierarchy", () => {
  it("keeps unvalidated planning values NULL", () => {
    expect(db.prepare("SELECT priority, geography, progress_percent, status FROM tasks WHERE id = 't1'").get()).toEqual({
      priority: null,
      geography: null,
      progress_percent: null,
      status: "BACKLOG",
    });
  });

  it.each(["tec-001", "TEC-01", "T-001", "TEC-001.0", "TEC-001.1.1", "TEC-001-2", "TOOLONGPREFIX-001", "TEC-0a1"])(
    "rejects malformed code %s",
    (code) => expectRejected(() => task("x", code), "SQLITE_CONSTRAINT_CHECK"),
  );

  it("rejects duplicates and mis-levelled codes", () => {
    expectRejected(() => task("x", "TEC-001"), "SQLITE_CONSTRAINT_UNIQUE");
    expectRejected(() => task("x", "TEC-002.1"), "SQLITE_CONSTRAINT_CHECK");
  });

  it("enforces subtask rules", () => {
    task("t1-1", "TEC-001.1", { parent_task_id: "t1" });
    expectRejected(() => task("x", "TEC-009.1", { parent_task_id: "t1" }), "EDEN_CODE_PARENT_PREFIX");
    expectRejected(() => task("x", "TEC-001.2", { parent_task_id: "t1", workstream_id: "ws-cert" }), "SUBTASK_WORKSTREAM_MISMATCH");
    expectRejected(() => task("x", "TEC-001.3", { parent_task_id: "t1-1" }), "HIERARCHY_TOO_DEEP");
    expectRejected(() => task("x", "TEC-001.4", { parent_task_id: "missing" }), "PARENT_NOT_FOUND");
  });

  it("makes codes, parent and project permanent; titles can change", () => {
    task("t1-1", "TEC-001.1", { parent_task_id: "t1" });
    run("UPDATE tasks SET title = 'Renamed' WHERE id = 't1'");
    expectRejected(() => run("UPDATE tasks SET eden_code = 'TEC-099' WHERE id = 't1'"), "EDEN_CODE_IMMUTABLE");
    expectRejected(() => run("UPDATE tasks SET parent_task_id = NULL WHERE id = 't1-1'"), "PARENT_IMMUTABLE");
    expectRejected(() => run("UPDATE workstreams SET code = 'ENG' WHERE id = 'ws-tec'"), "WORKSTREAM_CODE_IMMUTABLE");
    expectRejected(() => run("UPDATE tasks SET is_milestone = 1, planned_duration_days = 0 WHERE id = 't1'"), "MILESTONE_WITH_SUBTASKS");
  });

  it("moves subtasks with their parent", () => {
    task("t1-1", "TEC-001.1", { parent_task_id: "t1" });
    run("UPDATE tasks SET workstream_id = 'ws-cert', updated_at = ? WHERE id = 't1'", NOW);
    expect(db.prepare("SELECT workstream_id FROM tasks WHERE id = 't1-1'").get()).toEqual({ workstream_id: "ws-cert" });
    expectRejected(() => run("UPDATE tasks SET workstream_id = 'ws-tec' WHERE id = 't1-1'"), "SUBTASK_WORKSTREAM_MISMATCH");
  });

  it("blocks deleting a parent with subtasks or a workstream with tasks", () => {
    task("t1-1", "TEC-001.1", { parent_task_id: "t1" });
    expectRejected(() => run("DELETE FROM tasks WHERE id = 't1'"), "SQLITE_CONSTRAINT_FOREIGNKEY");
    expectRejected(() => run("DELETE FROM workstreams WHERE id = 'ws-tec'"), "SQLITE_CONSTRAINT_FOREIGNKEY");
  });
});

describe("scheduling invariants", () => {
  it("requires a derived, consistent finish on working days", () => {
    run("UPDATE tasks SET planned_start = '2026-10-05', planned_duration_days = 3, planned_finish = '2026-10-07' WHERE id = 't1'");
    expectRejected(() => run("UPDATE tasks SET planned_finish = NULL WHERE id = 't1'"), "SQLITE_CONSTRAINT_CHECK");
    expectRejected(() => run("UPDATE tasks SET planned_start = '2026-10-04' WHERE id = 't1'"), "SQLITE_CONSTRAINT_CHECK");
    expectRejected(() => run("UPDATE tasks SET planned_duration_days = 0 WHERE id = 't1'"), "SQLITE_CONSTRAINT_CHECK");
    expectRejected(() => run("UPDATE tasks SET planned_start = '2026-02-30' WHERE id = 't1'"), "SQLITE_CONSTRAINT_CHECK");
  });

  it("gives milestones zero duration and finish = start, any day", () => {
    task("m1", "CERT-003", { workstream_id: "ws-cert", is_milestone: 1, planned_duration_days: 0, planned_start: "2026-11-08", planned_finish: "2026-11-08" });
    expectRejected(() => run("UPDATE tasks SET planned_duration_days = 2 WHERE id = 'm1'"), "SQLITE_CONSTRAINT_CHECK");
    expectRejected(() => run("UPDATE tasks SET planned_finish = '2026-11-09' WHERE id = 'm1'"), "SQLITE_CONSTRAINT_CHECK");
    expectRejected(() => task("x", "CERT-003.1", { workstream_id: "ws-cert", parent_task_id: "m1" }), "MILESTONE_WITH_SUBTASKS");
  });
});

describe("dependencies", () => {
  beforeEach(() => {
    task("t1-1", "TEC-001.1", { parent_task_id: "t1" });
    task("t2", "TEC-002");
  });
  const dep = (id: string, pred: string, succ: string, lag = 0) =>
    run("INSERT INTO task_dependencies (id, project_id, predecessor_task_id, successor_task_id, lag_days, created_at) VALUES (?, 'p1', ?, ?, ?, ?)", id, pred, succ, lag, NOW);

  it("rejects self, duplicate, parent/child, negative lag and cross-project links", () => {
    dep("d1", "t1", "t2");
    expectRejected(() => dep("d2", "t1", "t1"), "SQLITE_CONSTRAINT_CHECK");
    expectRejected(() => dep("d3", "t1", "t2"), "SQLITE_CONSTRAINT_UNIQUE");
    expectRejected(() => dep("d4", "t1-1", "t1"), "DEPENDENCY_PARENT_CHILD");
    expectRejected(() => dep("d5", "t2", "t1-1", -1), "SQLITE_CONSTRAINT_CHECK");
    run("INSERT INTO projects (id, name, slug, created_at, updated_at) VALUES ('p2', 'Other', 'other', ?, ?)", NOW, NOW);
    expectRejected(
      () => run("INSERT INTO task_dependencies (id, project_id, predecessor_task_id, successor_task_id, created_at) VALUES ('d6', 'p2', 't1', 't2', ?)", NOW),
      "DEPENDENCY_PROJECT_MISMATCH",
    );
    expectRejected(() => run("UPDATE task_dependencies SET successor_task_id = 't1-1' WHERE id = 'd1'"), "DEPENDENCY_IMMUTABLE");
  });
});

describe("audit and project deletion", () => {
  it("keeps audit append-only and survives project deletion", () => {
    run("INSERT INTO audit_events (id, project_id, actor_type, action, entity_type, created_at) VALUES ('a1', 'p1', 'USER', 'CREATE', 'tasks', ?)", NOW);
    expectRejected(() => run("UPDATE audit_events SET actor_type = 'SYSTEM'"), "AUDIT_APPEND_ONLY");
    expectRejected(() => run("DELETE FROM audit_events"), "AUDIT_APPEND_ONLY");
    expectRejected(() => run("INSERT INTO audit_events (id, actor_type, action, entity_type, created_at) VALUES ('a2', 'ROBOT', 'CREATE', 'tasks', ?)", NOW), "SQLITE_CONSTRAINT_CHECK");

    run("DELETE FROM projects WHERE id = 'p1'");
    expect(db.prepare("SELECT count(*) AS n FROM tasks").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT count(*) AS n FROM audit_events").get()).toEqual({ n: 1 });
  });
});

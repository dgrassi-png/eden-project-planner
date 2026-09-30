import { fileURLToPath } from "node:url";

import type BetterSqlite3 from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import type { Task } from "@/domain/planning/types";
import { applyMigrations, openDatabase } from "@/lib/db/migrator.mjs";

import { PlanningService } from "./service";
import { createSqlitePlanningStore } from "./sqliteStore";

const MIGRATIONS = fileURLToPath(new URL("../../../db/migrations", import.meta.url));
let db: BetterSqlite3.Database;
let service: PlanningService;
let a: Task;
let b: Task;
let c: Task;

// 2026-10-05 is a Monday.
beforeEach(async () => {
  db = openDatabase(":memory:", { create: true });
  applyMigrations(db, MIGRATIONS);
  service = new PlanningService(createSqlitePlanningStore(db, { type: "USER", id: "eden_abc" }));
  const project = await service.createProject({ name: "P", slug: "p" });
  const ws = await service.createWorkstream(project.id, { code: "TEC", name: "Eng" });
  const make = (edenCode: string, plannedStart: string, plannedDurationDays: number) =>
    service.createTask(project.id, { edenCode, title: edenCode, workstreamId: ws.id, plannedStart, plannedDurationDays });
  a = await make("TEC-001", "2026-10-05", 5);
  b = await make("TEC-002", "2026-10-12", 5);
  c = await make("TEC-003", "2026-10-19", 2);
  await service.createDependency({ predecessorTaskId: a.id, successorTaskId: b.id });
  await service.createDependency({ predecessorTaskId: b.id, successorTaskId: c.id });
});

describe("dependency impact and cascade", () => {
  it("previews the conflict without saving anything", async () => {
    const preview = await service.previewTaskUpdate(a.id, { plannedStart: "2026-10-12" });
    expect(preview.messages).toEqual(["Moving TEC-001 creates a 5-day conflict with TEC-002."]);
    expect(preview.cascade.moves.map((m) => [m.edenCode, m.toStart])).toEqual([
      ["TEC-002", "2026-10-19"],
      ["TEC-003", "2026-10-26"],
    ]);
    expect((await service.getTask(a.id)).plannedStart).toBe("2026-10-05");
  });

  it("keeps the conflict when no cascade is confirmed: successors never move silently", async () => {
    await service.updateTask(a.id, { plannedStart: "2026-10-12" }, a.updatedAt);
    expect((await service.getTask(b.id)).plannedStart).toBe("2026-10-12");
    const violated = (await service.scheduleChecks(a.projectId)).filter((check) => check.state === "violated");
    expect(violated.map((v) => [v.predecessorCode, v.successorCode, v.conflictDays])).toEqual([["TEC-001", "TEC-002", 5]]);
  });

  it("applies the change and the confirmed cascade atomically, audited as a cascade", async () => {
    const preview = await service.previewTaskUpdate(a.id, { plannedStart: "2026-10-12" });
    const moves = preview.cascade.moves.map((m) => ({ taskId: m.taskId, toStart: m.toStart }));
    await service.updateTask(a.id, { plannedStart: "2026-10-12" }, a.updatedAt, { moves });
    expect((await service.getTask(b.id)).plannedFinish).toBe("2026-10-23");
    expect((await service.getTask(c.id)).plannedStart).toBe("2026-10-26");
    const audits = db
      .prepare("SELECT entity_id, metadata_json FROM audit_events WHERE action = 'UPDATE' ORDER BY rowid")
      .all() as { entity_id: string; metadata_json: string }[];
    expect(audits.map((row) => JSON.parse(row.metadata_json).cascade_from)).toEqual(["TEC-001", "TEC-001", "TEC-001"]);
  });

  it("refuses a cascade that no longer matches the preview", async () => {
    await expect(
      service.updateTask(a.id, { plannedStart: "2026-10-12" }, a.updatedAt, { moves: [{ taskId: b.id, toStart: "2026-10-19" }] }),
    ).rejects.toMatchObject({ kind: "conflict", issues: [{ code: "CASCADE_CHANGED" }] });
    expect((await service.getTask(a.id)).plannedStart).toBe("2026-10-05");
  });

  it("never moves DONE tasks", async () => {
    await service.updateTask(b.id, { status: "DONE" });
    const preview = await service.previewTaskUpdate(a.id, { plannedStart: "2026-10-12" });
    expect(preview.cascade.moves).toEqual([]);
    expect(preview.cascade.blocked.map((x) => [x.edenCode, x.status])).toEqual([["TEC-002", "DONE"]]);
  });

  it("resolves existing downstream conflicts on request", async () => {
    await service.updateTask(a.id, { plannedStart: "2026-10-12" });
    const plan = await service.previewCascade(a.id);
    await service.applyCascade(a.id, { moves: plan.moves.map((m) => ({ taskId: m.taskId, toStart: m.toStart })) });
    expect((await service.scheduleChecks(a.projectId)).every((check) => check.state === "ok")).toBe(true);
  });
});

import { fileURLToPath } from "node:url";

import type BetterSqlite3 from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { applyMigrations, openDatabase } from "@/lib/db/migrator.mjs";

import { PlanningError } from "./errors";
import { PlanningService } from "./service";
import { createSqlitePlanningStore } from "./sqliteStore";

const MIGRATIONS = fileURLToPath(new URL("../../../db/migrations", import.meta.url));
let db: BetterSqlite3.Database;
let service: PlanningService;

beforeEach(() => {
  db = openDatabase(":memory:", { create: true });
  applyMigrations(db, MIGRATIONS);
  service = new PlanningService(createSqlitePlanningStore(db, { type: "USER", id: "eden_abc" }));
});

const auditRows = () =>
  db.prepare("SELECT actor_type, actor_id, action, entity_type, metadata_json FROM audit_events ORDER BY rowid").all() as {
    actor_type: string;
    actor_id: string;
    action: string;
    entity_type: string;
    metadata_json: string;
  }[];

describe("SQLite store audit", () => {
  it("records every write with the actor, in the same transaction", async () => {
    const project = await service.createProject({ name: "P", slug: "p" });
    const ws = await service.createWorkstream(project.id, { code: "TEC", name: "Eng" });
    const task = await service.createTask(project.id, { edenCode: "TEC-001", title: "A", workstreamId: ws.id });
    await service.updateTask(task.id, { title: "B" });
    const rows = auditRows();
    expect(rows.map((r) => `${r.action} ${r.entity_type}`)).toEqual(["CREATE projects", "CREATE workstreams", "CREATE tasks", "UPDATE tasks"]);
    expect(rows.every((r) => r.actor_type === "USER" && r.actor_id === "eden_abc")).toBe(true);
    expect(JSON.parse(rows[3]?.metadata_json ?? "{}").changed_fields).toEqual(["title"]);
  });

  it("rolls back the change when the write fails, leaving no audit event", async () => {
    const project = await service.createProject({ name: "P", slug: "p" });
    const ws = await service.createWorkstream(project.id, { code: "TEC", name: "Eng" });
    const task = await service.createTask(project.id, { edenCode: "TEC-001", title: "A", workstreamId: ws.id });
    const before = auditRows().length;
    const store = createSqlitePlanningStore(db, { type: "USER", id: "eden_abc" });
    // Bypass the domain rules to hit a database guard directly.
    await expect(store.updateTask(task.id, { plannedStart: "2026-10-10", plannedDurationDays: 2, plannedFinish: "2026-10-13" })).rejects.toBeInstanceOf(PlanningError);
    expect(auditRows().length).toBe(before);
    expect((await service.getTask(task.id)).plannedStart).toBeNull();
  });

  it("audits subtasks moved with their parent and dependencies removed with a task", async () => {
    const project = await service.createProject({ name: "P", slug: "p" });
    const tec = await service.createWorkstream(project.id, { code: "TEC", name: "Eng" });
    const cert = await service.createWorkstream(project.id, { code: "CERT", name: "Cert" });
    const parent = await service.createTask(project.id, { edenCode: "TEC-001", title: "A", workstreamId: tec.id });
    const child = await service.createTask(project.id, { edenCode: "TEC-001.1", title: "a", parentTaskId: parent.id });
    const other = await service.createTask(project.id, { edenCode: "TEC-002", title: "B", workstreamId: tec.id });
    await service.createDependency({ predecessorTaskId: other.id, successorTaskId: child.id });
    await service.updateTask(parent.id, { workstreamId: cert.id });
    expect((await service.getTask(child.id)).workstreamId).toBe(cert.id);
    await service.deleteTask(other.id);
    const tail = auditRows().slice(-4).map((r) => `${r.action} ${r.entity_type}`);
    expect(tail).toEqual(["UPDATE tasks", "UPDATE tasks", "DELETE task_dependencies", "DELETE tasks"]);
  });

  it("rejects cycles inside the write transaction even without domain pre-checks", async () => {
    const project = await service.createProject({ name: "P", slug: "p" });
    const ws = await service.createWorkstream(project.id, { code: "TEC", name: "Eng" });
    const a = await service.createTask(project.id, { edenCode: "TEC-001", title: "A", workstreamId: ws.id });
    const b = await service.createTask(project.id, { edenCode: "TEC-002", title: "B", workstreamId: ws.id });
    const store = createSqlitePlanningStore(db, { type: "USER", id: "eden_abc" });
    await store.createDependency(project.id, { predecessorTaskId: a.id, successorTaskId: b.id, lagDays: 0 });
    await expect(store.createDependency(project.id, { predecessorTaskId: b.id, successorTaskId: a.id, lagDays: 0 })).rejects.toMatchObject({
      issues: [{ code: "DEPENDENCY_CYCLE" }],
    });
  });

  it("detects stale edits with the stored version", async () => {
    const project = await service.createProject({ name: "P", slug: "p" });
    const ws = await service.createWorkstream(project.id, { code: "TEC", name: "Eng" });
    const task = await service.createTask(project.id, { edenCode: "TEC-001", title: "A", workstreamId: ws.id });
    await service.updateTask(task.id, { title: "B" });
    await expect(service.updateTask(task.id, { title: "C" }, task.updatedAt)).rejects.toMatchObject({ kind: "conflict" });
  });
});

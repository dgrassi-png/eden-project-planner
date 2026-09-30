import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it } from "vitest";

import type { Project, Workstream } from "@/domain/planning/types";
import { applyMigrations, openDatabase } from "@/lib/db/migrator.mjs";

import { PlanningError } from "./errors";
import { createMemoryPlanningStore } from "./memoryStore";
import { PlanningService } from "./service";
import { createSqlitePlanningStore } from "./sqliteStore";
import type { PlanningStore } from "./store";

const MIGRATIONS = fileURLToPath(new URL("../../../db/migrations", import.meta.url));

/** The same scenarios run against the in-memory store and the real SQLite store. */
const STORES: [string, () => { store: PlanningStore; tick: () => void }][] = [
  ["memory", () => {
    const memory = createMemoryPlanningStore();
    return { store: memory, tick: memory.clock.tick };
  }],
  ["sqlite", () => {
    const db = openDatabase(":memory:", { create: true });
    applyMigrations(db, MIGRATIONS);
    return { store: createSqlitePlanningStore(db, { type: "USER", id: "eden_test" }), tick: () => undefined };
  }],
];

describe.each(STORES)("PlanningService on %s store", (_name, makeStore) => {
let store: { tick: () => void };
let service: PlanningService;
let project: Project;
let tec: Workstream;
let cert: Workstream;

async function rejection(promise: Promise<unknown>): Promise<PlanningError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PlanningError) return error;
    throw error;
  }
  throw new Error("expected rejection");
}

beforeEach(async () => {
  const made = makeStore();
  store = { tick: made.tick };
  service = new PlanningService(made.store);
  project = await service.createProject({ name: "Test project", slug: "test" });
  tec = await service.createWorkstream(project.id, { code: "tec", name: "Engineering", sortOrder: 1 });
  cert = await service.createWorkstream(project.id, { code: "CERT", name: "Certification", sortOrder: 2 });
});

describe("PlanningService tasks", () => {
  it("creates unscheduled tasks and derives finish when scheduled", async () => {
    const task = await service.createTask(project.id, { edenCode: "TEC-001", title: "Controller", workstreamId: tec.id });
    expect(task).toMatchObject({ plannedStart: null, plannedFinish: null, priority: null, ownerMemberId: null });

    store.tick();
    const scheduled = await service.updateTask(task.id, { plannedStart: "2026-10-09", plannedDurationDays: 3 });
    expect(scheduled.plannedFinish).toBe("2026-10-13");
    expect(scheduled.edenCode).toBe("TEC-001");
  });

  it("keeps the E:DEN code when the title changes", async () => {
    const task = await service.createTask(project.id, { edenCode: "TEC-001", title: "Old", workstreamId: tec.id });
    const renamed = await service.updateTask(task.id, { title: "New title" });
    expect([renamed.edenCode, renamed.title]).toEqual(["TEC-001", "New title"]);
  });

  it("rejects duplicate codes with a readable validation error", async () => {
    await service.createTask(project.id, { edenCode: "TEC-001", title: "a", workstreamId: tec.id });
    const error = await rejection(service.createTask(project.id, { edenCode: "TEC-001", title: "b", workstreamId: tec.id }));
    expect(error.kind).toBe("validation");
    expect(error.issues[0]?.code).toBe("EDEN_CODE_TAKEN");
  });

  it("detects stale edits", async () => {
    const task = await service.createTask(project.id, { edenCode: "TEC-001", title: "a", workstreamId: tec.id });
    const loadedVersion = task.updatedAt;
    store.tick();
    await service.updateTask(task.id, { title: "someone else" });
    const error = await rejection(service.updateTask(task.id, { title: "mine" }, loadedVersion));
    expect(error.kind).toBe("conflict");
    expect(error.issues[0]?.code).toBe("STALE_EDIT");
  });

  it("moves subtasks with their parent and blocks deleting a parent with subtasks", async () => {
    const parent = await service.createTask(project.id, { edenCode: "TEC-001", title: "p", workstreamId: tec.id });
    const child = await service.createTask(project.id, { edenCode: "TEC-001.1", title: "c", parentTaskId: parent.id });
    expect(child.workstreamId).toBe(tec.id);

    await service.updateTask(parent.id, { workstreamId: cert.id });
    expect((await service.getTask(child.id)).workstreamId).toBe(cert.id);

    expect((await rejection(service.deleteTask(parent.id))).issues[0]?.code).toBe("TASK_HAS_SUBTASKS");
    await service.deleteTask(child.id);
    await service.deleteTask(parent.id);
    expect(await service.listTasks(project.id)).toEqual([]);
  });

  it("validates owners against project members", async () => {
    const member = await service.createMember(project.id, { displayName: "Owner Person" });
    const task = await service.createTask(project.id, { edenCode: "TEC-001", title: "a", workstreamId: tec.id, ownerMemberId: member.id });
    expect(task.ownerMemberId).toBe(member.id);
    const error = await rejection(service.updateTask(task.id, { ownerMemberId: "00000000-0000-0000-0000-000000000000" }));
    expect(error.issues[0]?.code).toBe("OWNER_NOT_FOUND");
  });

  it("returns not_found for unknown ids", async () => {
    expect((await rejection(service.getTask("missing"))).kind).toBe("not_found");
    expect((await rejection(service.getSnapshot("missing"))).kind).toBe("not_found");
  });
});

describe("PlanningService dependencies", () => {
  it("creates Finish-to-Start links and rejects cycles", async () => {
    const a = await service.createTask(project.id, { edenCode: "TEC-001", title: "a", workstreamId: tec.id });
    const b = await service.createTask(project.id, { edenCode: "TEC-002", title: "b", workstreamId: tec.id });
    const c = await service.createTask(project.id, { edenCode: "CERT-001", title: "c", workstreamId: cert.id });

    const ab = await service.createDependency({ predecessorTaskId: a.id, successorTaskId: b.id });
    await service.createDependency({ predecessorTaskId: b.id, successorTaskId: c.id, lagDays: 2 });
    expect(ab.lagDays).toBe(0);

    const cycle = await rejection(service.createDependency({ predecessorTaskId: c.id, successorTaskId: a.id }));
    expect(cycle.issues[0]?.code).toBe("DEPENDENCY_CYCLE");
    expect((await rejection(service.createDependency({ predecessorTaskId: a.id, successorTaskId: b.id }))).issues[0]?.code).toBe(
      "DEPENDENCY_DUPLICATE",
    );

    expect((await service.updateDependency(ab.id, { lagDays: 3 })).lagDays).toBe(3);
    expect((await rejection(service.updateDependency(ab.id, { lagDays: -1 }))).issues[0]?.code).toBe("LAG_RANGE");

    await service.deleteDependency(ab.id);
    expect((await service.getSnapshot(project.id)).dependencies).toHaveLength(1);
  });

  it("rejects links to tasks in another project", async () => {
    const other = await service.createProject({ name: "Other", slug: "other" });
    const otherWs = await service.createWorkstream(other.id, { code: "GOV", name: "Gov" });
    const a = await service.createTask(project.id, { edenCode: "TEC-001", title: "a", workstreamId: tec.id });
    const x = await service.createTask(other.id, { edenCode: "GOV-001", title: "x", workstreamId: otherWs.id });
    const error = await rejection(service.createDependency({ predecessorTaskId: a.id, successorTaskId: x.id }));
    expect(error.issues[0]?.code).toBe("SUCCESSOR_NOT_FOUND");
  });
});

describe("PlanningService workstreams", () => {
  it("normalises codes, renames, and blocks deleting non-empty workstreams", async () => {
    expect(tec.code).toBe("TEC");
    expect((await service.updateWorkstream(tec.id, { name: "Product engineering" })).name).toBe("Product engineering");
    await service.createTask(project.id, { edenCode: "TEC-001", title: "a", workstreamId: tec.id });
    expect((await rejection(service.deleteWorkstream(tec.id))).issues[0]?.code).toBe("WORKSTREAM_HAS_TASKS");
    await service.deleteWorkstream(cert.id);
    expect((await service.listWorkstreams(project.id)).map((w) => w.code)).toEqual(["TEC"]);
  });

  it("returns a snapshot of the whole project", async () => {
    await service.createTask(project.id, { edenCode: "TEC-001", title: "a", workstreamId: tec.id });
    const snapshot = await service.getSnapshot(project.id);
    expect(snapshot.project.id).toBe(project.id);
    expect(snapshot.workstreams).toHaveLength(2);
    expect(snapshot.tasks).toHaveLength(1);
  });
});
});

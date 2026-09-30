import { fileURLToPath } from "node:url";

import type BetterSqlite3 from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import type { Member, Project, Task, Workstream } from "@/domain/planning/types";
import { applyMigrations, openDatabase } from "@/lib/db/migrator.mjs";
import { PlanningService } from "@/lib/planning/service";
import { createSqlitePlanningStore } from "@/lib/planning/sqliteStore";

import { createFakeTrello } from "./fakeTrello";
import { TrelloSyncService } from "./syncService";

const MIGRATIONS = fileURLToPath(new URL("../../../db/migrations", import.meta.url));
const id = (n: number) => n.toString(16).padStart(24, "a");
const LISTS = { backlog: id(1), ready: id(2), doing: id(3), blocked: id(4), done: id(5) };

let db: BetterSqlite3.Database;
let planning: PlanningService;
let trello: ReturnType<typeof createFakeTrello>;
let sync: TrelloSyncService;
let project: Project;
let ws: Workstream;
let owner: Member;
let task: Task;

beforeEach(async () => {
  db = openDatabase(":memory:", { create: true });
  applyMigrations(db, MIGRATIONS);
  planning = new PlanningService(createSqlitePlanningStore(db, { type: "USER", id: "eden_u1" }));
  trello = createFakeTrello({
    id: id(100),
    name: "E:DEN",
    lists: Object.entries(LISTS).map(([name, listId]) => ({ id: listId, name })),
    labels: [{ id: id(200), name: "TEC", color: "blue" }],
    members: [{ id: id(300), fullName: "Person A", username: "persona" }],
  });
  sync = new TrelloSyncService(createSqlitePlanningStore(db, { type: "TRELLO_SYNC", id: "eden_u1" }), trello.api, "9n93W4ym");
  project = await planning.createProject({ name: "P", slug: "p" });
  ws = await planning.createWorkstream(project.id, { code: "TEC", name: "Engineering" });
  owner = await planning.createMember(project.id, { displayName: "Person A" });
  task = await planning.createTask(project.id, {
    edenCode: "TEC-001",
    title: "Controller",
    workstreamId: ws.id,
    ownerMemberId: owner.id,
    plannedStart: "2026-10-05",
    plannedDurationDays: 5,
  });
  await planning.createTask(project.id, { edenCode: "TEC-001.1", title: "Wiring", parentTaskId: task.id, status: "DONE" });
  await sync.saveSettings(project.id, {
    subtaskMode: "CHECKLIST",
    statusLists: { BACKLOG: LISTS.backlog, READY: LISTS.ready, IN_PROGRESS: LISTS.doing, DONE: LISTS.done },
    workstreamLabels: { [ws.id]: id(200) },
  });
});

const confirm = (plan: Awaited<ReturnType<TrelloSyncService["preview"]>>) => ({
  items: plan.items.map((i) => ({ taskId: i.taskId, action: i.action })),
});

async function runSync() {
  return sync.sync(project.id, confirm(await sync.preview(project.id)));
}

describe("Trello sync", () => {
  it("previews without calling Trello, then creates the card with markers, due date and checklist", async () => {
    const plan = await sync.preview(project.id);
    expect(plan.counts).toMatchObject({ create: 1, update: 0, unchanged: 0, error: 0 });
    expect(plan.items[0]?.warnings).toEqual(["Owner Person A has no Trello member mapped"]);
    expect(trello.calls).toEqual(["getBoard"]); // from saveSettings only

    const [result] = await sync.sync(project.id, confirm(plan));
    expect(result).toMatchObject({ ok: true, action: "create" });
    const card = [...trello.cards.values()][0];
    expect(card?.fields).toMatchObject({ name: "[TEC-001] Controller", due: "2026-10-09T12:00:00.000Z", idList: LISTS.backlog, idLabels: [id(200)] });
    expect(card?.desc).toContain(`EDEN_PLANNER_ID:${task.id}`);
    expect(card?.desc).toContain("EDEN_CODE:TEC-001");
    expect(card?.checklists[0]?.checkItems).toEqual([expect.objectContaining({ name: "[TEC-001.1] Wiring", state: "complete" })]);
    expect((await planning.getTask(task.id)).trelloSyncStatus).toBe("SYNCED");
  });

  it("is idempotent: a second run changes nothing", async () => {
    await runSync();
    const plan = await sync.preview(project.id);
    expect(plan.counts).toMatchObject({ create: 0, update: 0, unchanged: 1 });
    await sync.sync(project.id, confirm(plan));
    expect(trello.cards.size).toBe(1);
    expect(trello.calls.filter((c) => c === "createCard")).toHaveLength(1);
  });

  it("updates the same card after a planning change and reconciles the checklist", async () => {
    await runSync();
    await planning.updateTask(task.id, { status: "IN_PROGRESS" });
    expect((await planning.getTask(task.id)).trelloSyncStatus).toBe("OUT_OF_SYNC");
    await planning.createTask(project.id, { edenCode: "TEC-001.2", title: "Bench", parentTaskId: task.id });
    const plan = await sync.preview(project.id);
    expect(plan.counts.update).toBe(1);
    await sync.sync(project.id, confirm(plan));
    const card = [...trello.cards.values()][0];
    expect(trello.cards.size).toBe(1);
    expect(card?.fields.idList).toBe(LISTS.doing);
    expect(card?.checklists[0]?.checkItems.map((i) => i.name)).toEqual(["[TEC-001.1] Wiring", "[TEC-001.2] Bench"]);
  });

  it("adopts a card created by an interrupted run instead of duplicating it", async () => {
    await runSync();
    // Simulate a lost link: the card exists in Trello, the planner forgot it.
    db.prepare("UPDATE tasks SET trello_card_id = NULL, trello_sync_status = 'NOT_SYNCED' WHERE id = ?").run(task.id);
    const results = await runSync();
    expect(results[0]).toMatchObject({ ok: true, message: "Existing card found and linked" });
    expect(trello.cards.size).toBe(1);
  });

  it("reports mapping errors readably and does not write the card", async () => {
    await planning.updateTask(task.id, { status: "WAITING_BLOCKED" });
    const plan = await sync.preview(project.id);
    expect(plan.items[0]).toMatchObject({ action: "error", reason: "No Trello list is mapped for status WAITING_BLOCKED" });
    const results = await sync.sync(project.id, confirm(plan));
    expect(results[0]?.ok).toBe(false);
    expect(trello.cards.size).toBe(0);
    expect((await planning.getTask(task.id)).trelloSyncStatus).toBe("SYNC_ERROR");
  });

  it("refuses a sync whose plan differs from the confirmed preview", async () => {
    const plan = await sync.preview(project.id);
    await planning.createTask(project.id, { edenCode: "TEC-002", title: "Other", workstreamId: ws.id });
    await expect(sync.sync(project.id, confirm(plan))).rejects.toMatchObject({ issues: [{ code: "SYNC_PLAN_CHANGED" }] });
    expect(trello.cards.size).toBe(0);
  });

  it("maps members only to people on the board and audits sync writes as TRELLO_SYNC", async () => {
    await expect(sync.setMemberTrelloId(owner.id, id(999))).rejects.toMatchObject({ kind: "validation" });
    await sync.setMemberTrelloId(owner.id, id(300));
    await runSync();
    expect([...trello.cards.values()][0]?.fields.idMembers).toEqual([id(300)]);
    const actors = db.prepare("SELECT DISTINCT actor_type FROM audit_events WHERE entity_type IN ('trello_settings','members') OR metadata_json IS NULL OR actor_type = 'TRELLO_SYNC'").all() as { actor_type: string }[];
    expect(actors.map((a) => a.actor_type)).toContain("TRELLO_SYNC");
  });
});

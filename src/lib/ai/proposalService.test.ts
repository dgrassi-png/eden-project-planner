import { fileURLToPath } from "node:url";

import type BetterSqlite3 from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import type { Project, Task } from "@/domain/planning/types";
import { applyMigrations, openDatabase } from "@/lib/db/migrator.mjs";
import { PlanningService } from "@/lib/planning/service";
import { createSqlitePlanningStore } from "@/lib/planning/sqliteStore";

import { ProposalService } from "./proposalService";

const MIGRATIONS = fileURLToPath(new URL("../../../db/migrations", import.meta.url));
let db: BetterSqlite3.Database;
let planning: PlanningService;
let asUser: ProposalService;
let asClaude: ProposalService;
let project: Project;
let sc: Task;

beforeEach(async () => {
  db = openDatabase(":memory:", { create: true });
  applyMigrations(db, MIGRATIONS);
  const userStore = createSqlitePlanningStore(db, { type: "USER", id: "eden_marco" });
  const claudeStore = createSqlitePlanningStore(db, { type: "CLAUDE", id: "agent:CLAUDE" });
  planning = new PlanningService(userStore);
  asUser = new ProposalService(userStore, planning);
  asClaude = new ProposalService(claudeStore, new PlanningService(claudeStore));
  project = await planning.createProject({ name: "P", slug: "p" });
  const ws = await planning.createWorkstream(project.id, { code: "SC", name: "Supply chain" });
  sc = await planning.createTask(project.id, { edenCode: "SC-001", title: "BOM", workstreamId: ws.id, plannedStart: "2026-10-05", plannedDurationDays: 5 });
});

const delay = { changes: [{ op: "update_task", task: "SC-001", set: { plannedFinish: "2026-10-16", status: "WAITING_BLOCKED", blocker: "Supplier delay" } }] };

describe("ProposalService", () => {
  it("stores an agent proposal without touching the plan", async () => {
    const proposal = await asClaude.submit(project.id, { source: "CLAUDE", reason: "Supplier moved delivery", payload: delay }, "agent:CLAUDE");
    expect(proposal.status).toBe("PENDING");
    expect((await planning.getTask(sc.id)).plannedFinish).toBe("2026-10-09");
    const audit = db.prepare("SELECT actor_type, entity_type FROM audit_events WHERE entity_type = 'change_proposals'").all();
    expect(audit).toEqual([{ actor_type: "CLAUDE", entity_type: "change_proposals" }]);
  });

  it("rejects payloads outside the schema with readable issues", async () => {
    await expect(asClaude.submit(project.id, { source: "CLAUDE", payload: { changes: [] } }, "agent:CLAUDE")).rejects.toMatchObject({
      kind: "validation",
      issues: [{ code: "PROPOSAL_SCHEMA" }],
    });
  });

  it("applies the reviewed diff atomically, attributed to the approving person", async () => {
    const proposal = await asClaude.submit(project.id, { source: "CLAUDE", payload: delay }, "agent:CLAUDE");
    const review = await asUser.review(proposal.id);
    expect(review.preview?.diffs[0]?.fields.map((f) => `${f.field}: ${f.before} → ${f.after}`)).toEqual([
      "Duration (wd): 5 → 10",
      "Finish: 2026-10-09 → 2026-10-16",
      "Status: BACKLOG → WAITING_BLOCKED",
      "Blocker: TBD → Supplier delay",
    ]);
    const applied = await asUser.apply(proposal.id, "eden_marco", review.fingerprint as string);
    expect(applied).toMatchObject({ status: "APPLIED", reviewedBy: "eden_marco" });
    expect(await planning.getTask(sc.id)).toMatchObject({ plannedFinish: "2026-10-16", status: "WAITING_BLOCKED" });
    const events = db
      .prepare("SELECT actor_type, entity_type, metadata_json FROM audit_events WHERE metadata_json LIKE '%proposal_id%' ORDER BY rowid")
      .all() as { actor_type: string; entity_type: string; metadata_json: string }[];
    expect(events.map((e) => `${e.actor_type} ${e.entity_type}`)).toEqual(["USER tasks", "USER change_proposals"]);
    expect(JSON.parse(events[0]?.metadata_json ?? "{}")).toMatchObject({ proposal_id: proposal.id, proposal_source: "CLAUDE" });
    await expect(asUser.apply(proposal.id, "eden_marco", review.fingerprint as string)).rejects.toMatchObject({ kind: "conflict" });
  });

  it("refuses to apply when the plan changed after the review", async () => {
    const proposal = await asClaude.submit(project.id, { source: "CLAUDE", payload: delay }, "agent:CLAUDE");
    const review = await asUser.review(proposal.id);
    await planning.updateTask(sc.id, { plannedDurationDays: 7 });
    await expect(asUser.apply(proposal.id, "eden_marco", review.fingerprint as string)).rejects.toMatchObject({
      issues: [{ code: "PROPOSAL_CHANGED" }],
    });
    expect((await planning.getTask(sc.id)).status).toBe("BACKLOG");
  });

  it("records rejections, which are final", async () => {
    const proposal = await asClaude.submit(project.id, { source: "CLAUDE", payload: delay }, "agent:CLAUDE");
    const rejected = await asUser.reject(proposal.id, "eden_marco", "Not confirmed by the supplier");
    expect(rejected).toMatchObject({ status: "REJECTED", reviewNote: "Not confirmed by the supplier" });
    expect(() => db.prepare("UPDATE change_proposals SET status = 'PENDING' WHERE id = ?").run(proposal.id)).toThrow(/PROPOSAL_FINAL/);
  });

  it("builds a context with codes and names, not ids or emails", async () => {
    const person = await planning.createMember(project.id, { displayName: "Marco", email: "marco@e-den.tech" });
    await planning.updateTask(sc.id, { ownerMemberId: person.id });
    const context = await asUser.context(project.id, "2026-09-30");
    expect(context.tasks[0]).toMatchObject({ code: "SC-001", workstream: "SC", owner: "Marco", plannedFinish: "2026-10-09" });
    expect(JSON.stringify(context)).not.toContain("e-den.tech");
    expect(JSON.stringify(context)).not.toContain(person.id);
  });
});

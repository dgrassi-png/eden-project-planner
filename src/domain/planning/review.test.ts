import { describe, expect, it } from "vitest";

import { computePlannedFinish } from "./calendar";
import { buildWeeklyReview } from "./review";
import { checkDependencies } from "./scheduling";
import { makeTask, makeWorkstream, PROJECT_ID } from "./testFixtures";
import type { AuditEvent, PlanningSnapshot, Task } from "./types";

const TODAY = "2026-10-14"; // Wednesday

function task(id: string, start: string | null, duration: number | null, extra: Partial<Task> = {}): Task {
  const isMilestone = extra.isMilestone ?? false;
  return makeTask({
    id,
    edenCode: id,
    plannedStart: start,
    plannedDurationDays: isMilestone ? 0 : duration,
    plannedFinish: computePlannedFinish({ plannedStart: start, plannedDurationDays: isMilestone ? 0 : duration, isMilestone }),
    ...extra,
  });
}

const tasks = [
  task("A-001", "2026-10-05", 5, { status: "DONE" }), // done this week
  task("A-002", "2026-10-05", 3, { status: "IN_PROGRESS" }), // finish 10-07 passed
  task("A-003", "2026-10-12", 5, { status: "READY" }), // should have started
  task("A-004", "2026-10-19", 2, { priority: "P0", status: "WAITING_BLOCKED", blocker: "Supplier" }),
  task("A-005", null, null, { waitingFor: "Board decision" }),
  task("M-001", "2026-10-16", null, { isMilestone: true }),
];
const dependencies = [{ id: "d1", projectId: PROJECT_ID, predecessorTaskId: "A-002", successorTaskId: "M-001", lagDays: 0, createdAt: "" }];
const snapshot: PlanningSnapshot = {
  project: { id: PROJECT_ID, name: "P", slug: "p", description: null, trelloBoardId: null, createdAt: "", updatedAt: "" },
  workstreams: [makeWorkstream({ id: "ws-1", code: "A" })],
  members: [],
  tasks,
  dependencies,
};
const event = (partial: Partial<AuditEvent>): AuditEvent => ({
  id: "e",
  projectId: PROJECT_ID,
  actorType: "USER",
  actorId: "u",
  action: "UPDATE",
  entityType: "tasks",
  entityId: null,
  before: null,
  after: null,
  metadata: null,
  createdAt: "2026-10-12T10:00:00.000Z",
  ...partial,
});

describe("buildWeeklyReview", () => {
  const review = buildWeeklyReview({
    snapshot,
    checks: checkDependencies(tasks, dependencies),
    audit: [
      event({ entityId: "A-001", before: { status: "IN_PROGRESS" }, after: { status: "DONE" } }),
      event({ entityId: "A-005", action: "CREATE", after: { status: "BACKLOG" } }),
    ],
    today: TODAY,
  });
  const codes = (items: { code: string }[]) => items.map((i) => i.code);

  it("lists completed, in progress, blocked and P0 blocked work", () => {
    expect(codes(review.completed)).toEqual(["A-001"]);
    expect(codes(review.inProgress)).toEqual(["A-002"]);
    expect(codes(review.blocked)).toEqual(["A-004"]);
    expect(codes(review.blockedP0)).toEqual(["A-004"]);
  });

  it("flags slipping work with an objective reason", () => {
    expect(review.slipping.map((s) => [s.code, s.note])).toEqual([
      ["A-002", "Planned finish 2026-10-07 has passed"],
      ["A-003", "Planned to start 2026-10-12, not started"],
    ]);
  });

  it("shows upcoming work, milestones at risk, decisions, new tasks and missing data", () => {
    expect(codes(review.upcoming)).toEqual(["A-004"]);
    expect(review.milestones.map((m) => [m.code, m.atRisk])).toEqual([["M-001", true]]);
    expect(codes(review.decisions)).toEqual(["A-005"]);
    expect(codes(review.unplanned)).toEqual(["A-005"]);
    expect(codes(review.dataQuality.unscheduled)).toEqual(["A-005"]);
    expect(review.dataQuality.noOwner).toHaveLength(5);
  });
});

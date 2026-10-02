import { describe, expect, it } from "vitest";

import { computePlannedFinish } from "../planning/calendar";
import { makeTask, makeWorkstream, PROJECT_ID } from "../planning/testFixtures";
import type { PlanningSnapshot, Task } from "../planning/types";

import { proposalPayloadSchema } from "./schema";
import { simulateProposal } from "./simulate";

function scheduled(id: string, code: string, start: string | null, duration: number | null, extra: Partial<Task> = {}): Task {
  return makeTask({
    id,
    edenCode: code,
    plannedStart: start,
    plannedDurationDays: duration,
    plannedFinish: computePlannedFinish({ plannedStart: start, plannedDurationDays: duration, isMilestone: false }),
    updatedAt: `v-${id}`,
    ...extra,
  });
}

// 2026-10-05 is a Monday.
const snapshot: PlanningSnapshot = {
  project: { id: PROJECT_ID, name: "P", slug: "p", description: null, trelloBoardId: null, createdAt: "", updatedAt: "" },
  workstreams: [makeWorkstream({ id: "ws-1", code: "SC" }), makeWorkstream({ id: "ws-2", code: "PROD" })],
  members: [
    { id: "m-1", projectId: PROJECT_ID, edenUserId: null, displayName: "Marco", email: "marco@e-den.tech", trelloMemberId: null, active: true, createdAt: "", updatedAt: "" },
  ],
  tasks: [
    scheduled("t-sc", "SC-001", "2026-10-05", 5, { workstreamId: "ws-1" }),
    scheduled("t-prod", "PROD-002", "2026-10-12", 3, { workstreamId: "ws-2" }),
  ],
  dependencies: [{ id: "d-1", projectId: PROJECT_ID, predecessorTaskId: "t-sc", successorTaskId: "t-prod", lagDays: 0, createdAt: "" }],
};

let counter = 0;
const newId = () => `new-${++counter}`;
const simulate = (payload: unknown) => simulateProposal(snapshot, proposalPayloadSchema.parse(payload), newId);

describe("simulateProposal", () => {
  it("translates a target finish into a duration and shows BEFORE → PROPOSED with the dependency impact", () => {
    const preview = simulate({ changes: [{ op: "update_task", task: "sc-001", set: { plannedFinish: "2026-10-16", owner: "marco" } }] });
    expect(preview.valid).toBe(true);
    expect(preview.diffs[0]).toEqual({
      kind: "task-update",
      label: "SC-001",
      fields: [
        { field: "Owner", before: "TBD", after: "Marco" },
        { field: "Duration (wd)", before: "5", after: "10" },
        { field: "Finish", before: "2026-10-09", after: "2026-10-16" },
      ],
    });
    expect(preview.ops).toEqual([
      {
        kind: "updateTask",
        id: "t-sc",
        changes: { ownerMemberId: "m-1", plannedDurationDays: 10, plannedFinish: "2026-10-16" },
        expectedUpdatedAt: "v-t-sc",
      },
    ]);
    expect(preview.newViolations.map((v) => [v.predecessorCode, v.successorCode, v.conflictDays])).toEqual([["SC-001", "PROD-002", 5]]);
  });

  it("creates tasks and dependencies that reference each other, in order", () => {
    const preview = simulate({
      changes: [
        { op: "create_task", task: { edenCode: "PROD-003", title: "QC", workstream: "PROD" } },
        { op: "add_dependency", predecessor: "PROD-002", successor: "PROD-003", lagDays: 2 },
      ],
    });
    expect(preview.valid).toBe(true);
    expect(preview.ops.map((op) => op.kind)).toEqual(["createTask", "createDependency"]);
    expect(preview.diffs.map((d) => [d.kind, d.label])).toEqual([
      ["task-create", "PROD-003"],
      ["dependency-add", "PROD-002 → PROD-003"],
    ]);
  });

  it("reports every problem with its change number and produces no writes", () => {
    const preview = simulate({
      changes: [
        { op: "update_task", task: "TEC-404", set: { title: "x" } },
        { op: "update_task", task: "SC-001", set: { owner: "Nobody" } },
        { op: "add_dependency", predecessor: "PROD-002", successor: "SC-001" },
        { op: "update_task", task: "SC-001", set: { plannedStart: "2026-10-10" } },
      ],
    });
    expect(preview.valid).toBe(false);
    expect(preview.ops).toEqual([]);
    expect(preview.issues.map((i) => [i.change, i.code])).toEqual([
      [1, "TASK_NOT_FOUND"],
      [2, "OWNER_NOT_FOUND"],
      [3, "DEPENDENCY_CYCLE"],
      [4, "START_NOT_WORKING_DAY"],
    ]);
  });

  it("removes dependencies and reports the conflicts that disappear", () => {
    const moved = simulate({ changes: [{ op: "remove_dependency", predecessor: "SC-001", successor: "PROD-002" }] });
    expect(moved.ops).toEqual([{ kind: "deleteDependency", id: "d-1" }]);
    expect(moved.diffs[0]).toMatchObject({ kind: "dependency-remove", label: "SC-001 → PROD-002" });
  });

  it("rejects shapes outside the schema (e.g. deleting tasks)", () => {
    expect(proposalPayloadSchema.safeParse({ changes: [{ op: "delete_task", task: "SC-001" }] }).success).toBe(false);
    expect(proposalPayloadSchema.safeParse({ changes: [{ op: "update_task", task: "SC-001", set: { plannedFinish: "2026-10-16", edenCode: "X-001" } }] }).success).toBe(false);
  });
});

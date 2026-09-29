import { describe, expect, it } from "vitest";

import { makeTask, makeWorkstream, PROJECT_ID } from "@/domain/planning/testFixtures";

import { toPlannerData } from "./viewModel";

describe("toPlannerData", () => {
  it("flattens workstreams, tasks and subtasks with dependency and owner labels", () => {
    const data = toPlannerData({
      project: { id: PROJECT_ID, name: "P", slug: "p", description: null, trelloBoardId: null, createdAt: "", updatedAt: "" },
      workstreams: [makeWorkstream({ id: "ws-1", code: "TEC", name: "Engineering" })],
      members: [
        { id: "m-1", projectId: PROJECT_ID, authUserId: null, displayName: "Owner", email: null, trelloMemberId: null, active: true, createdAt: "", updatedAt: "" },
      ],
      tasks: [
        makeTask({ id: "t-2", edenCode: "TEC-002", plannedStart: "2026-10-05" }),
        makeTask({ id: "t-1", edenCode: "TEC-001", ownerMemberId: "m-1" }),
        makeTask({ id: "t-1-1", edenCode: "TEC-001.1", parentTaskId: "t-1" }),
      ],
      dependencies: [{ id: "d-1", projectId: PROJECT_ID, predecessorTaskId: "t-1", successorTaskId: "t-2", lagDays: 2, createdAt: "" }],
    });

    expect(data.rows.map((r) => (r.kind === "task" ? `${"  ".repeat(r.depth)}${r.edenCode}` : r.code))).toEqual([
      "TEC",
      "TEC-001",
      "  TEC-001.1",
      "TEC-002",
    ]);
    const [ws, t1, sub, t2] = data.rows;
    expect(ws).toMatchObject({ kind: "workstream", taskCount: 3 });
    expect(t1).toMatchObject({ ownerName: "Owner", hasSubtasks: true, scheduleState: "unscheduled" });
    expect(sub).toMatchObject({ parentCode: "TEC-001", depth: 1 });
    expect(t2).toMatchObject({
      predecessorCodes: ["TEC-001"],
      predecessors: [{ dependencyId: "d-1", taskId: "t-1", edenCode: "TEC-001", lagDays: 2 }],
      scheduleState: "partial",
    });
    expect(data.edenCodes).toHaveLength(3);
  });
});

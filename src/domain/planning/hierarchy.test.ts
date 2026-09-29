import { describe, expect, it } from "vitest";

import { buildPlanningTree } from "./hierarchy";
import { makeTask, makeWorkstream } from "./testFixtures";

describe("buildPlanningTree", () => {
  it("groups by workstream order and nests subtasks in code order", () => {
    const workstreams = [
      makeWorkstream({ id: "ws-2", code: "CERT", sortOrder: 2 }),
      makeWorkstream({ id: "ws-1", code: "TEC", sortOrder: 1 }),
    ];
    const tasks = [
      makeTask({ id: "t2", edenCode: "TEC-010", workstreamId: "ws-1" }),
      makeTask({ id: "t1", edenCode: "TEC-002", workstreamId: "ws-1" }),
      makeTask({ id: "s2", edenCode: "TEC-002.10", workstreamId: "ws-1", parentTaskId: "t1" }),
      makeTask({ id: "s1", edenCode: "TEC-002.2", workstreamId: "ws-1", parentTaskId: "t1" }),
      makeTask({ id: "c1", edenCode: "CERT-001", workstreamId: "ws-2" }),
    ];
    const tree = buildPlanningTree(workstreams, tasks);
    expect(tree.map((n) => n.workstream.code)).toEqual(["TEC", "CERT"]);
    expect(tree[0]?.tasks.map((n) => n.task.edenCode)).toEqual(["TEC-002", "TEC-010"]);
    expect(tree[0]?.tasks[0]?.subtasks.map((t) => t.edenCode)).toEqual(["TEC-002.2", "TEC-002.10"]);
    expect(tree[1]?.tasks.map((n) => n.task.edenCode)).toEqual(["CERT-001"]);
  });

  it("keeps empty workstreams", () => {
    const tree = buildPlanningTree([makeWorkstream({ id: "ws-1", code: "GOV" })], []);
    expect(tree).toEqual([{ workstream: expect.objectContaining({ code: "GOV" }), tasks: [] }]);
  });
});

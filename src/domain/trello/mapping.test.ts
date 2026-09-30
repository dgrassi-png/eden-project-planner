import { describe, expect, it } from "vitest";

import { makeTask } from "../planning/testFixtures";

import { buildCard, dueFromFinish, planSync, validateSettings, type MappingContext } from "./mapping";

const settings: MappingContext["settings"] = {
  projectId: "p-1",
  boardId: "b",
  boardName: "E:DEN",
  boardUrl: null,
  subtaskMode: "CARD",
  statusLists: { BACKLOG: "list-backlog", DONE: "list-done" },
  workstreamLabels: {},
  updatedAt: "",
};

const parent = makeTask({ id: "t1", edenCode: "TEC-001", title: "Controller", description: "Details" });
const child = makeTask({ id: "t2", edenCode: "TEC-001.1", parentTaskId: "t1", status: "DONE" });
const cancelled = makeTask({ id: "t3", edenCode: "TEC-002", status: "CANCELLED" });

const ctx = (overrides: Partial<MappingContext> = {}): MappingContext => ({
  settings,
  workstreams: [{ id: "ws-1", code: "TEC", name: "Engineering" }],
  members: [],
  tasks: [parent, child, cancelled],
  dependencies: [],
  ...overrides,
});

describe("buildCard", () => {
  it("shows unknown planning values as TBD and ends with machine-readable markers", () => {
    const { content } = buildCard(parent, ctx());
    expect(content?.name).toBe("[TEC-001] Controller");
    expect(content?.due).toBeNull();
    expect(content?.desc).toContain("Owner: TBD");
    expect(content?.desc).toContain("Planned: TBD → TBD (duration TBD)");
    expect(content?.desc.trim().split("\n").slice(-2)).toEqual(["EDEN_CODE:TEC-001", "EDEN_PLANNER_ID:t1"]);
  });

  it("sends the planned finish as midday UTC", () => {
    expect(dueFromFinish("2026-10-09")).toBe("2026-10-09T12:00:00.000Z");
  });
});

describe("planSync", () => {
  it("gives subtasks their own cards in CARD mode and skips cancelled tasks never sent", () => {
    const plan = planSync(ctx(), () => "hash");
    expect(plan.items.map((i) => [i.edenCode, i.action])).toEqual([
      ["TEC-001", "create"],
      ["TEC-001.1", "create"],
      ["TEC-002", "skip"],
    ]);
  });

  it("folds subtasks into the parent's checklist in CHECKLIST mode", () => {
    const plan = planSync(ctx({ settings: { ...settings, subtaskMode: "CHECKLIST" } }), () => "hash");
    expect(plan.items.map((i) => i.edenCode)).toEqual(["TEC-001", "TEC-002"]);
    expect(plan.items[0]?.content?.checklist).toEqual([{ code: "TEC-001.1", name: "[TEC-001.1] TEC-001.1", complete: true }]);
  });
});

describe("validateSettings", () => {
  it("accepts only lists and labels of the board", () => {
    expect(
      validateSettings(
        { statusLists: { BACKLOG: "x" }, workstreamLabels: { "ws-9": "l" }, subtaskMode: "CARD" },
        { listIds: ["a"], labelIds: ["l"] },
        ["ws-1"],
      ),
    ).toEqual(["List for BACKLOG is not an open list of the board", "Unknown workstream in label mapping"]);
  });
});

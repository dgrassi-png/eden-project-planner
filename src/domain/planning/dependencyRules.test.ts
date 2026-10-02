import { describe, expect, it } from "vitest";

import { findCyclePath, validateNewDependency } from "./dependencyRules";
import { makeTask } from "./testFixtures";

const a = makeTask({ id: "a", edenCode: "TEC-001" });
const b = makeTask({ id: "b", edenCode: "TEC-002" });
const c = makeTask({ id: "c", edenCode: "CERT-001" });
const a1 = makeTask({ id: "a1", edenCode: "TEC-001.1", parentTaskId: "a" });
const other = makeTask({ id: "x", edenCode: "GOV-001", projectId: "p-2" });
const tasks = [a, b, c, a1, other];
const deps = [
  { predecessorTaskId: "a", successorTaskId: "b" },
  { predecessorTaskId: "b", successorTaskId: "c" },
];

const codes = (input: Parameters<typeof validateNewDependency>[0]) =>
  validateNewDependency(input, tasks, deps).map((i) => i.code);

describe("dependency rules", () => {
  it("accepts a valid Finish-to-Start link with lag", () => {
    expect(codes({ predecessorTaskId: "a", successorTaskId: "c", lagDays: 2 })).toEqual([]);
  });

  it("rejects self, duplicate, parent/child and cross-project links", () => {
    expect(codes({ predecessorTaskId: "a", successorTaskId: "a" })).toEqual(["DEPENDENCY_SELF"]);
    expect(codes({ predecessorTaskId: "a", successorTaskId: "b" })).toEqual(["DEPENDENCY_DUPLICATE"]);
    expect(codes({ predecessorTaskId: "a1", successorTaskId: "a" })).toEqual(["DEPENDENCY_PARENT_CHILD"]);
    expect(codes({ predecessorTaskId: "a", successorTaskId: "x" })).toEqual(["DEPENDENCY_PROJECT_MISMATCH"]);
    expect(codes({ predecessorTaskId: "a", successorTaskId: "nope" })).toEqual(["SUCCESSOR_NOT_FOUND"]);
  });

  it("rejects cycles and explains the path", () => {
    const [cycle] = validateNewDependency({ predecessorTaskId: "c", successorTaskId: "a" }, tasks, deps);
    expect(cycle?.code).toBe("DEPENDENCY_CYCLE");
    expect(cycle?.message).toContain("TEC-001 → TEC-002 → CERT-001 → TEC-001");
  });

  it("rejects negative or fractional lag", () => {
    expect(codes({ predecessorTaskId: "a", successorTaskId: "c", lagDays: -1 })).toEqual(["LAG_RANGE"]);
    expect(codes({ predecessorTaskId: "a", successorTaskId: "c", lagDays: 1.5 })).toEqual(["LAG_RANGE"]);
  });

  it("finds cycle paths only when one exists", () => {
    expect(findCyclePath(deps, "c", "a")).toEqual(["a", "b", "c"]);
    expect(findCyclePath(deps, "a", "c")).toBeNull();
    expect(findCyclePath([], "a", "b")).toBeNull();
  });
});

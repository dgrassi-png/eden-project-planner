import { describe, expect, it } from "vitest";

import { computePlannedFinish } from "./calendar";
import {
  checkDependencies,
  conflictDays,
  describeImpact,
  earliestSuccessorStart,
  impactOfChange,
  planCascade,
  type SchedulingDependency,
} from "./scheduling";
import { makeTask } from "./testFixtures";
import type { Task } from "./types";

// 2026-10-05 is a Monday.
function scheduled(id: string, start: string | null, duration: number | null, extra: Partial<Task> = {}): Task {
  const isMilestone = extra.isMilestone ?? false;
  const plannedDurationDays = isMilestone ? 0 : duration;
  return makeTask({
    id,
    edenCode: id,
    plannedStart: start,
    plannedDurationDays,
    plannedFinish: computePlannedFinish({ plannedStart: start, plannedDurationDays, isMilestone }),
    ...extra,
  });
}

const dep = (id: string, predecessorTaskId: string, successorTaskId: string, lagDays = 0): SchedulingDependency => ({
  id,
  predecessorTaskId,
  successorTaskId,
  lagDays,
});

describe("earliestSuccessorStart", () => {
  it("is the next working day after the finish, plus lag working days", () => {
    expect(earliestSuccessorStart("2026-10-07", 0, false)).toBe("2026-10-08"); // Wed -> Thu
    expect(earliestSuccessorStart("2026-10-09", 0, false)).toBe("2026-10-12"); // Fri -> Mon
    expect(earliestSuccessorStart("2026-10-09", 2, false)).toBe("2026-10-14"); // Mon, Tue lag -> Wed
    expect(earliestSuccessorStart("2026-10-10", 0, false)).toBe("2026-10-12"); // milestone on Sat -> Mon
  });

  it("lets milestone successors fall on any calendar day", () => {
    expect(earliestSuccessorStart("2026-10-09", 0, true)).toBe("2026-10-10");
    expect(earliestSuccessorStart("2026-10-09", 1, true)).toBe("2026-10-13");
  });
});

describe("conflictDays", () => {
  it("counts working days for tasks and calendar days for milestones", () => {
    expect(conflictDays("2026-10-12", "2026-10-12", false)).toBe(0);
    expect(conflictDays("2026-10-08", "2026-10-15", false)).toBe(5);
    expect(conflictDays("2026-10-08", "2026-10-15", true)).toBe(7);
  });
});

describe("checkDependencies", () => {
  it("classifies ok, violated, unknown and inactive links", () => {
    const tasks = [
      scheduled("A", "2026-10-05", 5), // Mon-Fri
      scheduled("B", "2026-10-12", 3), // ok
      scheduled("C", "2026-10-08", 2), // violated by 2 working days
      scheduled("D", null, null), // unknown
      scheduled("E", "2026-10-05", 1, { status: "CANCELLED" }),
    ];
    const checks = checkDependencies(tasks, [dep("1", "A", "B"), dep("2", "A", "C"), dep("3", "A", "D"), dep("4", "E", "B")]);
    expect(checks.map((c) => [c.dependencyId, c.state, c.conflictDays])).toEqual([
      ["1", "ok", 0],
      ["2", "violated", 2],
      ["3", "unknown", 0],
      ["4", "inactive", 0],
    ]);
  });
});

describe("planCascade", () => {
  it("moves successors forward only, keeping duration, through the whole chain", () => {
    const tasks = [
      scheduled("A", "2026-10-05", 5),
      scheduled("B", "2026-10-12", 3), // Mon-Wed
      scheduled("C", "2026-10-15", 2), // Thu-Fri
      scheduled("Z", "2026-11-02", 1), // far away, not affected
    ];
    const deps = [dep("1", "A", "B"), dep("2", "B", "C"), dep("3", "C", "Z")];
    const plan = planCascade(tasks, deps, "A", new Map([["A", { plannedStart: "2026-10-12", plannedDurationDays: 5, plannedFinish: "2026-10-16" }]]));
    expect(plan.moves.map((m) => [m.edenCode, m.toStart, m.toFinish, m.shiftDays, m.causedByCode])).toEqual([
      ["B", "2026-10-19", "2026-10-21", 5, "A"],
      ["C", "2026-10-22", "2026-10-23", 5, "B"],
    ]);
    expect(plan.blocked).toEqual([]);
  });

  it("never moves tasks earlier", () => {
    const tasks = [scheduled("A", "2026-10-05", 1), scheduled("B", "2026-10-20", 1)];
    expect(planCascade(tasks, [dep("1", "A", "B")], "A").moves).toEqual([]);
  });

  it("never moves DONE tasks and reports them", () => {
    const tasks = [
      scheduled("A", "2026-10-12", 5),
      scheduled("B", "2026-10-12", 2, { status: "DONE" }),
      scheduled("C", "2026-10-14", 1),
    ];
    const plan = planCascade(tasks, [dep("1", "A", "B"), dep("2", "B", "C")], "A");
    expect(plan.blocked).toEqual([{ taskId: "B", edenCode: "B", status: "DONE", conflictDays: 5, causedByCode: "A" }]);
    // C only depends on B, which did not move.
    expect(plan.moves).toEqual([]);
  });

  it("leaves unscheduled tasks without dates and respects the latest predecessor", () => {
    const tasks = [
      scheduled("A", "2026-10-05", 2),
      scheduled("B", "2026-10-05", 8),
      scheduled("U", null, 3),
      scheduled("M", "2026-10-07", null, { isMilestone: true }),
    ];
    const deps = [dep("1", "A", "M"), dep("2", "B", "M"), dep("3", "A", "U")];
    // M must follow both A and B: the latest constraint (B finishes Wed 14th) wins, U keeps no date.
    const plan = planCascade(tasks, deps, "A");
    expect(plan.moves.map((m) => [m.edenCode, m.toStart, m.toFinish, m.causedByCode])).toEqual([["M", "2026-10-15", "2026-10-15", "B"]]);
  });
});

describe("impactOfChange", () => {
  it("reports the conflict a move creates and the cascade that would fix it", () => {
    const tasks = [scheduled("TEC-001", "2026-10-05", 5), scheduled("TEC-002", "2026-10-12", 5)];
    const deps = [dep("1", "TEC-001", "TEC-002")];
    const impact = impactOfChange(tasks, deps, "TEC-001", {
      plannedStart: "2026-10-12",
      plannedDurationDays: 5,
      plannedFinish: "2026-10-16",
    });
    expect(describeImpact("TEC-001", impact)).toEqual(["Moving TEC-001 creates a 5-day conflict with TEC-002."]);
    expect(impact.cascade.moves.map((m) => m.toStart)).toEqual(["2026-10-19"]);
  });

  it("reports resolved conflicts", () => {
    const tasks = [scheduled("A", "2026-10-05", 5), scheduled("B", "2026-10-07", 1)];
    const impact = impactOfChange(tasks, [dep("1", "A", "B")], "B", {
      plannedStart: "2026-10-12",
      plannedDurationDays: 1,
      plannedFinish: "2026-10-12",
    });
    expect(impact.created).toEqual([]);
    expect(impact.resolved.map((c) => c.dependencyId)).toEqual(["1"]);
  });
});

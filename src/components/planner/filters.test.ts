import { describe, expect, it } from "vitest";

import { filterRows, NO_FILTERS } from "./filters";
import { SCAFFOLD_PLANNER_DATA } from "./scaffold";

const codes = (rows: { kind: string; edenCode?: string; code?: string }[]) => rows.map((r) => (r.kind === "task" ? r.edenCode : r.code));

describe("filterRows", () => {
  const rows = SCAFFOLD_PLANNER_DATA.rows;

  it("returns every row without filters", () => {
    expect(filterRows(rows, NO_FILTERS)).toBe(rows);
  });

  it("searches code and title, keeping the parent of a matching subtask and its workstream", () => {
    const subtask = rows.find((r) => r.kind === "task" && r.parentTaskId !== null);
    if (!subtask || subtask.kind !== "task") throw new Error("fixture needs a subtask");
    const result = filterRows(rows, { ...NO_FILTERS, search: subtask.edenCode.toLowerCase() });
    expect(codes(result)).toEqual(["SCAFFOLD-A", subtask.parentCode, subtask.edenCode]);
  });

  it("combines criteria (milestones only + unscheduled)", () => {
    const result = filterRows(rows, { ...NO_FILTERS, milestonesOnly: true, schedule: "unscheduled" });
    expect(result.every((r) => r.kind === "workstream" || r.isMilestone)).toBe(true);
  });
});

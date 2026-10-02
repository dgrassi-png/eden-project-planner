import { describe, expect, it } from "vitest";

import { SCAFFOLD_PLANNER_DATA } from "./scaffold";
import type { PlannerRow, TaskRow } from "./types";
import { visibleRows, workstreamSpans } from "./visibleRows";

const rows = SCAFFOLD_PLANNER_DATA.rows;
const codes = (list: PlannerRow[]) => list.map((r) => (r.kind === "task" ? r.edenCode : r.code));

describe("visibleRows", () => {
  it("shows everything when nothing is collapsed", () => {
    expect(visibleRows(rows, new Set())).toHaveLength(rows.length);
  });

  it("hides a collapsed workstream's tasks and a collapsed parent's subtasks", () => {
    expect(codes(visibleRows(rows, new Set(["scaffold-ws-a"])))).toEqual(["SCAFFOLD-A", "SCAFFOLD-B", "SCAFFOLD-003", "SCAFFOLD-004"]);
    expect(codes(visibleRows(rows, new Set(["scaffold-t1"])))).not.toContain("SCAFFOLD-001.1");
  });
});

describe("workstreamSpans", () => {
  it("spans the earliest start to the latest finish of scheduled tasks only", () => {
    const [ws, t1, sub, t2, ws2] = rows as [PlannerRow, TaskRow, TaskRow, TaskRow, PlannerRow];
    const scheduled: PlannerRow[] = [
      ws,
      { ...t1, plannedStart: "2026-10-05", plannedFinish: "2026-10-09" },
      { ...sub, plannedStart: "2026-10-12", plannedFinish: null },
      { ...t2 },
      ws2,
    ];
    const spans = workstreamSpans(scheduled);
    expect(spans.get(ws.id)).toEqual({ start: "2026-10-05", finish: "2026-10-12" });
    expect(spans.has(ws2.id)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  arrowAnchors,
  barGeometry,
  dependencyPath,
  dragDeltaDays,
  movedStart,
  previewDates,
  resizedDuration,
  type GanttTaskDates,
} from "./gantt";
import { buildTimelineAxis, rangeForDates } from "./scale";

// 2026-10-05 is a Monday.
const task: GanttTaskDates = { plannedStart: "2026-10-05", plannedDurationDays: 5, plannedFinish: "2026-10-09", isMilestone: false };
const milestone: GanttTaskDates = { plannedStart: "2026-11-08", plannedDurationDays: 0, plannedFinish: "2026-11-08", isMilestone: true };

describe("barGeometry", () => {
  it("spans start to finish inclusive, proportionally to dates", () => {
    expect(barGeometry(task, "2026-10-01", 10)).toEqual({ kind: "bar", left: 40, width: 50 });
  });

  it("draws milestones as a point, partial tasks as a start marker, unscheduled as nothing", () => {
    expect(barGeometry(milestone, "2026-11-01", 10)).toEqual({ kind: "milestone", center: 75 });
    expect(barGeometry({ ...task, plannedDurationDays: null, plannedFinish: null }, "2026-10-01", 10)).toEqual({
      kind: "start-only",
      left: 40,
    });
    expect(barGeometry({ ...task, plannedStart: null, plannedFinish: null }, "2026-10-01", 10)).toBeNull();
  });
});

describe("drag rules", () => {
  it("converts pixels to whole days", () => {
    expect(dragDeltaDays(26, 24)).toBe(1);
    expect(dragDeltaDays(11, 24)).toBe(0);
    expect(Object.is(dragDeltaDays(-5, 24), 0)).toBe(true);
    expect(dragDeltaDays(-40, 24)).toBe(-2);
  });

  it("moves task starts and snaps them to working days in the drag direction", () => {
    expect(movedStart(task, 2)).toBe("2026-10-07");
    expect(movedStart(task, 5)).toBe("2026-10-12"); // Sat -> Mon
    expect(movedStart(task, -1)).toBe("2026-10-02"); // Sun -> Fri
    expect(movedStart(task, 0)).toBeNull();
    expect(movedStart({ ...task, plannedStart: "2026-10-09" }, 1)).toBe("2026-10-12");
  });

  it("lets milestones land on any day", () => {
    expect(movedStart(milestone, -1)).toBe("2026-11-07");
  });

  it("does not move unscheduled tasks", () => {
    expect(movedStart({ ...task, plannedStart: null }, 3)).toBeNull();
  });

  it("resizes in working days, keeping at least one day", () => {
    expect(resizedDuration(task, 3)).toBe(6); // Fri -> Mon
    expect(resizedDuration(task, 1)).toBeNull(); // Fri -> Sat snaps back to Fri
    expect(resizedDuration(task, -2)).toBe(3);
    expect(resizedDuration(task, -30)).toBe(1);
    expect(resizedDuration(milestone, 2)).toBeNull();
  });

  it("previews re-derived finish dates", () => {
    expect(previewDates(task, { plannedStart: "2026-10-08" })).toMatchObject({ plannedFinish: "2026-10-14" });
    expect(previewDates(task, { plannedDurationDays: 6 })).toMatchObject({ plannedFinish: "2026-10-12" });
  });
});

describe("dependency arrows", () => {
  it("routes forward links with one elbow", () => {
    expect(dependencyPath({ x: 100, y: 16 }, { x: 200, y: 80 }, 32)).toBe("M 100 16 H 150 V 80 H 200");
  });

  it("loops back between rows when the successor starts earlier", () => {
    expect(dependencyPath({ x: 200, y: 16 }, { x: 100, y: 80 }, 32)).toBe("M 200 16 H 208 V 32 H 92 V 80 H 100");
    expect(dependencyPath({ x: 200, y: 80 }, { x: 100, y: 16 }, 32)).toBe("M 200 80 H 208 V 64 H 92 V 16 H 100");
  });

  it("anchors only on known dates", () => {
    expect(arrowAnchors({ kind: "bar", left: 10, width: 30 }, 6)).toEqual({ start: 10, end: 40 });
    expect(arrowAnchors({ kind: "milestone", center: 50 }, 6)).toEqual({ start: 44, end: 56 });
    expect(arrowAnchors({ kind: "start-only", left: 10 }, 6)).toBeNull();
    expect(arrowAnchors(null, 6)).toBeNull();
  });
});

describe("rangeForDates", () => {
  it("extends the default window to include every planned date", () => {
    const range = rangeForDates("2026-09-29", "month", ["2028-03-15", "2025-01-10"]);
    expect(range).toEqual({ start: "2024-12-01", end: "2028-05-01" });
    const axis = buildTimelineAxis({ today: "2026-09-29", zoom: "month", range });
    expect(axis.todayOffsetPx).not.toBeNull();
  });

  it("keeps the default window when there are no dates", () => {
    expect(rangeForDates("2026-09-29", "week", [])).toEqual({ start: "2026-08-31", end: "2027-03-29" });
  });
});

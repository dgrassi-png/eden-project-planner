import { describe, expect, it } from "vitest";

import {
  addWorkingDays,
  computePlannedFinish,
  countWorkingDays,
  isWorkingDay,
  nextWorkingDayOnOrAfter,
  scheduleState,
} from "./calendar";

// 2026-10-05 is a Monday.
describe("working-day calendar", () => {
  it("treats Monday–Friday as working days", () => {
    expect(isWorkingDay("2026-10-05")).toBe(true);
    expect(isWorkingDay("2026-10-09")).toBe(true);
    expect(isWorkingDay("2026-10-10")).toBe(false);
    expect(isWorkingDay("2026-10-11")).toBe(false);
  });

  it("rolls weekends forward to Monday", () => {
    expect(nextWorkingDayOnOrAfter("2026-10-10")).toBe("2026-10-12");
    expect(nextWorkingDayOnOrAfter("2026-10-07")).toBe("2026-10-07");
  });

  it("adds working days skipping weekends", () => {
    expect(addWorkingDays("2026-10-05", 0)).toBe("2026-10-05");
    expect(addWorkingDays("2026-10-05", 4)).toBe("2026-10-09");
    expect(addWorkingDays("2026-10-09", 1)).toBe("2026-10-12");
    expect(addWorkingDays("2026-10-08", 5)).toBe("2026-10-15");
    expect(addWorkingDays("2026-10-05", 250)).toBe("2027-09-20");
    expect(() => addWorkingDays("2026-10-10", 1)).toThrow(RangeError);
    expect(() => addWorkingDays("2026-10-05", -1)).toThrow(RangeError);
  });

  it("agrees with countWorkingDays for many durations", () => {
    for (const start of ["2026-10-05", "2026-10-07", "2026-10-09", "2026-12-28"]) {
      for (let duration = 1; duration <= 40; duration += 1) {
        const finish = computePlannedFinish({ plannedStart: start, plannedDurationDays: duration, isMilestone: false });
        expect(finish).not.toBeNull();
        expect(countWorkingDays(start, finish as string)).toBe(duration);
        expect(isWorkingDay(finish as string)).toBe(true);
      }
    }
  });

  it("derives planned finish (start counts as day 1)", () => {
    expect(computePlannedFinish({ plannedStart: "2026-10-05", plannedDurationDays: 1, isMilestone: false })).toBe("2026-10-05");
    expect(computePlannedFinish({ plannedStart: "2026-10-05", plannedDurationDays: 5, isMilestone: false })).toBe("2026-10-09");
    expect(computePlannedFinish({ plannedStart: "2026-10-09", plannedDurationDays: 2, isMilestone: false })).toBe("2026-10-12");
  });

  it("leaves finish unknown until start and duration are both known", () => {
    expect(computePlannedFinish({ plannedStart: null, plannedDurationDays: 5, isMilestone: false })).toBeNull();
    expect(computePlannedFinish({ plannedStart: "2026-10-05", plannedDurationDays: null, isMilestone: false })).toBeNull();
  });

  it("finishes milestones on their start date, weekends included", () => {
    expect(computePlannedFinish({ plannedStart: "2026-11-08", plannedDurationDays: 0, isMilestone: true })).toBe("2026-11-08");
    expect(computePlannedFinish({ plannedStart: null, plannedDurationDays: 0, isMilestone: true })).toBeNull();
  });

  it("classifies schedule state", () => {
    expect(scheduleState({ plannedStart: null, plannedDurationDays: 3, isMilestone: false })).toBe("unscheduled");
    expect(scheduleState({ plannedStart: "2026-10-05", plannedDurationDays: null, isMilestone: false })).toBe("partial");
    expect(scheduleState({ plannedStart: "2026-10-05", plannedDurationDays: 3, isMilestone: false })).toBe("scheduled");
    expect(scheduleState({ plannedStart: "2026-10-05", plannedDurationDays: 0, isMilestone: true })).toBe("scheduled");
  });
});

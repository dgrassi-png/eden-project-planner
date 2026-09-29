import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  diffDays,
  isoWeekNumber,
  parseIsoDate,
  startOfIsoWeek,
  startOfQuarter,
  todayInTimeZone,
} from "./dates";

describe("dates", () => {
  it("rejects invalid ISO dates", () => {
    expect(() => parseIsoDate("2026-02-30")).toThrow(RangeError);
    expect(() => parseIsoDate("2026-9-1")).toThrow(RangeError);
  });

  it("does day arithmetic across DST and month boundaries", () => {
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30"); // EU DST starts 2026-03-29
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-10-01", "2026-09-29")).toBe(-2);
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-01");
  });

  it("aligns weeks to Monday and quarters to their first day", () => {
    expect(startOfIsoWeek("2026-09-29")).toBe("2026-09-28"); // Tuesday -> Monday
    expect(startOfIsoWeek("2026-10-04")).toBe("2026-09-28"); // Sunday -> Monday
    expect(startOfQuarter("2026-09-29")).toBe("2026-07-01");
  });

  it("computes ISO week numbers, including year edges", () => {
    expect(isoWeekNumber("2026-01-01")).toBe(1);
    expect(isoWeekNumber("2026-09-29")).toBe(40);
    expect(isoWeekNumber("2027-01-01")).toBe(53);
    expect(isoWeekNumber("2027-01-04")).toBe(1);
  });

  it("evaluates today in the planning timezone", () => {
    // 23:30 UTC on 29 Sep is already 30 Sep in Rome (UTC+2).
    expect(todayInTimeZone("Europe/Rome", new Date("2026-09-29T23:30:00Z"))).toBe("2026-09-30");
    expect(todayInTimeZone("UTC", new Date("2026-09-29T23:30:00Z"))).toBe("2026-09-29");
  });
});

import { describe, expect, it } from "vitest";

import { diffDays } from "./dates";
import { buildTimelineAxis, PX_PER_DAY, ZOOM_LEVELS } from "./scale";

const today = "2026-09-29";

describe("buildTimelineAxis", () => {
  it.each(ZOOM_LEVELS)("tiles the full range without gaps at %s zoom", (zoom) => {
    const axis = buildTimelineAxis({ today, zoom });
    for (const tier of [axis.upper, axis.lower]) {
      expect(tier[0]?.offsetPx).toBe(0);
      expect(tier.reduce((sum, s) => sum + s.widthPx, 0)).toBe(axis.totalWidthPx);
      tier.slice(1).forEach((segment, i) => {
        const previous = tier[i]!;
        expect(segment.offsetPx).toBe(previous.offsetPx + previous.widthPx);
      });
    }
    expect(axis.totalWidthPx).toBe(diffDays(axis.start, axis.end) * PX_PER_DAY[zoom]);
  });

  it("places today proportionally to its date", () => {
    const axis = buildTimelineAxis({ today, zoom: "week" });
    expect(axis.start).toBe("2026-08-31");
    expect(axis.todayOffsetPx).toBe(29 * PX_PER_DAY.week);
  });

  it("labels month and quarter tiers", () => {
    const month = buildTimelineAxis({ today, zoom: "month" });
    expect(month.lower[0]).toMatchObject({ key: "2026-08-01", label: "Aug" });
    const quarter = buildTimelineAxis({ today, zoom: "quarter" });
    expect(quarter.lower.map((s) => s.label).slice(0, 3)).toEqual(["Q2", "Q3", "Q4"]);
    expect(quarter.upper[0]?.label).toBe("2026");
  });

  it("clips partial segments to an explicit range and hides today when out of range", () => {
    const axis = buildTimelineAxis({ today, zoom: "month", range: { start: "2027-01-15", end: "2027-03-10" } });
    expect(axis.lower.map((s) => [s.label, s.widthPx / axis.pxPerDay])).toEqual([
      ["Jan", 17],
      ["Feb", 28],
      ["Mar", 9],
    ]);
    expect(axis.todayOffsetPx).toBeNull();
  });

  it("rejects empty ranges", () => {
    expect(() => buildTimelineAxis({ today, zoom: "week", range: { start: today, end: today } })).toThrow(RangeError);
  });
});

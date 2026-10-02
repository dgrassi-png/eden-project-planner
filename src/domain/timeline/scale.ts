import {
  addDays,
  addMonths,
  diffDays,
  isoWeekNumber,
  parseIsoDate,
  startOfIsoWeek,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  type IsoDate,
} from "./dates";

/**
 * Timeline scale: maps calendar dates to horizontal pixel offsets.
 *
 * This is the date axis only (header tiers, today marker, gridlines). Task
 * bars, dependencies and drag/resize belong to the Gantt phase and must be
 * positioned through the same `dateToOffsetPx` mapping.
 */

export const ZOOM_LEVELS = ["week", "month", "quarter"] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

export const PX_PER_DAY: Record<ZoomLevel, number> = {
  week: 24,
  month: 6,
  quarter: 2,
};

export interface AxisSegment {
  key: string;
  label: string;
  start: IsoDate;
  offsetPx: number;
  widthPx: number;
}

export interface TimelineAxis {
  zoom: ZoomLevel;
  /** Inclusive range start. */
  start: IsoDate;
  /** Exclusive range end. */
  end: IsoDate;
  pxPerDay: number;
  totalWidthPx: number;
  /** Coarse header tier (months or years). */
  upper: AxisSegment[];
  /** Fine header tier (weeks, months or quarters); also drives gridlines. */
  lower: AxisSegment[];
  todayOffsetPx: number | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(value: IsoDate): string {
  return MONTHS[parseIsoDate(value).getUTCMonth()] ?? value;
}

function buildSegments(
  rangeStart: IsoDate,
  rangeEnd: IsoDate,
  pxPerDay: number,
  alignStart: (value: IsoDate) => IsoDate,
  next: (value: IsoDate) => IsoDate,
  label: (value: IsoDate) => string,
): AxisSegment[] {
  const segments: AxisSegment[] = [];
  let cursor = alignStart(rangeStart);
  while (cursor < rangeEnd) {
    const following = next(cursor);
    const clippedStart = cursor < rangeStart ? rangeStart : cursor;
    const clippedEnd = following > rangeEnd ? rangeEnd : following;
    segments.push({
      key: cursor,
      label: label(cursor),
      start: clippedStart,
      offsetPx: diffDays(rangeStart, clippedStart) * pxPerDay,
      widthPx: diffDays(clippedStart, clippedEnd) * pxPerDay,
    });
    cursor = following;
  }
  return segments;
}

const nextWeek = (value: IsoDate) => addDays(value, 7);
const nextMonth = (value: IsoDate) => addMonths(value, 1);
const nextQuarter = (value: IsoDate) => addMonths(value, 3);
const nextYear = (value: IsoDate) => addMonths(value, 12);

export function defaultRange(today: IsoDate, zoom: ZoomLevel): { start: IsoDate; end: IsoDate } {
  switch (zoom) {
    case "week":
      return { start: startOfIsoWeek(addDays(today, -28)), end: startOfIsoWeek(addDays(today, 7 * 26)) };
    case "month":
      return { start: startOfMonth(addMonths(today, -1)), end: startOfMonth(addMonths(today, 12)) };
    case "quarter":
      return { start: startOfQuarter(addMonths(today, -3)), end: startOfQuarter(addMonths(today, 27)) };
  }
}

export function buildTimelineAxis(params: {
  today: IsoDate;
  zoom: ZoomLevel;
  range?: { start: IsoDate; end: IsoDate };
}): TimelineAxis {
  const { today, zoom } = params;
  const { start, end } = params.range ?? defaultRange(today, zoom);
  if (end <= start) throw new RangeError("Timeline range end must be after start");

  const pxPerDay = PX_PER_DAY[zoom];
  const segments = (
    align: (v: IsoDate) => IsoDate,
    next: (v: IsoDate) => IsoDate,
    label: (v: IsoDate) => string,
  ) => buildSegments(start, end, pxPerDay, align, next, label);

  const yearLabel = (v: IsoDate) => v.slice(0, 4);
  const upper =
    zoom === "week"
      ? segments(startOfMonth, nextMonth, (v) => `${monthLabel(v)} ${v.slice(0, 4)}`)
      : segments(startOfYear, nextYear, yearLabel);

  const lower =
    zoom === "week"
      ? segments(startOfIsoWeek, nextWeek, (v) => `W${isoWeekNumber(v)}`)
      : zoom === "month"
        ? segments(startOfMonth, nextMonth, monthLabel)
        : segments(startOfQuarter, nextQuarter, (v) => `Q${Math.floor(parseIsoDate(v).getUTCMonth() / 3) + 1}`);

  const inRange = today >= start && today < end;

  return {
    zoom,
    start,
    end,
    pxPerDay,
    totalWidthPx: diffDays(start, end) * pxPerDay,
    upper,
    lower,
    todayOffsetPx: inRange ? dateToOffsetPx(start, today, pxPerDay) : null,
  };
}

export function dateToOffsetPx(axisStart: IsoDate, value: IsoDate, pxPerDay: number): number {
  return diffDays(axisStart, value) * pxPerDay;
}

const ALIGN: Record<ZoomLevel, (value: IsoDate) => IsoDate> = {
  week: startOfIsoWeek,
  month: startOfMonth,
  quarter: startOfQuarter,
};

/**
 * Range covering the default window around today plus every planned date,
 * with one zoom unit of padding. Tasks are never positioned outside the axis.
 */
export function rangeForDates(today: IsoDate, zoom: ZoomLevel, dates: IsoDate[]): { start: IsoDate; end: IsoDate } {
  const base = defaultRange(today, zoom);
  if (!dates.length) return base;
  const sorted = [...dates].sort();
  const min = sorted[0] as IsoDate;
  const max = sorted[sorted.length - 1] as IsoDate;
  const padStart = zoom === "week" ? addDays(min, -7) : addMonths(min, zoom === "month" ? -1 : -3);
  const padEnd = zoom === "week" ? addDays(max, 14) : addMonths(max, zoom === "month" ? 2 : 6);
  const start = ALIGN[zoom](padStart);
  const end = ALIGN[zoom](padEnd);
  return { start: start < base.start ? start : base.start, end: end > base.end ? end : base.end };
}

/**
 * Weekend shading as a repeating 7-day pattern: returns the offset (px) of the
 * first Saturday from the axis start, so a CSS gradient can tile it.
 */
export function weekendPattern(axis: Pick<TimelineAxis, "start" | "pxPerDay">): { periodPx: number; firstSaturdayPx: number; widthPx: number } {
  const weekday = (parseIsoDate(axis.start).getUTCDay() + 6) % 7; // Monday = 0
  const daysToSaturday = (5 - weekday + 7) % 7;
  return { periodPx: 7 * axis.pxPerDay, firstSaturdayPx: daysToSaturday * axis.pxPerDay, widthPx: 2 * axis.pxPerDay };
}

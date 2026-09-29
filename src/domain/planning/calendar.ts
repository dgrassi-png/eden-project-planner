import { addDays, parseIsoDate, type IsoDate } from "../timeline/dates";

/**
 * Working-day calendar. V0 uses Monday–Friday with no public holidays;
 * holidays can be added here later without changing callers.
 *
 * Duration convention: the start day counts as day 1, so a 1-day task
 * finishes on its start day and a 5-day task starting Monday finishes Friday.
 */

export function isWorkingDay(date: IsoDate): boolean {
  const weekday = parseIsoDate(date).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

/** The given date if it is a working day, otherwise the next working day. */
export function nextWorkingDayOnOrAfter(date: IsoDate): IsoDate {
  let cursor = date;
  while (!isWorkingDay(cursor)) cursor = addDays(cursor, 1);
  return cursor;
}

/** Moves `count` working days forward from a working day (`count` >= 0). */
export function addWorkingDays(start: IsoDate, count: number): IsoDate {
  if (!Number.isInteger(count) || count < 0) throw new RangeError("count must be a non-negative integer");
  if (!isWorkingDay(start)) throw new RangeError(`${start} is not a working day`);
  let cursor = start;
  let remaining = count;
  // Skip whole weeks first to keep long durations cheap.
  cursor = addDays(cursor, Math.floor(remaining / 5) * 7);
  remaining %= 5;
  while (remaining > 0) {
    cursor = addDays(cursor, 1);
    if (isWorkingDay(cursor)) remaining -= 1;
  }
  return cursor;
}

/** Working days from `start` to `finish`, both inclusive. 0 if finish < start. */
export function countWorkingDays(start: IsoDate, finish: IsoDate): number {
  let count = 0;
  for (let cursor = start; cursor <= finish; cursor = addDays(cursor, 1)) {
    if (isWorkingDay(cursor)) count += 1;
  }
  return count;
}

export interface SchedulingFields {
  plannedStart: IsoDate | null;
  plannedDurationDays: number | null;
  isMilestone: boolean;
}

/**
 * Planned finish derived from start + working-day duration.
 * `null` while either input is unknown. Milestones finish on their start date.
 */
export function computePlannedFinish({ plannedStart, plannedDurationDays, isMilestone }: SchedulingFields): IsoDate | null {
  if (plannedStart === null) return null;
  if (isMilestone) return plannedStart;
  if (plannedDurationDays === null) return null;
  return addWorkingDays(plannedStart, plannedDurationDays - 1);
}

export type ScheduleState = "unscheduled" | "partial" | "scheduled";

/**
 * - unscheduled: no start date (a duration estimate may exist)
 * - partial: start known, duration not validated yet
 * - scheduled: start and finish known
 */
export function scheduleState(fields: SchedulingFields): ScheduleState {
  if (fields.plannedStart === null) return "unscheduled";
  if (!fields.isMilestone && fields.plannedDurationDays === null) return "partial";
  return "scheduled";
}

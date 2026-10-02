/**
 * Date-only helpers for planning dates (`YYYY-MM-DD`).
 *
 * Planning dates are calendar days with no time component; all arithmetic is
 * done in UTC to avoid DST shifts.
 */

export type IsoDate = string;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function parseIsoDate(value: IsoDate): Date {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) throw new RangeError(`Invalid ISO date: ${value}`);
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (toIsoDate(date) !== value) throw new RangeError(`Invalid ISO date: ${value}`);
  return date;
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: IsoDate, days: number): IsoDate {
  return toIsoDate(new Date(parseIsoDate(value).getTime() + days * MS_PER_DAY));
}

export function addMonths(value: IsoDate, months: number): IsoDate {
  const date = parseIsoDate(value);
  return toIsoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)));
}

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / MS_PER_DAY);
}

/** Monday of the ISO week containing `value`. */
export function startOfIsoWeek(value: IsoDate): IsoDate {
  const weekday = (parseIsoDate(value).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(value, -weekday);
}

export function startOfMonth(value: IsoDate): IsoDate {
  return `${value.slice(0, 7)}-01`;
}

export function startOfQuarter(value: IsoDate): IsoDate {
  const date = parseIsoDate(value);
  const month = Math.floor(date.getUTCMonth() / 3) * 3;
  return toIsoDate(new Date(Date.UTC(date.getUTCFullYear(), month, 1)));
}

export function startOfYear(value: IsoDate): IsoDate {
  return `${value.slice(0, 4)}-01-01`;
}

/** ISO-8601 week number (weeks start Monday; week 1 contains the first Thursday). */
export function isoWeekNumber(value: IsoDate): number {
  const thursday = addDays(startOfIsoWeek(value), 3);
  const firstThursdayYearStart = startOfYear(thursday);
  return Math.floor(diffDays(firstThursdayYearStart, thursday) / 7) + 1;
}

/** Current calendar date in the given IANA timezone. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

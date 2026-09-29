import {
  computePlannedFinish,
  countWorkingDays,
  isWorkingDay,
  nextWorkingDayOnOrAfter,
  previousWorkingDayOnOrBefore,
} from "../planning/calendar";

import { addDays, diffDays, type IsoDate } from "./dates";

/**
 * Gantt geometry and drag/resize rules. Pure and framework-free.
 *
 * Bars are positioned from the task's stored dates only. Nothing is drawn for
 * values that are not known. Dragging produces a *proposed* change, which the
 * caller persists; the database stays authoritative.
 */

export interface GanttTaskDates {
  plannedStart: IsoDate | null;
  plannedDurationDays: number | null;
  plannedFinish: IsoDate | null;
  isMilestone: boolean;
}

export type BarGeometry =
  /** Scheduled task: spans start day to finish day (inclusive). */
  | { kind: "bar"; left: number; width: number }
  /** Milestone: a diamond centred on its date. */
  | { kind: "milestone"; center: number }
  /** Start known, duration not validated yet: a start marker only. */
  | { kind: "start-only"; left: number };

export function barGeometry(task: GanttTaskDates, axisStart: IsoDate, pxPerDay: number): BarGeometry | null {
  if (task.plannedStart === null) return null;
  const left = diffDays(axisStart, task.plannedStart) * pxPerDay;
  if (task.isMilestone) return { kind: "milestone", center: left + pxPerDay / 2 };
  if (task.plannedFinish === null) return { kind: "start-only", left };
  return { kind: "bar", left, width: (diffDays(task.plannedStart, task.plannedFinish) + 1) * pxPerDay };
}

/** Whole days represented by a horizontal pointer movement. */
export function dragDeltaDays(dx: number, pxPerDay: number): number {
  const days = Math.round(dx / pxPerDay);
  return days === 0 ? 0 : days; // normalise -0
}

/**
 * New start after moving a task by `deltaDays` calendar days. Task starts
 * snap to a working day in the direction of the move; milestones may land on
 * any day. Returns null when nothing would change.
 */
export function movedStart(task: GanttTaskDates, deltaDays: number): IsoDate | null {
  if (task.plannedStart === null || deltaDays === 0) return null;
  const raw = addDays(task.plannedStart, deltaDays);
  const next =
    task.isMilestone || isWorkingDay(raw)
      ? raw
      : deltaDays > 0
        ? nextWorkingDayOnOrAfter(raw)
        : previousWorkingDayOnOrBefore(raw);
  return next === task.plannedStart ? null : next;
}

/**
 * New duration (working days) after dragging the finish edge by `deltaDays`.
 * The finish snaps back to a working day and the task keeps at least one
 * working day. Returns null when nothing would change or the task cannot be
 * resized (milestone / not scheduled).
 */
export function resizedDuration(task: GanttTaskDates, deltaDays: number): number | null {
  if (task.isMilestone || task.plannedStart === null || task.plannedFinish === null || deltaDays === 0) return null;
  const target = previousWorkingDayOnOrBefore(addDays(task.plannedFinish, deltaDays));
  const duration = target < task.plannedStart ? 1 : countWorkingDays(task.plannedStart, target);
  return duration === task.plannedDurationDays ? null : duration;
}

/** Dates of a task after a proposed change, with the finish re-derived. */
export function previewDates(
  task: GanttTaskDates,
  change: { plannedStart?: IsoDate; plannedDurationDays?: number },
): GanttTaskDates {
  const next = {
    plannedStart: change.plannedStart ?? task.plannedStart,
    plannedDurationDays: change.plannedDurationDays ?? task.plannedDurationDays,
    isMilestone: task.isMilestone,
  };
  return { ...next, plannedFinish: computePlannedFinish(next) };
}

export interface Point {
  x: number;
  y: number;
}

/**
 * SVG path for a Finish-to-Start arrow from the end of the predecessor to the
 * start of the successor. When the successor starts before the predecessor
 * ends, the path loops back between the rows.
 */
export function dependencyPath(from: Point, to: Point, rowHeight: number, gap = 8): string {
  const startX = from.x + gap;
  const endX = to.x - gap;
  if (endX >= startX) {
    const midX = startX + (endX - startX) / 2;
    return `M ${from.x} ${from.y} H ${midX} V ${to.y} H ${to.x}`;
  }
  const direction = to.y >= from.y ? 1 : -1;
  const betweenY = from.y + (direction * rowHeight) / 2;
  return `M ${from.x} ${from.y} H ${startX} V ${betweenY} H ${endX} V ${to.y} H ${to.x}`;
}

/** Anchor points used for dependency arrows, or null when the date is unknown. */
export function arrowAnchors(geometry: BarGeometry | null, milestoneRadius: number): { start: number; end: number } | null {
  if (!geometry) return null;
  switch (geometry.kind) {
    case "bar":
      return { start: geometry.left, end: geometry.left + geometry.width };
    case "milestone":
      return { start: geometry.center - milestoneRadius, end: geometry.center + milestoneRadius };
    case "start-only":
      return null; // finish unknown: no reliable anchor
  }
}

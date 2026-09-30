import { addDays, diffDays, type IsoDate } from "../timeline/dates";

import { addWorkingDays, computePlannedFinish, countWorkingDays, isWorkingDay, nextWorkingDayOnOrAfter } from "./calendar";
import type { TaskStatus } from "./constants";
import type { Task, TaskDependency } from "./types";

/**
 * Finish-to-Start scheduling engine (pure).
 *
 * - A successor may start on the first working day after its predecessor's
 *   finish, plus `lag` working days. A milestone successor may fall on any
 *   calendar day after that point.
 * - Violations are reported, never fixed silently. A cascade is a separate,
 *   explicit plan that only moves tasks forward and never moves DONE or
 *   CANCELLED tasks.
 * - Tasks without a validated start or finish are never given dates: a
 *   constraint that depends on them is "unknown".
 */

export type SchedulingTask = Pick<
  Task,
  "id" | "edenCode" | "status" | "isMilestone" | "plannedStart" | "plannedDurationDays" | "plannedFinish"
>;
export type SchedulingDependency = Pick<TaskDependency, "id" | "predecessorTaskId" | "successorTaskId" | "lagDays">;

export type TaskDates = Pick<SchedulingTask, "plannedStart" | "plannedDurationDays" | "plannedFinish">;

/** Statuses that are never moved by a cascade (history is protected). */
export const LOCKED_STATUSES: readonly TaskStatus[] = ["DONE", "CANCELLED"];

export const isLocked = (status: TaskStatus): boolean => LOCKED_STATUSES.includes(status);

function nextWorkingDayAfter(date: IsoDate): IsoDate {
  return nextWorkingDayOnOrAfter(addDays(date, 1));
}

/** Earliest allowed start of a successor, given its predecessor's finish and the lag. */
export function earliestSuccessorStart(predecessorFinish: IsoDate, lagDays: number, successorIsMilestone: boolean): IsoDate {
  const anchor = lagDays > 0 ? addWorkingDays(nextWorkingDayAfter(predecessorFinish), lagDays - 1) : predecessorFinish;
  return successorIsMilestone ? addDays(anchor, 1) : nextWorkingDayAfter(anchor);
}

/**
 * How far the successor must move forward to satisfy the constraint:
 * working days for tasks, calendar days for milestones. 0 when satisfied.
 */
export function conflictDays(start: IsoDate, earliest: IsoDate, isMilestone: boolean): number {
  if (start >= earliest) return 0;
  if (isMilestone || !isWorkingDay(start)) return diffDays(start, earliest);
  return countWorkingDays(start, earliest) - 1;
}

export type DependencyState = "ok" | "violated" | "unknown" | "inactive";

export interface DependencyCheck {
  dependencyId: string;
  predecessorTaskId: string;
  successorTaskId: string;
  predecessorCode: string;
  successorCode: string;
  lagDays: number;
  state: DependencyState;
  /** Earliest allowed successor start, when the predecessor finish is known. */
  earliestStart: IsoDate | null;
  /** Days the successor would have to move forward (0 unless violated). */
  conflictDays: number;
  /** The successor is DONE or CANCELLED: a cascade will never move it. */
  successorLocked: boolean;
}

export function checkDependency(
  dependency: SchedulingDependency,
  predecessor: SchedulingTask,
  successor: SchedulingTask,
): DependencyCheck {
  const base = {
    dependencyId: dependency.id,
    predecessorTaskId: predecessor.id,
    successorTaskId: successor.id,
    predecessorCode: predecessor.edenCode,
    successorCode: successor.edenCode,
    lagDays: dependency.lagDays,
    successorLocked: isLocked(successor.status),
  };
  if (predecessor.status === "CANCELLED" || successor.status === "CANCELLED") {
    return { ...base, state: "inactive", earliestStart: null, conflictDays: 0 };
  }
  if (predecessor.plannedFinish === null) return { ...base, state: "unknown", earliestStart: null, conflictDays: 0 };
  const earliestStart = earliestSuccessorStart(predecessor.plannedFinish, dependency.lagDays, successor.isMilestone);
  if (successor.plannedStart === null) return { ...base, state: "unknown", earliestStart, conflictDays: 0 };
  const days = conflictDays(successor.plannedStart, earliestStart, successor.isMilestone);
  return { ...base, state: days > 0 ? "violated" : "ok", earliestStart, conflictDays: days };
}

/** Checks every dependency of a project. Dependencies with a missing task are skipped. */
export function checkDependencies(tasks: SchedulingTask[], dependencies: SchedulingDependency[]): DependencyCheck[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return dependencies.flatMap((dependency) => {
    const predecessor = byId.get(dependency.predecessorTaskId);
    const successor = byId.get(dependency.successorTaskId);
    return predecessor && successor ? [checkDependency(dependency, predecessor, successor)] : [];
  });
}

export const violationsOf = (checks: DependencyCheck[]) => checks.filter((c) => c.state === "violated");

/** "Moving TEC-001 creates a 5-day conflict with TEC-002." */
export function describeViolation(check: DependencyCheck): string {
  const unit = check.conflictDays === 1 ? "day" : "days";
  return `${check.successorCode} starts ${check.conflictDays} ${unit} before ${check.predecessorCode} allows (earliest ${check.earliestStart})`;
}

// Cascade ---------------------------------------------------------------------

export interface CascadeMove {
  taskId: string;
  edenCode: string;
  fromStart: IsoDate;
  fromFinish: IsoDate | null;
  toStart: IsoDate;
  toFinish: IsoDate | null;
  /** Days moved forward (working days for tasks, calendar days for milestones). */
  shiftDays: number;
  /** Predecessor whose constraint forced the move. */
  causedByCode: string;
}

export interface CascadeBlocked {
  taskId: string;
  edenCode: string;
  status: TaskStatus;
  conflictDays: number;
  causedByCode: string;
}

export interface CascadePlan {
  moves: CascadeMove[];
  /** DONE / CANCELLED successors left in conflict: they are never moved automatically. */
  blocked: CascadeBlocked[];
}

/**
 * Forward-only cascade from `rootTaskId`: every downstream task that would
 * start before its constraints allow is moved to the earliest allowed start,
 * keeping its duration. Tasks are never moved earlier. DONE and CANCELLED
 * tasks are reported as blocked and not moved. `overrides` holds the proposed
 * dates of tasks being edited (e.g. the dragged task).
 */
export function planCascade(
  tasks: SchedulingTask[],
  dependencies: SchedulingDependency[],
  rootTaskId: string,
  overrides: ReadonlyMap<string, TaskDates> = new Map(),
): CascadePlan {
  const current = new Map(tasks.map((t) => [t.id, { ...t, ...(overrides.get(t.id) ?? {}) }]));
  const outgoing = new Map<string, SchedulingDependency[]>();
  const incoming = new Map<string, SchedulingDependency[]>();
  for (const d of dependencies) {
    if (!current.has(d.predecessorTaskId) || !current.has(d.successorTaskId)) continue;
    outgoing.set(d.predecessorTaskId, [...(outgoing.get(d.predecessorTaskId) ?? []), d]);
    incoming.set(d.successorTaskId, [...(incoming.get(d.successorTaskId) ?? []), d]);
  }

  // Tasks reachable from the root, then a topological order restricted to them.
  const reachable = new Set<string>([rootTaskId]);
  const stack = [rootTaskId];
  while (stack.length) {
    for (const d of outgoing.get(stack.pop() as string) ?? []) {
      if (!reachable.has(d.successorTaskId)) {
        reachable.add(d.successorTaskId);
        stack.push(d.successorTaskId);
      }
    }
  }
  const indegree = new Map<string, number>();
  for (const id of reachable) {
    indegree.set(id, (incoming.get(id) ?? []).filter((d) => reachable.has(d.predecessorTaskId)).length);
  }
  const queue = [...reachable].filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift() as string;
    order.push(id);
    for (const d of outgoing.get(id) ?? []) {
      const left = (indegree.get(d.successorTaskId) ?? 0) - 1;
      indegree.set(d.successorTaskId, left);
      if (left === 0) queue.push(d.successorTaskId);
    }
  }

  const moves: CascadeMove[] = [];
  const blocked: CascadeBlocked[] = [];
  for (const id of order) {
    if (id === rootTaskId) continue;
    const task = current.get(id);
    if (!task || task.plannedStart === null) continue; // unscheduled: never invent a date
    let earliest: IsoDate | null = null;
    let causedBy = "";
    for (const d of incoming.get(id) ?? []) {
      const predecessor = current.get(d.predecessorTaskId);
      if (!predecessor || predecessor.plannedFinish === null || predecessor.status === "CANCELLED") continue;
      const candidate = earliestSuccessorStart(predecessor.plannedFinish, d.lagDays, task.isMilestone);
      if (earliest === null || candidate > earliest) {
        earliest = candidate;
        causedBy = predecessor.edenCode;
      }
    }
    if (earliest === null || task.plannedStart >= earliest) continue;
    const shift = conflictDays(task.plannedStart, earliest, task.isMilestone);
    if (isLocked(task.status)) {
      blocked.push({ taskId: id, edenCode: task.edenCode, status: task.status, conflictDays: shift, causedByCode: causedBy });
      continue;
    }
    const toFinish = computePlannedFinish({ ...task, plannedStart: earliest });
    moves.push({
      taskId: id,
      edenCode: task.edenCode,
      fromStart: task.plannedStart,
      fromFinish: task.plannedFinish,
      toStart: earliest,
      toFinish,
      shiftDays: shift,
      causedByCode: causedBy,
    });
    current.set(id, { ...task, plannedStart: earliest, plannedFinish: toFinish });
  }
  return { moves, blocked };
}

// Impact of a single change -----------------------------------------------------

export interface ChangeImpact {
  /** Violations on this task's dependencies after the change that did not exist (or were smaller) before. */
  created: DependencyCheck[];
  /** Violations that the change removes. */
  resolved: DependencyCheck[];
  /** Every violation on this task's dependencies after the change. */
  after: DependencyCheck[];
  cascade: CascadePlan;
}

export function impactOfChange(
  tasks: SchedulingTask[],
  dependencies: SchedulingDependency[],
  taskId: string,
  next: TaskDates,
): ChangeImpact {
  const touching = dependencies.filter((d) => d.predecessorTaskId === taskId || d.successorTaskId === taskId);
  const before = new Map(violationsOf(checkDependencies(tasks, touching)).map((c) => [c.dependencyId, c]));
  const nextTasks = tasks.map((t) => (t.id === taskId ? { ...t, ...next } : t));
  const after = violationsOf(checkDependencies(nextTasks, touching));
  const afterIds = new Set(after.map((c) => c.dependencyId));
  return {
    created: after.filter((c) => (before.get(c.dependencyId)?.conflictDays ?? 0) < c.conflictDays),
    resolved: [...before.values()].filter((c) => !afterIds.has(c.dependencyId)),
    after,
    cascade: planCascade(tasks, dependencies, taskId, new Map([[taskId, next]])),
  };
}

/** Human summary used by the UI and the API. */
export function describeImpact(movedCode: string, impact: ChangeImpact): string[] {
  return impact.created.map((c) =>
    c.predecessorCode === movedCode
      ? `Moving ${movedCode} creates a ${c.conflictDays}-day conflict with ${c.successorCode}.`
      : `${movedCode} would start ${c.conflictDays} day(s) before ${c.predecessorCode} allows (earliest ${c.earliestStart}).`,
  );
}

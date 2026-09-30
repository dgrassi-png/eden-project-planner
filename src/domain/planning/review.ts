import { addDays, type IsoDate } from "../timeline/dates";

import { scheduleState } from "./calendar";
import type { DependencyCheck } from "./scheduling";
import type { AuditEvent, Member, PlanningSnapshot, Task } from "./types";

/**
 * Weekly Review and project health (Product Definition §15, §29, §30).
 * Every indicator is an objective condition on planning data, never a score.
 */

export interface ReviewItem {
  taskId: string;
  code: string;
  title: string;
  owner: string | null;
  status: Task["status"];
  priority: Task["priority"];
  start: IsoDate | null;
  finish: IsoDate | null;
  /** Why the task is listed, e.g. "Finish 2026-10-09 has passed". */
  note: string | null;
}

export interface WeeklyReview {
  today: IsoDate;
  since: IsoDate;
  completed: ReviewItem[];
  inProgress: ReviewItem[];
  blocked: ReviewItem[];
  blockedP0: ReviewItem[];
  slipping: ReviewItem[];
  upcoming: ReviewItem[];
  milestones: (ReviewItem & { atRisk: boolean })[];
  decisions: ReviewItem[];
  unplanned: ReviewItem[];
  violations: DependencyCheck[];
  dataQuality: { noOwner: ReviewItem[]; noDuration: ReviewItem[]; unscheduled: ReviewItem[] };
}

const OPEN = (t: Task) => t.status !== "DONE" && t.status !== "CANCELLED";

export function buildWeeklyReview(input: {
  snapshot: PlanningSnapshot;
  checks: DependencyCheck[];
  /** Audit events of the review window (any order). */
  audit: AuditEvent[];
  today: IsoDate;
  windowDays?: number;
  horizonDays?: number;
}): WeeklyReview {
  const { snapshot, checks, today } = input;
  const windowDays = input.windowDays ?? 7;
  const horizon = addDays(today, input.horizonDays ?? 14);
  const since = addDays(today, -windowDays);
  const members = new Map<string, Member>(snapshot.members.map((m) => [m.id, m]));
  const item = (task: Task, note: string | null = null): ReviewItem => ({
    taskId: task.id,
    code: task.edenCode,
    title: task.title,
    owner: task.ownerMemberId ? (members.get(task.ownerMemberId)?.displayName ?? null) : null,
    status: task.status,
    priority: task.priority,
    start: task.plannedStart,
    finish: task.plannedFinish,
    note,
  });
  const byCode = (a: ReviewItem, b: ReviewItem) => a.code.localeCompare(b.code, "en", { numeric: true });
  const tasks = snapshot.tasks;
  const open = tasks.filter(OPEN);

  const doneIds = new Set(
    input.audit
      .filter((e) => e.entityType === "tasks" && e.action === "UPDATE" && e.after?.status === "DONE" && e.before?.status !== "DONE" && e.createdAt >= since)
      .map((e) => e.entityId),
  );
  const createdIds = new Set(
    input.audit.filter((e) => e.entityType === "tasks" && e.action === "CREATE" && e.createdAt >= since).map((e) => e.entityId),
  );

  const isBlocked = (t: Task) => t.status === "WAITING_BLOCKED" || (t.blocker !== null && OPEN(t));
  const violatedSuccessors = new Map<string, DependencyCheck[]>();
  for (const c of checks.filter((c) => c.state === "violated")) {
    violatedSuccessors.set(c.successorTaskId, [...(violatedSuccessors.get(c.successorTaskId) ?? []), c]);
  }

  const slipping: ReviewItem[] = [];
  for (const t of open) {
    if (t.plannedFinish !== null && t.plannedFinish < today) slipping.push(item(t, `Planned finish ${t.plannedFinish} has passed`));
    else if (t.plannedStart !== null && t.plannedStart < today && (t.status === "BACKLOG" || t.status === "READY"))
      slipping.push(item(t, `Planned to start ${t.plannedStart}, not started`));
    else if (t.deadline !== null && t.plannedFinish !== null && t.plannedFinish > t.deadline)
      slipping.push(item(t, `Finish ${t.plannedFinish} is after the deadline ${t.deadline}`));
    else if (t.deadline !== null && t.deadline < today) slipping.push(item(t, `Deadline ${t.deadline} has passed`));
  }

  // A milestone is at risk when a constraint into it is violated or a predecessor is slipping.
  const slippingIds = new Set(slipping.map((s) => s.taskId));
  const predecessorsOf = (id: string) => snapshot.dependencies.filter((d) => d.successorTaskId === id).map((d) => d.predecessorTaskId);
  const milestones = open
    .filter((t) => t.isMilestone && (t.plannedStart === null || t.plannedStart <= addDays(today, 90)))
    .map((t) => {
      const atRisk = violatedSuccessors.has(t.id) || predecessorsOf(t.id).some((id) => slippingIds.has(id));
      return { ...item(t, t.plannedStart === null ? "Not scheduled" : atRisk ? "A predecessor is late or in conflict" : null), atRisk };
    })
    .sort((a, b) => (a.start ?? "9999").localeCompare(b.start ?? "9999") || byCode(a, b));

  const blocked = open.filter(isBlocked).map((t) => item(t, t.blocker ?? t.waitingFor)).sort(byCode);

  return {
    today,
    since,
    completed: tasks.filter((t) => t.status === "DONE" && doneIds.has(t.id)).map((t) => item(t)).sort(byCode),
    inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").map((t) => item(t, t.progressPercent === null ? null : `${t.progressPercent}%`)).sort(byCode),
    blocked,
    blockedP0: blocked.filter((b) => b.priority === "P0"),
    slipping: slipping.sort(byCode),
    upcoming: open
      .filter((t) => !t.isMilestone && t.plannedStart !== null && t.plannedStart >= today && t.plannedStart <= horizon)
      .map((t) => item(t))
      .sort((a, b) => (a.start as string).localeCompare(b.start as string) || byCode(a, b)),
    milestones,
    decisions: open.filter((t) => t.waitingFor !== null).map((t) => item(t, `Waiting for: ${t.waitingFor}`)).sort(byCode),
    unplanned: tasks.filter((t) => createdIds.has(t.id)).map((t) => item(t)).sort(byCode),
    violations: checks.filter((c) => c.state === "violated"),
    dataQuality: {
      noOwner: open.filter((t) => t.ownerMemberId === null).map((t) => item(t)).sort(byCode),
      noDuration: open.filter((t) => !t.isMilestone && t.plannedDurationDays === null).map((t) => item(t)).sort(byCode),
      unscheduled: open.filter((t) => scheduleState(t) === "unscheduled").map((t) => item(t)).sort(byCode),
    },
  };
}

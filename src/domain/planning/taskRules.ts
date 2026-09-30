import { fail, issue, ok, type Issue, type Result } from "../result";
import { parseIsoDate, type IsoDate } from "../timeline/dates";

import { computePlannedFinish, isWorkingDay } from "./calendar";
import type { Geography, TaskPriority, TaskStatus } from "./constants";
import { isValidEdenCode, normalizeCode, parseEdenCode } from "./edenCode";
import type { Member, Task, Workstream } from "./types";

export const TASK_TITLE_MAX = 200;
export const TASK_DESCRIPTION_MAX = 10_000;
/** Sanity bound (~4 years of working days) to catch typos. */
export const TASK_DURATION_MAX_DAYS = 1_000;
export const TASK_CONTEXT_MAX = 2_000;
export const TASK_NOTES_MAX = 10_000;

/** Fields a user may set when creating a task. */
export interface NewTaskInput {
  edenCode: string;
  title: string;
  /** Required for top-level tasks; subtasks inherit the parent's workstream. */
  workstreamId?: string | null;
  parentTaskId?: string | null;
  description?: string | null;
  ownerMemberId?: string | null;
  plannedStart?: IsoDate | null;
  plannedDurationDays?: number | null;
  status?: TaskStatus;
  priority?: TaskPriority | null;
  geography?: Geography | null;
  isMilestone?: boolean;
  progressPercent?: number | null;
  deadline?: IsoDate | null;
  blocker?: string | null;
  waitingFor?: string | null;
  notes?: string | null;
  splittable?: boolean | null;
  sortOrder?: number;
}

/** Updatable fields. The E:DEN code, parent and project are permanent. */
export type TaskPatch = Partial<Omit<NewTaskInput, "edenCode" | "parentTaskId">>;

/** Normalised, validated task ready to persist. */
export interface TaskDraft {
  projectId: string;
  workstreamId: string;
  parentTaskId: string | null;
  edenCode: string;
  title: string;
  description: string | null;
  ownerMemberId: string | null;
  plannedStart: IsoDate | null;
  plannedDurationDays: number | null;
  plannedFinish: IsoDate | null;
  status: TaskStatus;
  priority: TaskPriority | null;
  geography: Geography | null;
  isMilestone: boolean;
  progressPercent: number | null;
  deadline: IsoDate | null;
  blocker: string | null;
  waitingFor: string | null;
  notes: string | null;
  splittable: boolean | null;
  sortOrder: number;
}

export type TaskChanges = Partial<Omit<TaskDraft, "projectId" | "edenCode" | "parentTaskId">>;

/** Current project state the rules need. */
export interface TaskRuleContext {
  projectId: string;
  workstreams: Pick<Workstream, "id">[];
  members: Pick<Member, "id">[];
  tasks: Pick<Task, "id" | "edenCode" | "parentTaskId" | "isMilestone" | "workstreamId">[];
}

type PlanningFields = Omit<TaskDraft, "projectId" | "parentTaskId" | "edenCode" | "plannedFinish">;

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function validateFields(fields: PlanningFields, ctx: TaskRuleContext, issues: Issue[]): void {
  if (!fields.title) issues.push(issue("TITLE_REQUIRED", "Title is required", "title"));
  if (fields.title.length > TASK_TITLE_MAX)
    issues.push(issue("TITLE_TOO_LONG", `Title must be at most ${TASK_TITLE_MAX} characters`, "title"));
  if (fields.description && fields.description.length > TASK_DESCRIPTION_MAX)
    issues.push(issue("DESCRIPTION_TOO_LONG", `Description must be at most ${TASK_DESCRIPTION_MAX} characters`, "description"));

  if (!ctx.workstreams.some((w) => w.id === fields.workstreamId))
    issues.push(issue("WORKSTREAM_NOT_FOUND", "Workstream not found in this project", "workstreamId"));

  if (fields.ownerMemberId !== null && !ctx.members.some((m) => m.id === fields.ownerMemberId))
    issues.push(issue("OWNER_NOT_FOUND", "Owner is not a member of this project", "ownerMemberId"));

  if (fields.plannedStart !== null) {
    let validDate = true;
    try {
      parseIsoDate(fields.plannedStart);
    } catch {
      validDate = false;
      issues.push(issue("START_INVALID", "Planned start must be a valid YYYY-MM-DD date", "plannedStart"));
    }
    if (validDate && !fields.isMilestone && !isWorkingDay(fields.plannedStart))
      issues.push(issue("START_NOT_WORKING_DAY", "Planned start must be a working day (Monday–Friday)", "plannedStart"));
  }

  const duration = fields.plannedDurationDays;
  if (duration !== null) {
    if (!Number.isInteger(duration)) {
      issues.push(issue("DURATION_INVALID", "Duration must be a whole number of working days", "plannedDurationDays"));
    } else if (fields.isMilestone && duration !== 0) {
      issues.push(issue("MILESTONE_DURATION", "Milestones have zero duration", "plannedDurationDays"));
    } else if (!fields.isMilestone && (duration < 1 || duration > TASK_DURATION_MAX_DAYS)) {
      issues.push(
        issue("DURATION_RANGE", `Duration must be between 1 and ${TASK_DURATION_MAX_DAYS} working days`, "plannedDurationDays"),
      );
    }
  }

  const progress = fields.progressPercent;
  if (progress !== null && (!Number.isInteger(progress) || progress < 0 || progress > 100))
    issues.push(issue("PROGRESS_RANGE", "Progress must be a whole number from 0 to 100", "progressPercent"));

  if (fields.deadline !== null) {
    try {
      parseIsoDate(fields.deadline);
    } catch {
      issues.push(issue("DEADLINE_INVALID", "Deadline must be a valid YYYY-MM-DD date", "deadline"));
    }
  }
  for (const [key, label] of [["blocker", "Blocker"], ["waitingFor", "Waiting for"]] as const) {
    const value = fields[key];
    if (value && value.length > TASK_CONTEXT_MAX)
      issues.push(issue("TEXT_TOO_LONG", `${label} must be at most ${TASK_CONTEXT_MAX} characters`, key));
  }
  if (fields.notes && fields.notes.length > TASK_NOTES_MAX)
    issues.push(issue("TEXT_TOO_LONG", `Notes must be at most ${TASK_NOTES_MAX} characters`, "notes"));

  if (!Number.isInteger(fields.sortOrder))
    issues.push(issue("SORT_ORDER_INVALID", "Sort order must be an integer", "sortOrder"));
}

function withDerivedFinish(fields: PlanningFields): IsoDate | null {
  return computePlannedFinish(fields);
}

export function prepareNewTask(input: NewTaskInput, ctx: TaskRuleContext): Result<TaskDraft> {
  const issues: Issue[] = [];
  const edenCode = normalizeCode(input.edenCode);
  const parentTaskId = input.parentTaskId ?? null;
  const parent = parentTaskId === null ? null : ctx.tasks.find((t) => t.id === parentTaskId);

  // Code.
  const parsed = parseEdenCode(edenCode);
  if (!isValidEdenCode(edenCode) || !parsed) {
    issues.push(
      issue("EDEN_CODE_FORMAT", "E:DEN code must look like TEC-001 (task) or TEC-001.1 (subtask)", "edenCode"),
    );
  } else if (ctx.tasks.some((t) => t.edenCode === edenCode)) {
    issues.push(issue("EDEN_CODE_TAKEN", `${edenCode} is already used in this project`, "edenCode"));
  }

  // Hierarchy.
  if (parentTaskId !== null && !parent) {
    issues.push(issue("PARENT_NOT_FOUND", "Parent task not found in this project", "parentTaskId"));
  } else if (parent) {
    if (parent.parentTaskId !== null)
      issues.push(issue("HIERARCHY_TOO_DEEP", `${parent.edenCode} is already a subtask; subtasks cannot have subtasks`, "parentTaskId"));
    if (parent.isMilestone)
      issues.push(issue("MILESTONE_WITH_SUBTASKS", `Milestone ${parent.edenCode} cannot have subtasks`, "parentTaskId"));
    if (parsed && parsed.parentCode !== parent.edenCode)
      issues.push(issue("EDEN_CODE_PARENT_PREFIX", `Subtask code must look like ${parent.edenCode}.N`, "edenCode"));
    if (input.workstreamId && input.workstreamId !== parent.workstreamId)
      issues.push(issue("SUBTASK_WORKSTREAM_MISMATCH", "A subtask is always in its parent's workstream", "workstreamId"));
  } else if (parsed && parsed.parentCode !== null) {
    issues.push(issue("EDEN_CODE_LEVEL", `${edenCode} is a subtask code; choose its parent task`, "edenCode"));
  }

  const workstreamId = parent ? parent.workstreamId : (input.workstreamId ?? "");
  if (!parent && !input.workstreamId)
    issues.push(issue("WORKSTREAM_REQUIRED", "Workstream is required", "workstreamId"));

  const isMilestone = input.isMilestone ?? false;
  const fields: PlanningFields = {
    workstreamId,
    title: input.title.trim(),
    description: normalizeText(input.description),
    ownerMemberId: input.ownerMemberId ?? null,
    plannedStart: input.plannedStart ?? null,
    plannedDurationDays: isMilestone ? (input.plannedDurationDays ?? 0) : (input.plannedDurationDays ?? null),
    status: input.status ?? "BACKLOG",
    priority: input.priority ?? null,
    geography: input.geography ?? null,
    isMilestone,
    progressPercent: input.progressPercent ?? null,
    deadline: input.deadline ?? null,
    blocker: normalizeText(input.blocker),
    waitingFor: normalizeText(input.waitingFor),
    notes: normalizeText(input.notes),
    splittable: input.splittable ?? null,
    sortOrder: input.sortOrder ?? 0,
  };
  // Workstream errors are already reported above when missing.
  const fieldIssues: Issue[] = [];
  validateFields(fields, ctx, fieldIssues);
  issues.push(...fieldIssues.filter((i) => !(i.code === "WORKSTREAM_NOT_FOUND" && !workstreamId)));

  if (issues.length) return fail(issues);
  return ok({
    projectId: ctx.projectId,
    parentTaskId,
    edenCode,
    ...fields,
    plannedFinish: withDerivedFinish(fields),
  });
}

/**
 * Validates a patch against the current task and returns only the fields that
 * actually change (including a re-derived planned finish).
 */
export function prepareTaskUpdate(current: Task, patch: TaskPatch, ctx: TaskRuleContext): Result<TaskChanges> {
  const issues: Issue[] = [];
  const isMilestone = patch.isMilestone ?? current.isMilestone;
  const subtasks = ctx.tasks.filter((t) => t.parentTaskId === current.id);

  let plannedDurationDays: number | null;
  if (isMilestone) {
    plannedDurationDays = patch.plannedDurationDays ?? 0;
  } else if (current.isMilestone && patch.plannedDurationDays === undefined) {
    // Milestone -> task: the duration is unknown until someone validates it.
    plannedDurationDays = null;
  } else {
    plannedDurationDays = patch.plannedDurationDays === undefined ? current.plannedDurationDays : patch.plannedDurationDays;
  }

  if (isMilestone && !current.isMilestone && subtasks.length)
    issues.push(issue("MILESTONE_WITH_SUBTASKS", `${current.edenCode} has subtasks and cannot become a milestone`, "isMilestone"));

  if (current.parentTaskId !== null && patch.workstreamId !== undefined && patch.workstreamId !== current.workstreamId)
    issues.push(issue("SUBTASK_WORKSTREAM_MISMATCH", "A subtask is always in its parent's workstream; move the parent instead", "workstreamId"));

  const pick = <K extends keyof TaskPatch>(key: K, fallback: NonNullable<TaskPatch[K]> | null) =>
    patch[key] === undefined ? fallback : patch[key];

  const merged: PlanningFields = {
    workstreamId: patch.workstreamId ?? current.workstreamId,
    title: patch.title === undefined ? current.title : patch.title.trim(),
    description: patch.description === undefined ? current.description : normalizeText(patch.description),
    ownerMemberId: pick("ownerMemberId", current.ownerMemberId) ?? null,
    plannedStart: pick("plannedStart", current.plannedStart) ?? null,
    plannedDurationDays,
    status: patch.status ?? current.status,
    priority: pick("priority", current.priority) ?? null,
    geography: pick("geography", current.geography) ?? null,
    isMilestone,
    progressPercent: pick("progressPercent", current.progressPercent) ?? null,
    deadline: pick("deadline", current.deadline) ?? null,
    blocker: patch.blocker === undefined ? current.blocker : normalizeText(patch.blocker),
    waitingFor: patch.waitingFor === undefined ? current.waitingFor : normalizeText(patch.waitingFor),
    notes: patch.notes === undefined ? current.notes : normalizeText(patch.notes),
    splittable: patch.splittable === undefined ? current.splittable : patch.splittable,
    sortOrder: patch.sortOrder ?? current.sortOrder,
  };
  validateFields(merged, ctx, issues);
  if (issues.length) return fail(issues);

  const next: Omit<TaskDraft, "projectId" | "edenCode" | "parentTaskId"> = {
    ...merged,
    plannedFinish: withDerivedFinish(merged),
  };
  const changes: TaskChanges = {};
  for (const key of Object.keys(next) as (keyof typeof next)[]) {
    if (next[key] !== current[key]) (changes as Record<string, unknown>)[key] = next[key];
  }
  return ok(changes);
}

/** Deleting a task with subtasks must be explicit (delete the subtasks first). */
export function checkTaskDeletion(task: Pick<Task, "id" | "edenCode">, tasks: Pick<Task, "parentTaskId" | "edenCode">[]): Issue[] {
  const children = tasks.filter((t) => t.parentTaskId === task.id).map((t) => t.edenCode);
  return children.length
    ? [issue("TASK_HAS_SUBTASKS", `${task.edenCode} has subtasks (${children.join(", ")}); delete them first`)]
    : [];
}

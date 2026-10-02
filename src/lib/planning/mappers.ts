import type { Geography, TaskPriority, TaskStatus, TrelloSyncState } from "@/domain/planning/constants";
import type { TaskChanges } from "@/domain/planning/taskRules";
import type { Member, Project, Task, TaskDependency, Workstream } from "@/domain/planning/types";
import type { MemberRow, ProjectRow, TaskDependencyRow, TaskRow, WorkstreamRow } from "@/lib/db/rows";

/** SQLite row (snake_case, 0/1 booleans) <-> domain (camelCase). */

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    trelloBoardId: row.trello_board_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toWorkstream(row: WorkstreamRow): Workstream {
  return {
    id: row.id,
    projectId: row.project_id,
    code: row.code,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    projectId: row.project_id,
    edenUserId: row.eden_user_id,
    displayName: row.display_name,
    email: row.email,
    trelloMemberId: row.trello_member_id,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    workstreamId: row.workstream_id,
    parentTaskId: row.parent_task_id,
    edenCode: row.eden_code,
    title: row.title,
    description: row.description,
    ownerMemberId: row.owner_member_id,
    plannedStart: row.planned_start,
    plannedDurationDays: row.planned_duration_days,
    plannedFinish: row.planned_finish,
    // Enum values are guaranteed by CHECK constraints.
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority | null,
    geography: row.geography as Geography | null,
    isMilestone: row.is_milestone === 1,
    progressPercent: row.progress_percent,
    deadline: row.deadline,
    blocker: row.blocker,
    waitingFor: row.waiting_for,
    notes: row.notes,
    splittable: row.splittable === null ? null : row.splittable === 1,
    sortOrder: row.sort_order,
    trelloCardId: row.trello_card_id,
    trelloCardUrl: row.trello_card_url,
    trelloSyncStatus: row.trello_sync_status as TrelloSyncState,
    trelloSyncedHash: row.trello_synced_hash,
    trelloSyncedAt: row.trello_synced_at,
    trelloLastError: row.trello_last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDependency(row: TaskDependencyRow): TaskDependency {
  return {
    id: row.id,
    projectId: row.project_id,
    predecessorTaskId: row.predecessor_task_id,
    successorTaskId: row.successor_task_id,
    lagDays: row.lag_days,
    createdAt: row.created_at,
  };
}

export const TASK_COLUMNS = {
  workstreamId: "workstream_id",
  title: "title",
  description: "description",
  ownerMemberId: "owner_member_id",
  plannedStart: "planned_start",
  plannedDurationDays: "planned_duration_days",
  plannedFinish: "planned_finish",
  status: "status",
  priority: "priority",
  geography: "geography",
  isMilestone: "is_milestone",
  progressPercent: "progress_percent",
  deadline: "deadline",
  blocker: "blocker",
  waitingFor: "waiting_for",
  notes: "notes",
  splittable: "splittable",
  sortOrder: "sort_order",
} as const satisfies Record<keyof TaskChanges, keyof TaskRow>;

/** Column/value pairs for the provided changes (booleans become 0/1; explicit nulls kept). */
export function taskChangesToColumns(changes: TaskChanges): Partial<Record<keyof TaskRow, unknown>> {
  const columns: Partial<Record<keyof TaskRow, unknown>> = {};
  for (const [key, column] of Object.entries(TASK_COLUMNS) as [keyof TaskChanges, keyof TaskRow][]) {
    const value = changes[key];
    if (value !== undefined) columns[column] = typeof value === "boolean" ? (value ? 1 : 0) : value;
  }
  return columns;
}

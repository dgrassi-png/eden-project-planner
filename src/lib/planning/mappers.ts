import type { TaskChanges, TaskDraft } from "@/domain/planning/taskRules";
import type { Member, Project, Task, TaskDependency, Workstream } from "@/domain/planning/types";
import type {
  Database,
  MemberRow,
  ProjectRow,
  TaskDependencyRow,
  TaskRow,
  WorkstreamRow,
} from "@/lib/supabase/database.types";

/** Row (snake_case) <-> domain (camelCase) mapping. */

type Tables = Database["public"]["Tables"];

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
    authUserId: row.auth_user_id,
    displayName: row.display_name,
    email: row.email,
    trelloMemberId: row.trello_member_id,
    active: row.active,
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
    status: row.status,
    priority: row.priority,
    geography: row.geography,
    isMilestone: row.is_milestone,
    progressPercent: row.progress_percent,
    sortOrder: row.sort_order,
    trelloCardId: row.trello_card_id,
    trelloCardUrl: row.trello_card_url,
    trelloSyncStatus: row.trello_sync_status,
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

const TASK_COLUMNS = {
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
  sortOrder: "sort_order",
} as const satisfies Record<keyof TaskChanges, keyof TaskRow>;

export function taskChangesToUpdate(changes: TaskChanges): Tables["tasks"]["Update"] {
  const update: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(TASK_COLUMNS)) {
    const value = changes[key as keyof TaskChanges];
    if (value !== undefined) update[column] = value;
  }
  return update as Tables["tasks"]["Update"];
}

export function taskDraftToInsert(draft: TaskDraft): Tables["tasks"]["Insert"] {
  return {
    ...taskChangesToUpdate(draft),
    project_id: draft.projectId,
    parent_task_id: draft.parentTaskId,
    eden_code: draft.edenCode,
    workstream_id: draft.workstreamId,
    title: draft.title,
  };
}

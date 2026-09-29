import type { ScheduleState } from "@/domain/planning/calendar";
import type { Geography, TaskPriority, TaskStatus, TrelloSyncState } from "@/domain/planning/constants";
import type { IsoDate } from "@/domain/timeline/dates";

/**
 * Planner view model: one flattened row per workstream header or task.
 *
 * Every planning value is nullable: anything not yet validated by the team is
 * `null` and rendered as TBD, never filled with an invented default.
 */

export interface WorkstreamRow {
  kind: "workstream";
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  taskCount: number;
}

export interface DependencyLink {
  dependencyId: string;
  taskId: string;
  edenCode: string;
  lagDays: number;
}

export interface TaskRow {
  kind: "task";
  id: string;
  edenCode: string;
  title: string;
  description: string | null;
  workstreamId: string | null;
  workstreamName: string | null;
  parentTaskId: string | null;
  parentCode: string | null;
  /** 0 = task, 1 = subtask. */
  depth: number;
  hasSubtasks: boolean;
  isMilestone: boolean;
  ownerMemberId: string | null;
  ownerName: string | null;
  plannedStart: IsoDate | null;
  plannedDurationDays: number | null;
  plannedFinish: IsoDate | null;
  scheduleState: ScheduleState;
  status: TaskStatus | null;
  priority: TaskPriority | null;
  geography: Geography | null;
  progressPercent: number | null;
  predecessorCodes: string[];
  predecessors: DependencyLink[];
  successors: DependencyLink[];
  trelloCardUrl: string | null;
  trelloSyncStatus: TrelloSyncState | null;
  /** Version token for optimistic concurrency (null for scaffold rows). */
  updatedAt: string | null;
}

export type PlannerRow = WorkstreamRow | TaskRow;

export interface Option {
  id: string;
  label: string;
}

export interface DatabasePlannerData {
  source: "database";
  project: { id: string; name: string };
  rows: PlannerRow[];
  workstreams: (Option & { code: string })[];
  members: Option[];
  /** All E:DEN codes in the project, for code suggestions. */
  edenCodes: string[];
}

export interface ScaffoldPlannerData {
  source: "scaffold";
  rows: PlannerRow[];
}

export type PlannerData = DatabasePlannerData | ScaffoldPlannerData;

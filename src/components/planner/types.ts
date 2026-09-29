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
}

export interface TaskRow {
  kind: "task";
  id: string;
  edenCode: string;
  title: string;
  workstreamName: string | null;
  parentCode: string | null;
  /** 0 = task, 1 = subtask. */
  depth: number;
  isMilestone: boolean;
  ownerName: string | null;
  plannedStart: IsoDate | null;
  plannedDurationDays: number | null;
  plannedFinish: IsoDate | null;
  status: TaskStatus | null;
  priority: TaskPriority | null;
  geography: Geography | null;
  progressPercent: number | null;
  predecessorCodes: string[];
  trelloCardUrl: string | null;
  trelloSyncStatus: TrelloSyncState | null;
}

export type PlannerRow = WorkstreamRow | TaskRow;

export interface PlannerData {
  /** Where the rows came from. Only "database" rows are canonical planning data. */
  source: "scaffold" | "database";
  rows: PlannerRow[];
}

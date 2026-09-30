import type { IsoDate } from "../timeline/dates";

import type {
  Geography,
  ProposalState,
  TaskPriority,
  TaskStatus,
  TrelloSyncState,
} from "./constants";

/**
 * Planning domain models (camelCase mirrors of the database tables).
 *
 * Nullable planning fields mean "not validated yet" and must be shown as TBD.
 * They are never filled with invented values.
 */

export type Timestamp = string;

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  trelloBoardId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Workstream {
  id: string;
  projectId: string;
  /** Permanent code, e.g. `TEC`. */
  code: string;
  name: string;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Member {
  id: string;
  projectId: string;
  /** E:DEN Identity user id, once linked. */
  edenUserId: string | null;
  displayName: string;
  email: string | null;
  trelloMemberId: string | null;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Task {
  id: string;
  projectId: string;
  workstreamId: string;
  parentTaskId: string | null;
  /** Permanent identifier, e.g. `TEC-001` / `TEC-001.1`. Never changes. */
  edenCode: string;
  title: string;
  description: string | null;
  ownerMemberId: string | null;
  plannedStart: IsoDate | null;
  /** Working days (Mon–Fri). Milestones are always 0. */
  plannedDurationDays: number | null;
  /** Derived from start + duration; never set directly. */
  plannedFinish: IsoDate | null;
  status: TaskStatus;
  priority: TaskPriority | null;
  geography: Geography | null;
  isMilestone: boolean;
  progressPercent: number | null;
  sortOrder: number;
  trelloCardId: string | null;
  trelloCardUrl: string | null;
  trelloSyncStatus: TrelloSyncState;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Finish-to-Start: successor may start after predecessor finish + lag working days. */
export interface TaskDependency {
  id: string;
  projectId: string;
  predecessorTaskId: string;
  successorTaskId: string;
  lagDays: number;
  createdAt: Timestamp;
}

export interface ChangeProposal {
  id: string;
  projectId: string;
  source: string;
  reason: string | null;
  payload: unknown;
  status: ProposalState;
  reviewedBy: string | null;
  reviewedAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface PlanningSnapshot {
  project: Project;
  workstreams: Workstream[];
  members: Member[];
  tasks: Task[];
  dependencies: TaskDependency[];
}

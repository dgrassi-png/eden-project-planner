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
  /** External due date (not derived). */
  deadline: IsoDate | null;
  blocker: string | null;
  waitingFor: string | null;
  notes: string | null;
  /** Whether the work can be split into shorter blocks (Personal Assistant); null = unknown. */
  splittable: boolean | null;
  sortOrder: number;
  trelloCardId: string | null;
  trelloCardUrl: string | null;
  trelloSyncStatus: TrelloSyncState;
  /** Fingerprint of the card content last sent to Trello. */
  trelloSyncedHash: string | null;
  trelloSyncedAt: Timestamp | null;
  trelloLastError: string | null;
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
  /** Who produced it: CHATGPT, CLAUDE, USER (pasted by a person) or SYSTEM. */
  source: string;
  reason: string | null;
  /** Structured changes (validated by the proposal schema); untrusted until reviewed. */
  payload: unknown;
  status: ProposalState;
  /** E:DEN user id or agent name that submitted it. */
  submittedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: Timestamp | null;
  reviewNote: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AuditEvent {
  id: string;
  projectId: string | null;
  actorType: string;
  actorId: string | null;
  action: "CREATE" | "UPDATE" | "DELETE";
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: Timestamp;
}

export interface PlanningSnapshot {
  project: Project;
  workstreams: Workstream[];
  members: Member[];
  tasks: Task[];
  dependencies: TaskDependency[];
}

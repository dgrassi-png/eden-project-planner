/**
 * Planning enums, mirroring the CHECK constraints in `db/migrations`.
 * Keep the two in sync: the database is authoritative.
 */

export const TASK_STATUSES = [
  "BACKLOG",
  "READY",
  "IN_PROGRESS",
  "WAITING_BLOCKED",
  "DONE",
  "CANCELLED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  BACKLOG: "Backlog",
  READY: "Ready",
  IN_PROGRESS: "In progress",
  WAITING_BLOCKED: "Waiting / blocked",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export const TASK_PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const GEOGRAPHIES = [
  "CECINA_REQUIRED",
  "CECINA_PREFERRED",
  "REMOTE_OK",
  "ANYWHERE",
] as const;
export type Geography = (typeof GEOGRAPHIES)[number];

export const GEOGRAPHY_LABELS: Record<Geography, string> = {
  CECINA_REQUIRED: "Cecina required",
  CECINA_PREFERRED: "Cecina preferred",
  REMOTE_OK: "Remote OK",
  ANYWHERE: "Anywhere",
};

export const TRELLO_SYNC_STATES = [
  "NOT_SYNCED",
  "SYNC_PENDING",
  "SYNCED",
  "SYNC_ERROR",
  "OUT_OF_SYNC",
] as const;
export type TrelloSyncState = (typeof TRELLO_SYNC_STATES)[number];

export const PROPOSAL_STATES = ["PENDING", "APPLIED", "REJECTED"] as const;
export type ProposalState = (typeof PROPOSAL_STATES)[number];

/** Audit / proposal actors. Provider-neutral: no planning logic depends on a specific AI vendor. */
export const ACTOR_TYPES = ["USER", "CHATGPT", "CLAUDE", "SYSTEM", "TRELLO_SYNC"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

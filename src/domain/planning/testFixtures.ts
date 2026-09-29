import type { Task, Workstream } from "./types";

/** Test-only builders. Values are arbitrary fixtures, not E:DEN planning data. */

export const PROJECT_ID = "p-1";

export function makeWorkstream(overrides: Partial<Workstream> & Pick<Workstream, "id" | "code">): Workstream {
  return {
    projectId: PROJECT_ID,
    name: overrides.code,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makeTask(overrides: Partial<Task> & Pick<Task, "id" | "edenCode">): Task {
  return {
    projectId: PROJECT_ID,
    workstreamId: "ws-1",
    parentTaskId: null,
    title: overrides.edenCode,
    description: null,
    ownerMemberId: null,
    plannedStart: null,
    plannedDurationDays: null,
    plannedFinish: null,
    status: "BACKLOG",
    priority: null,
    geography: null,
    isMilestone: false,
    progressPercent: null,
    sortOrder: 0,
    trelloCardId: null,
    trelloCardUrl: null,
    trelloSyncStatus: "NOT_SYNCED",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

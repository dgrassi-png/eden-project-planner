import { describe, expect, it } from "vitest";

import type { TaskRow } from "@/lib/db/rows";

import { taskChangesToColumns, toTask } from "./mappers";

const row: TaskRow = {
  id: "t-1",
  project_id: "p-1",
  workstream_id: "ws-1",
  parent_task_id: null,
  eden_code: "TEC-001",
  title: "Controller",
  description: null,
  owner_member_id: null,
  planned_start: "2026-10-05",
  planned_duration_days: 5,
  planned_finish: "2026-10-09",
  status: "READY",
  priority: null,
  geography: "CECINA_REQUIRED",
  is_milestone: 0,
  progress_percent: null,
  deadline: null,
  blocker: null,
  waiting_for: null,
  notes: null,
  splittable: 0,
  sort_order: 3,
  trello_card_id: null,
  trello_card_url: null,
  trello_sync_status: "NOT_SYNCED",
  trello_synced_hash: null,
  trello_synced_at: null,
  trello_last_error: null,
  created_at: "2026-09-29T10:00:00.000Z",
  updated_at: "2026-09-29T10:00:00.000Z",
};

describe("mappers", () => {
  it("maps SQLite task rows to domain tasks", () => {
    expect(toTask(row)).toMatchObject({ edenCode: "TEC-001", isMilestone: false, geography: "CECINA_REQUIRED", priority: null, sortOrder: 3 });
    expect(toTask({ ...row, is_milestone: 1 }).isMilestone).toBe(true);
  });

  it("maps only provided changes, keeping explicit nulls and converting booleans", () => {
    expect(taskChangesToColumns({ plannedStart: null, plannedFinish: null, isMilestone: true })).toEqual({
      planned_start: null,
      planned_finish: null,
      is_milestone: 1,
    });
    expect(taskChangesToColumns({})).toEqual({});
  });
});

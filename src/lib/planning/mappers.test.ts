import { describe, expect, it } from "vitest";

import type { TaskRow } from "@/lib/supabase/database.types";

import { taskChangesToUpdate, taskDraftToInsert, toTask } from "./mappers";

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
  is_milestone: false,
  progress_percent: null,
  sort_order: 3,
  trello_card_id: null,
  trello_card_url: null,
  trello_sync_status: "NOT_SYNCED",
  created_at: "2026-09-29T10:00:00+00:00",
  updated_at: "2026-09-29T10:00:00+00:00",
};

describe("mappers", () => {
  it("maps task rows to domain tasks", () => {
    expect(toTask(row)).toMatchObject({
      edenCode: "TEC-001",
      workstreamId: "ws-1",
      plannedStart: "2026-10-05",
      plannedDurationDays: 5,
      plannedFinish: "2026-10-09",
      geography: "CECINA_REQUIRED",
      priority: null,
      sortOrder: 3,
    });
  });

  it("maps only provided changes, keeping explicit nulls", () => {
    expect(taskChangesToUpdate({ plannedStart: null, plannedFinish: null, title: "x" })).toEqual({
      planned_start: null,
      planned_finish: null,
      title: "x",
    });
    expect(taskChangesToUpdate({})).toEqual({});
  });

  it("maps drafts to inserts including permanent identifiers", () => {
    const insert = taskDraftToInsert({
      projectId: "p-1",
      workstreamId: "ws-1",
      parentTaskId: null,
      edenCode: "TEC-002",
      title: "t",
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
    });
    expect(insert).toMatchObject({ project_id: "p-1", eden_code: "TEC-002", parent_task_id: null, priority: null });
  });
});

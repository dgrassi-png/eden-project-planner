import type { PlannerData, TaskRow } from "./types";

/**
 * ⚠️ UI SCAFFOLDING ONLY — NOT E:DEN PLANNING DATA.
 *
 * Generic placeholder rows used during the bootstrap phase to demonstrate the
 * planner layout. Codes use the `SCAFFOLD-` prefix so they can never be
 * mistaken for real E:DEN codes, and every planning value is null (TBD).
 *
 * Delete once the planner reads from Supabase (Phase 01/02).
 */

function scaffoldTask(partial: Pick<TaskRow, "id" | "edenCode" | "title"> & Partial<TaskRow>): TaskRow {
  return {
    kind: "task",
    workstreamName: null,
    parentCode: null,
    depth: 0,
    isMilestone: false,
    ownerName: null,
    plannedStart: null,
    plannedDurationDays: null,
    plannedFinish: null,
    status: null,
    priority: null,
    geography: null,
    progressPercent: null,
    predecessorCodes: [],
    trelloCardUrl: null,
    trelloSyncStatus: null,
    ...partial,
  };
}

export const SCAFFOLD_PLANNER_DATA: PlannerData = {
  source: "scaffold",
  rows: [
    { kind: "workstream", id: "scaffold-ws-a", code: "SCAFFOLD-A", name: "Example workstream A" },
    scaffoldTask({
      id: "scaffold-t1",
      edenCode: "SCAFFOLD-001",
      title: "Example task row",
      workstreamName: "Example workstream A",
    }),
    scaffoldTask({
      id: "scaffold-t1-1",
      edenCode: "SCAFFOLD-001.1",
      title: "Example subtask row",
      workstreamName: "Example workstream A",
      parentCode: "SCAFFOLD-001",
      depth: 1,
    }),
    scaffoldTask({
      id: "scaffold-t2",
      edenCode: "SCAFFOLD-002",
      title: "Example task row",
      workstreamName: "Example workstream A",
    }),
    { kind: "workstream", id: "scaffold-ws-b", code: "SCAFFOLD-B", name: "Example workstream B" },
    scaffoldTask({
      id: "scaffold-t3",
      edenCode: "SCAFFOLD-003",
      title: "Example task row",
      workstreamName: "Example workstream B",
    }),
    scaffoldTask({
      id: "scaffold-m1",
      edenCode: "SCAFFOLD-004",
      title: "Example milestone row",
      workstreamName: "Example workstream B",
      isMilestone: true,
    }),
  ],
};

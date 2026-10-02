import type { Geography, TaskPriority, TaskStatus } from "@/domain/planning/constants";

import type { PlannerRow, TaskRow } from "./types";

/** Planner filters (Product Definition §31). Pure: the Gantt still shows real dates, just fewer rows. */
export interface PlannerFilters {
  search: string;
  /** Member id, "none" for TBD, "" for any. */
  owner: string;
  workstream: string;
  status: TaskStatus | "";
  priority: TaskPriority | "none" | "";
  geography: Geography | "none" | "";
  schedule: "" | "scheduled" | "partial" | "unscheduled";
  milestonesOnly: boolean;
  blockedOnly: boolean;
  conflictsOnly: boolean;
}

export const NO_FILTERS: PlannerFilters = {
  search: "",
  owner: "",
  workstream: "",
  status: "",
  priority: "",
  geography: "",
  schedule: "",
  milestonesOnly: false,
  blockedOnly: false,
  conflictsOnly: false,
};

export const hasFilters = (f: PlannerFilters) => JSON.stringify(f) !== JSON.stringify(NO_FILTERS);

function matches(row: TaskRow, f: PlannerFilters): boolean {
  const needle = f.search.trim().toLowerCase();
  if (needle && ![row.edenCode, row.title, row.description ?? ""].some((text) => text.toLowerCase().includes(needle))) return false;
  if (f.owner && (f.owner === "none" ? row.ownerMemberId !== null : row.ownerMemberId !== f.owner)) return false;
  if (f.workstream && row.workstreamId !== f.workstream) return false;
  if (f.status && row.status !== f.status) return false;
  if (f.priority && (f.priority === "none" ? row.priority !== null : row.priority !== f.priority)) return false;
  if (f.geography && (f.geography === "none" ? row.geography !== null : row.geography !== f.geography)) return false;
  if (f.schedule && row.scheduleState !== f.schedule) return false;
  if (f.milestonesOnly && !row.isMilestone) return false;
  if (f.blockedOnly && row.status !== "WAITING_BLOCKED" && row.blocker === null) return false;
  if (f.conflictsOnly && !row.hasConflict && !row.successors.some((s) => s.state === "violated")) return false;
  return true;
}

/**
 * Keeps matching tasks, the parent of a matching subtask (for context) and
 * the workstream headers that still have tasks. Order is preserved.
 */
export function filterRows(rows: PlannerRow[], f: PlannerFilters): PlannerRow[] {
  if (!hasFilters(f)) return rows;
  const tasks = rows.filter((r): r is TaskRow => r.kind === "task");
  const keep = new Set(tasks.filter((t) => matches(t, f)).map((t) => t.id));
  for (const t of tasks) if (keep.has(t.id) && t.parentTaskId) keep.add(t.parentTaskId);
  // A workstream header stays when at least one task below it (before the next header) is kept.
  const result: PlannerRow[] = [];
  let header: PlannerRow | null = null;
  for (const row of rows) {
    if (row.kind === "workstream") {
      header = row;
      continue;
    }
    if (!keep.has(row.id)) continue;
    if (header) {
      result.push(header);
      header = null;
    }
    result.push(row);
  }
  return result;
}

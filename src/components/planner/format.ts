import { GEOGRAPHY_LABELS, TASK_STATUS_LABELS } from "@/domain/planning/constants";

import type { TaskRow } from "./types";

export const TBD = "TBD";

export function formatDuration(row: TaskRow): string {
  if (row.isMilestone) return "◆";
  return row.plannedDurationDays === null ? TBD : `${row.plannedDurationDays}d`;
}

export function formatStatus(row: TaskRow): string {
  return row.status ? TASK_STATUS_LABELS[row.status] : "—";
}

export function formatGeography(row: TaskRow): string {
  return row.geography ? GEOGRAPHY_LABELS[row.geography] : "—";
}

export function isUnscheduled(row: TaskRow): boolean {
  return row.plannedStart === null;
}

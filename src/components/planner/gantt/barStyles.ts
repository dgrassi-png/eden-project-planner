import type { TaskStatus } from "@/domain/planning/constants";

/** Bar colours by planning status (Tailwind classes). */
export const STATUS_BAR: Record<TaskStatus, { bar: string; progress: string }> = {
  BACKLOG: { bar: "bg-neutral-400", progress: "bg-neutral-600" },
  READY: { bar: "bg-sky-500", progress: "bg-sky-700" },
  IN_PROGRESS: { bar: "bg-blue-600", progress: "bg-blue-800" },
  WAITING_BLOCKED: { bar: "bg-amber-500", progress: "bg-amber-700" },
  DONE: { bar: "bg-emerald-600", progress: "bg-emerald-800" },
  CANCELLED: { bar: "bg-neutral-300", progress: "bg-neutral-400" },
};

/** DONE / CANCELLED tasks are locked on the timeline to protect history. */
export function isLockedOnTimeline(status: TaskStatus | null): boolean {
  return status === "DONE" || status === "CANCELLED";
}

export const BAR_HEIGHT_PX = 16;
export const SUBTASK_BAR_HEIGHT_PX = 12;
export const MILESTONE_SIZE_PX = 12;

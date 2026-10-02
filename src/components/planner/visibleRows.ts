import type { PlannerRow, TaskRow, WorkstreamRow } from "./types";

/** Rows left after collapsing workstreams (hide their tasks) and parent tasks (hide their subtasks). */
export function visibleRows(rows: PlannerRow[], collapsed: ReadonlySet<string>): PlannerRow[] {
  const result: PlannerRow[] = [];
  let hideWorkstream = false;
  for (const row of rows) {
    if (row.kind === "workstream") {
      hideWorkstream = collapsed.has(row.id);
      result.push(row);
      continue;
    }
    if (hideWorkstream) continue;
    if (row.parentTaskId !== null && collapsed.has(row.parentTaskId)) continue;
    result.push(row);
  }
  return result;
}

/**
 * Date span of a workstream's scheduled tasks (display-only summary),
 * or null when none of its tasks has dates.
 */
export function workstreamSpans(rows: PlannerRow[]): Map<string, { start: string; finish: string }> {
  const spans = new Map<string, { start: string; finish: string }>();
  let current: WorkstreamRow | null = null;
  for (const row of rows) {
    if (row.kind === "workstream") {
      current = row;
      continue;
    }
    if (!current) continue;
    const task: TaskRow = row;
    if (task.plannedStart === null) continue;
    const finish = task.plannedFinish ?? task.plannedStart;
    const span = spans.get(current.id);
    spans.set(current.id, {
      start: span && span.start < task.plannedStart ? span.start : task.plannedStart,
      finish: span && span.finish > finish ? span.finish : finish,
    });
  }
  return spans;
}

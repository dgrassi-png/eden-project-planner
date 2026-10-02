import { issue, type Issue } from "../result";

import type { Task, TaskDependency } from "./types";

/**
 * Finish-to-Start dependency rules: no self-links, duplicates, parent/child
 * links or cycles; non-negative integer lag (working days).
 */

export const DEPENDENCY_LAG_MAX_DAYS = 365;

type Edge = Pick<TaskDependency, "predecessorTaskId" | "successorTaskId">;

/**
 * If adding predecessor -> successor closes a cycle, returns the existing
 * path successor -> ... -> predecessor (task IDs); otherwise null.
 */
export function findCyclePath(edges: Edge[], predecessorTaskId: string, successorTaskId: string): string[] | null {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.predecessorTaskId) ?? [];
    list.push(edge.successorTaskId);
    outgoing.set(edge.predecessorTaskId, list);
  }

  const previous = new Map<string, string | null>([[successorTaskId, null]]);
  const queue = [successorTaskId];
  while (queue.length) {
    const node = queue.shift() as string;
    if (node === predecessorTaskId) {
      const path: string[] = [];
      for (let cursor: string | null = node; cursor !== null; cursor = previous.get(cursor) ?? null) path.unshift(cursor);
      return path;
    }
    for (const next of outgoing.get(node) ?? []) {
      if (!previous.has(next)) {
        previous.set(next, node);
        queue.push(next);
      }
    }
  }
  return null;
}

export interface NewDependencyInput {
  predecessorTaskId: string;
  successorTaskId: string;
  lagDays?: number;
}

export function validateLag(lagDays: number): Issue[] {
  return Number.isInteger(lagDays) && lagDays >= 0 && lagDays <= DEPENDENCY_LAG_MAX_DAYS
    ? []
    : [issue("LAG_RANGE", `Lag must be a whole number of working days from 0 to ${DEPENDENCY_LAG_MAX_DAYS}`, "lagDays")];
}

export function validateNewDependency(
  input: NewDependencyInput,
  tasks: Pick<Task, "id" | "projectId" | "edenCode" | "parentTaskId">[],
  dependencies: Edge[],
): Issue[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const pred = byId.get(input.predecessorTaskId);
  const succ = byId.get(input.successorTaskId);
  const issues: Issue[] = [];

  if (!pred) issues.push(issue("PREDECESSOR_NOT_FOUND", "Predecessor task not found", "predecessorTaskId"));
  if (!succ) issues.push(issue("SUCCESSOR_NOT_FOUND", "Successor task not found", "successorTaskId"));
  issues.push(...validateLag(input.lagDays ?? 0));
  if (!pred || !succ) return issues;

  if (pred.projectId !== succ.projectId) {
    issues.push(issue("DEPENDENCY_PROJECT_MISMATCH", "Both tasks must belong to the same project"));
    return issues;
  }
  if (pred.id === succ.id) {
    issues.push(issue("DEPENDENCY_SELF", `${pred.edenCode} cannot depend on itself`));
    return issues;
  }
  if (pred.parentTaskId === succ.id || succ.parentTaskId === pred.id) {
    issues.push(issue("DEPENDENCY_PARENT_CHILD", "A task cannot depend on its own parent or subtask"));
  }
  if (dependencies.some((d) => d.predecessorTaskId === pred.id && d.successorTaskId === succ.id)) {
    issues.push(issue("DEPENDENCY_DUPLICATE", `${succ.edenCode} already depends on ${pred.edenCode}`));
  }
  const cycle = findCyclePath(dependencies, pred.id, succ.id);
  if (cycle) {
    const codes = [...cycle, succ.id].map((id) => byId.get(id)?.edenCode ?? id);
    issues.push(
      issue("DEPENDENCY_CYCLE", `${pred.edenCode} → ${succ.edenCode} would create a cycle (${codes.join(" → ")})`),
    );
  }
  return issues;
}

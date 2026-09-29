import { compareEdenCodes } from "./edenCode";
import type { Task, Workstream } from "./types";

/** Project > Workstream > Task > Subtask, in display order. */

export interface TaskNode {
  task: Task;
  subtasks: Task[];
}

export interface WorkstreamNode {
  workstream: Workstream;
  tasks: TaskNode[];
}

function byOrderThenCode(a: Task, b: Task): number {
  return a.sortOrder - b.sortOrder || compareEdenCodes(a.edenCode, b.edenCode);
}

export function buildPlanningTree(workstreams: Workstream[], tasks: Task[]): WorkstreamNode[] {
  const subtasksByParent = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.parentTaskId === null) continue;
    const list = subtasksByParent.get(task.parentTaskId) ?? [];
    list.push(task);
    subtasksByParent.set(task.parentTaskId, list);
  }

  return [...workstreams]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    .map((workstream) => ({
      workstream,
      tasks: tasks
        .filter((t) => t.parentTaskId === null && t.workstreamId === workstream.id)
        .sort(byOrderThenCode)
        .map((task) => ({ task, subtasks: (subtasksByParent.get(task.id) ?? []).sort(byOrderThenCode) })),
    }));
}

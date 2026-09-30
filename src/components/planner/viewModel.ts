import { scheduleState } from "@/domain/planning/calendar";
import { buildPlanningTree } from "@/domain/planning/hierarchy";
import { checkDependencies, type DependencyCheck } from "@/domain/planning/scheduling";
import type { PlanningSnapshot, Task } from "@/domain/planning/types";

import type { DatabasePlannerData, DependencyLink, PlannerRow, TaskRow } from "./types";

/** Flattens a planning snapshot into ordered planner rows. Pure. */
export function toPlannerData(snapshot: PlanningSnapshot): DatabasePlannerData {
  const tasksById = new Map(snapshot.tasks.map((t) => [t.id, t]));
  const membersById = new Map(snapshot.members.map((m) => [m.id, m]));
  const workstreamsById = new Map(snapshot.workstreams.map((w) => [w.id, w]));

  const checks = new Map<string, DependencyCheck>(
    checkDependencies(snapshot.tasks, snapshot.dependencies).map((c) => [c.dependencyId, c]),
  );

  const link = (dependencyId: string, taskId: string, lagDays: number): DependencyLink => {
    const check = checks.get(dependencyId);
    return {
      dependencyId,
      taskId,
      edenCode: tasksById.get(taskId)?.edenCode ?? "?",
      lagDays,
      state: check?.state ?? "unknown",
      conflictDays: check?.conflictDays ?? 0,
      earliestStart: check?.earliestStart ?? null,
    };
  };

  const toRow = (task: Task, depth: number, hasSubtasks: boolean): TaskRow => {
    const predecessors = snapshot.dependencies
      .filter((d) => d.successorTaskId === task.id)
      .map((d) => link(d.id, d.predecessorTaskId, d.lagDays))
      .sort((a, b) => a.edenCode.localeCompare(b.edenCode));
    const successors = snapshot.dependencies
      .filter((d) => d.predecessorTaskId === task.id)
      .map((d) => link(d.id, d.successorTaskId, d.lagDays))
      .sort((a, b) => a.edenCode.localeCompare(b.edenCode));
    return {
      kind: "task",
      id: task.id,
      edenCode: task.edenCode,
      title: task.title,
      description: task.description,
      workstreamId: task.workstreamId,
      workstreamName: workstreamsById.get(task.workstreamId)?.name ?? null,
      parentTaskId: task.parentTaskId,
      parentCode: task.parentTaskId ? (tasksById.get(task.parentTaskId)?.edenCode ?? null) : null,
      depth,
      hasSubtasks,
      isMilestone: task.isMilestone,
      ownerMemberId: task.ownerMemberId,
      ownerName: task.ownerMemberId ? (membersById.get(task.ownerMemberId)?.displayName ?? null) : null,
      plannedStart: task.plannedStart,
      plannedDurationDays: task.plannedDurationDays,
      plannedFinish: task.plannedFinish,
      scheduleState: scheduleState(task),
      status: task.status,
      priority: task.priority,
      geography: task.geography,
      progressPercent: task.progressPercent,
      deadline: task.deadline,
      pastDeadline: task.deadline !== null && task.plannedFinish !== null && task.plannedFinish > task.deadline,
      blocker: task.blocker,
      waitingFor: task.waitingFor,
      notes: task.notes,
      splittable: task.splittable,
      hasConflict: predecessors.some((p) => p.state === "violated"),
      predecessorCodes: predecessors.map((p) => p.edenCode),
      predecessors,
      successors,
      trelloCardUrl: task.trelloCardUrl,
      trelloSyncStatus: task.trelloSyncStatus,
      trelloLastError: task.trelloLastError,
      updatedAt: task.updatedAt,
    };
  };

  const rows: PlannerRow[] = [];
  for (const node of buildPlanningTree(snapshot.workstreams, snapshot.tasks)) {
    const { workstream } = node;
    rows.push({
      kind: "workstream",
      id: workstream.id,
      code: workstream.code,
      name: workstream.name,
      sortOrder: workstream.sortOrder,
      taskCount: node.tasks.reduce((sum, t) => sum + 1 + t.subtasks.length, 0),
    });
    for (const { task, subtasks } of node.tasks) {
      rows.push(toRow(task, 0, subtasks.length > 0));
      for (const subtask of subtasks) rows.push(toRow(subtask, 1, false));
    }
  }

  return {
    source: "database",
    project: { id: snapshot.project.id, name: snapshot.project.name },
    rows,
    workstreams: [...snapshot.workstreams]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
      .map((w) => ({ id: w.id, code: w.code, label: `${w.code} · ${w.name}` })),
    members: snapshot.members
      .filter((m) => m.active)
      .map((m) => ({ id: m.id, label: m.displayName })),
    edenCodes: snapshot.tasks.map((t) => t.edenCode),
  };
}

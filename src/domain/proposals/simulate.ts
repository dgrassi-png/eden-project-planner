import { issue, type Issue } from "../result";
import { countWorkingDays, isWorkingDay } from "../planning/calendar";
import { validateLag, validateNewDependency } from "../planning/dependencyRules";
import { normalizeCode } from "../planning/edenCode";
import { checkDependencies, type DependencyCheck } from "../planning/scheduling";
import {
  prepareNewTask,
  prepareTaskUpdate,
  type NewTaskInput,
  type TaskChanges,
  type TaskPatch,
  type TaskRuleContext,
} from "../planning/taskRules";
import type { Member, PlanningSnapshot, Task, TaskDependency } from "../planning/types";
import type { BatchOp } from "../planning/writes";

import type { ProposalChange, ProposalPayload } from "./schema";

/**
 * Applies a proposal to a copy of the plan, change by change, with the same
 * domain rules as a manual edit. Produces the writes to apply, a readable
 * BEFORE → PROPOSED diff and the dependency impact. Pure: nothing is saved.
 */

export interface FieldDiff {
  field: string;
  before: string;
  after: string;
}

export interface EntityDiff {
  kind: "task-create" | "task-update" | "dependency-add" | "dependency-update" | "dependency-remove";
  /** E:DEN code, or "PRED → SUCC" for dependencies. */
  label: string;
  fields: FieldDiff[];
}

export interface ProposalIssue extends Issue {
  /** 1-based index of the change in the proposal. */
  change: number;
}

export interface ProposalPreview {
  valid: boolean;
  issues: ProposalIssue[];
  diffs: EntityDiff[];
  ops: BatchOp[];
  /** Violations that exist after the proposal but not before. */
  newViolations: DependencyCheck[];
  resolvedViolations: DependencyCheck[];
}

const TBD = "TBD";

type DiffField = { key: keyof Task; label: string };
const DIFF_FIELDS: DiffField[] = [
  { key: "title", label: "Title" },
  { key: "workstreamId", label: "Workstream" },
  { key: "ownerMemberId", label: "Owner" },
  { key: "isMilestone", label: "Milestone" },
  { key: "plannedStart", label: "Start" },
  { key: "plannedDurationDays", label: "Duration (wd)" },
  { key: "plannedFinish", label: "Finish" },
  { key: "deadline", label: "Deadline" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "geography", label: "Geography" },
  { key: "progressPercent", label: "Progress %" },
  { key: "splittable", label: "Splittable" },
  { key: "blocker", label: "Blocker" },
  { key: "waitingFor", label: "Waiting for" },
  { key: "description", label: "Description" },
  { key: "notes", label: "Notes" },
];

function findMember(members: Member[], ref: string): Member[] {
  const needle = ref.trim().toLowerCase();
  return members.filter((m) => m.active && (m.displayName.toLowerCase() === needle || m.email?.toLowerCase() === needle || m.id === ref));
}

export function simulateProposal(snapshot: PlanningSnapshot, payload: ProposalPayload, newId: () => string): ProposalPreview {
  const tasks: Task[] = snapshot.tasks.map((t) => ({ ...t }));
  const deps: TaskDependency[] = snapshot.dependencies.map((d) => ({ ...d }));
  const original = new Map(snapshot.tasks.map((t) => [t.id, t]));
  const created = new Set<string>();
  const issues: ProposalIssue[] = [];
  const ops: BatchOp[] = [];
  const updateOpIndex = new Map<string, number>();
  const depDiffs: EntityDiff[] = [];

  const byCode = (ref: string) => tasks.find((t) => t.edenCode === normalizeCode(ref));
  const ruleContext = (): TaskRuleContext => ({
    projectId: snapshot.project.id,
    workstreams: snapshot.workstreams,
    members: snapshot.members,
    tasks,
  });

  function resolveOwner(ref: string | null | undefined, n: number): string | null | undefined | false {
    if (ref === undefined || ref === null) return ref;
    const matches = findMember(snapshot.members, ref);
    if (matches.length === 1) return (matches[0] as Member).id;
    issues.push({ change: n, ...issue(matches.length ? "OWNER_AMBIGUOUS" : "OWNER_NOT_FOUND", `Owner "${ref}" ${matches.length ? "matches several people" : "is not an active project member"}`) });
    return false;
  }

  function resolveWorkstream(ref: string | undefined, n: number): string | undefined | false {
    if (ref === undefined) return undefined;
    const ws = snapshot.workstreams.find((w) => w.code === ref.trim().toUpperCase());
    if (ws) return ws.id;
    issues.push({ change: n, ...issue("WORKSTREAM_NOT_FOUND", `Workstream ${ref} does not exist`) });
    return false;
  }

  /** Translates a target finish into a duration (tasks) or a date (milestones). */
  function applyFinish(patch: TaskPatch, finish: string | undefined, base: Task | null, n: number): boolean {
    if (finish === undefined) return true;
    const isMilestone = patch.isMilestone ?? base?.isMilestone ?? false;
    if (isMilestone) {
      patch.plannedStart = finish;
      return true;
    }
    const start = patch.plannedStart === undefined ? (base?.plannedStart ?? null) : patch.plannedStart;
    if (start === null) {
      issues.push({ change: n, ...issue("FINISH_WITHOUT_START", "A finish date needs a planned start") });
      return false;
    }
    if (!isWorkingDay(finish) || finish < start) {
      issues.push({ change: n, ...issue("FINISH_INVALID", `Finish ${finish} must be a working day on or after the start ${start}`) });
      return false;
    }
    patch.plannedDurationDays = countWorkingDays(start, finish);
    return true;
  }

  function planFields(set: Record<string, unknown>, base: Task | null, n: number): TaskPatch | null {
    const { owner, plannedFinish, workstream, ...rest } = set as Record<string, unknown> & {
      owner?: string | null;
      plannedFinish?: string;
      workstream?: string;
    };
    const patch = { ...rest } as TaskPatch;
    const ownerId = resolveOwner(owner, n);
    if (ownerId === false) return null;
    if (ownerId !== undefined) patch.ownerMemberId = ownerId;
    const workstreamId = resolveWorkstream(workstream, n);
    if (workstreamId === false) return null;
    if (workstreamId !== undefined) patch.workstreamId = workstreamId;
    return applyFinish(patch, plannedFinish, base, n) ? patch : null;
  }

  function run(change: ProposalChange, n: number) {
    switch (change.op) {
      case "update_task": {
        const task = byCode(change.task);
        if (!task) return void issues.push({ change: n, ...issue("TASK_NOT_FOUND", `${change.task} does not exist`) });
        if (created.has(task.id)) {
          return void issues.push({ change: n, ...issue("UPDATE_OF_NEW_TASK", `Set the fields of ${task.edenCode} in its create_task change`) });
        }
        const patch = planFields(change.set, task, n);
        if (!patch) return;
        const result = prepareTaskUpdate(task, patch, ruleContext());
        if (!result.ok) return void issues.push(...result.issues.map((i) => ({ change: n, ...i, message: `${task.edenCode}: ${i.message}` })));
        Object.assign(task, result.value);
        // One update op per task, holding the net change against the stored version.
        const base = original.get(task.id) as Task;
        const net: TaskChanges = {};
        for (const { key } of DIFF_FIELDS) {
          if (key in base && task[key] !== base[key]) (net as Record<string, unknown>)[key] = task[key];
        }
        const op: BatchOp = { kind: "updateTask", id: task.id, changes: net, expectedUpdatedAt: base.updatedAt };
        const index = updateOpIndex.get(task.id);
        if (index === undefined) {
          updateOpIndex.set(task.id, ops.length);
          ops.push(op);
        } else ops[index] = op;
        return;
      }
      case "create_task": {
        const { edenCode, title, workstream, parent, ...set } = change.task;
        const patch = planFields({ ...set, workstream }, null, n);
        if (!patch) return;
        const parentTask = parent ? byCode(parent) : undefined;
        if (parent && !parentTask) return void issues.push({ change: n, ...issue("PARENT_NOT_FOUND", `Parent ${parent} does not exist`) });
        const input: NewTaskInput = { ...patch, edenCode, title, parentTaskId: parentTask?.id ?? null };
        const result = prepareNewTask(input, ruleContext());
        if (!result.ok) return void issues.push(...result.issues.map((i) => ({ change: n, ...i, message: `${edenCode}: ${i.message}` })));
        const id = newId();
        const stamp = "(new)";
        tasks.push({
          ...result.value,
          id,
          trelloCardId: null,
          trelloCardUrl: null,
          trelloSyncStatus: "NOT_SYNCED",
          trelloSyncedHash: null,
          trelloSyncedAt: null,
          trelloLastError: null,
          createdAt: stamp,
          updatedAt: stamp,
        });
        created.add(id);
        ops.push({ kind: "createTask", id, draft: result.value });
        return;
      }
      case "add_dependency": {
        const pred = byCode(change.predecessor);
        const succ = byCode(change.successor);
        if (!pred || !succ) {
          return void issues.push({ change: n, ...issue("TASK_NOT_FOUND", `${!pred ? change.predecessor : change.successor} does not exist`) });
        }
        const input = { predecessorTaskId: pred.id, successorTaskId: succ.id, lagDays: change.lagDays ?? 0 };
        const problems = validateNewDependency(input, tasks, deps);
        if (problems.length) return void issues.push(...problems.map((i) => ({ change: n, ...i })));
        const id = newId();
        deps.push({ id, projectId: snapshot.project.id, ...input, createdAt: "(new)" });
        ops.push({ kind: "createDependency", id, projectId: snapshot.project.id, input });
        depDiffs.push({
          kind: "dependency-add",
          label: `${pred.edenCode} → ${succ.edenCode}`,
          fields: [{ field: "Dependency", before: "—", after: `finish-to-start${input.lagDays ? ` +${input.lagDays} wd` : ""}` }],
        });
        return;
      }
      case "update_dependency":
      case "remove_dependency": {
        const pred = byCode(change.predecessor);
        const succ = byCode(change.successor);
        const dep = pred && succ ? deps.find((d) => d.predecessorTaskId === pred.id && d.successorTaskId === succ.id) : undefined;
        const label = `${pred?.edenCode ?? change.predecessor} → ${succ?.edenCode ?? change.successor}`;
        if (!dep) return void issues.push({ change: n, ...issue("DEPENDENCY_NOT_FOUND", `There is no dependency ${label}`) });
        if (!snapshot.dependencies.some((d) => d.id === dep.id)) {
          return void issues.push({ change: n, ...issue("DEPENDENCY_NEW", `${label} is added by this proposal; change the add_dependency instead`) });
        }
        if (change.op === "remove_dependency") {
          deps.splice(deps.indexOf(dep), 1);
          ops.push({ kind: "deleteDependency", id: dep.id });
          depDiffs.push({ kind: "dependency-remove", label, fields: [{ field: "Dependency", before: `finish-to-start${dep.lagDays ? ` +${dep.lagDays} wd` : ""}`, after: "removed" }] });
          return;
        }
        const lagIssues = validateLag(change.lagDays);
        if (lagIssues.length) return void issues.push(...lagIssues.map((i) => ({ change: n, ...i })));
        if (change.lagDays === dep.lagDays) return;
        depDiffs.push({ kind: "dependency-update", label, fields: [{ field: "Lag (wd)", before: String(dep.lagDays), after: String(change.lagDays) }] });
        dep.lagDays = change.lagDays;
        ops.push({ kind: "updateDependency", id: dep.id, lagDays: change.lagDays });
        return;
      }
    }
  }

  payload.changes.forEach((change, index) => run(change, index + 1));

  const show = (task: Task, key: keyof Task): string => {
    const value = task[key];
    if (value === null || value === undefined) return TBD;
    if (key === "ownerMemberId") return snapshot.members.find((m) => m.id === value)?.displayName ?? String(value);
    if (key === "workstreamId") return snapshot.workstreams.find((w) => w.id === value)?.code ?? String(value);
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  };

  const taskDiffs: EntityDiff[] = [];
  for (const task of tasks) {
    const base = original.get(task.id);
    if (created.has(task.id)) {
      taskDiffs.push({
        kind: "task-create",
        label: task.edenCode,
        fields: DIFF_FIELDS.filter(({ key }) => task[key] !== null && task[key] !== false).map(({ key, label }) => ({
          field: label,
          before: "—",
          after: show(task, key),
        })),
      });
    } else if (base) {
      const fields = DIFF_FIELDS.filter(({ key }) => task[key] !== base[key]).map(({ key, label }) => ({
        field: label,
        before: show(base, key),
        after: show(task, key),
      }));
      if (fields.length) taskDiffs.push({ kind: "task-update", label: task.edenCode, fields });
    }
  }
  // Drop no-op updates (e.g. a field set to its current value).
  const effectiveOps = ops.filter((op) => op.kind !== "updateTask" || Object.keys(op.changes).length > 0);

  const pairKey = (c: DependencyCheck) => `${c.predecessorTaskId}>${c.successorTaskId}`;
  const before = new Map(checkDependencies(snapshot.tasks, snapshot.dependencies).filter((c) => c.state === "violated").map((c) => [pairKey(c), c]));
  const after = checkDependencies(tasks, deps).filter((c) => c.state === "violated");
  const afterKeys = new Set(after.map(pairKey));

  return {
    valid: issues.length === 0,
    issues,
    diffs: [...taskDiffs.sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true })), ...depDiffs],
    ops: issues.length ? [] : effectiveOps,
    newViolations: after.filter((c) => (before.get(pairKey(c))?.conflictDays ?? 0) < c.conflictDays),
    resolvedViolations: [...before.values()].filter((c) => !afterKeys.has(pairKey(c))),
  };
}

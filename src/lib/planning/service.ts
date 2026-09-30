import { validateLag, validateNewDependency, type NewDependencyInput } from "@/domain/planning/dependencyRules";
import {
  prepareMember,
  prepareProject,
  prepareWorkstream,
  prepareWorkstreamUpdate,
} from "@/domain/planning/entityRules";
import {
  checkTaskDeletion,
  prepareNewTask,
  prepareTaskUpdate,
  type NewTaskInput,
  type TaskChanges,
  type TaskPatch,
  type TaskRuleContext,
} from "@/domain/planning/taskRules";
import {
  checkDependencies,
  describeImpact,
  impactOfChange,
  planCascade,
  type CascadePlan,
  type DependencyCheck,
} from "@/domain/planning/scheduling";
import type { Member, PlanningSnapshot, Project, Task, TaskDependency, Workstream } from "@/domain/planning/types";
import type { Result } from "@/domain/result";

import { PlanningError } from "./errors";
import type { BatchOp, PlanningStore } from "./store";

/** The cascade moves the user reviewed; the server re-plans and refuses if they no longer match. */
export interface CascadeConfirmation {
  moves: { taskId: string; toStart: string }[];
}

export interface TaskImpactPreview {
  taskId: string;
  edenCode: string;
  /** Fields that would change, planned finish re-derived. */
  changes: TaskChanges;
  /** Readable conflict messages, e.g. "Moving TEC-001 creates a 5-day conflict with TEC-002." */
  messages: string[];
  created: DependencyCheck[];
  resolved: DependencyCheck[];
  cascade: CascadePlan;
}

function valueOrThrow<T>(result: Result<T>): T {
  if (!result.ok) throw PlanningError.validation(result.issues);
  return result.value;
}

/**
 * Planning use cases. Every write is validated by the domain rules first
 * (readable errors). The database then re-checks the same invariants and
 * records the audit event in the same transaction.
 */
export class PlanningService {
  constructor(private readonly store: PlanningStore) {}

  // Projects ----------------------------------------------------------------

  listProjects(): Promise<Project[]> {
    return this.store.listProjects();
  }

  async createProject(input: { name: string; slug: string; description?: string | null }): Promise<Project> {
    return this.store.createProject(valueOrThrow(prepareProject(input)));
  }

  async requireProject(projectId: string): Promise<Project> {
    const project = await this.store.getProject(projectId);
    if (!project) throw PlanningError.notFound("Project");
    return project;
  }

  async getSnapshot(projectId: string): Promise<PlanningSnapshot> {
    const project = await this.requireProject(projectId);
    const [workstreams, members, tasks, dependencies] = await Promise.all([
      this.store.listWorkstreams(projectId),
      this.store.listMembers(projectId),
      this.store.listTasks(projectId),
      this.store.listDependencies(projectId),
    ]);
    return { project, workstreams, members, tasks, dependencies };
  }

  // Workstreams -------------------------------------------------------------

  async listWorkstreams(projectId: string): Promise<Workstream[]> {
    await this.requireProject(projectId);
    return this.store.listWorkstreams(projectId);
  }

  async createWorkstream(projectId: string, input: { code: string; name: string; sortOrder?: number }): Promise<Workstream> {
    await this.requireProject(projectId);
    const existing = await this.store.listWorkstreams(projectId);
    return this.store.createWorkstream(projectId, valueOrThrow(prepareWorkstream(input, existing)));
  }

  async updateWorkstream(id: string, patch: { name?: string; sortOrder?: number }): Promise<Workstream> {
    const current = await this.store.getWorkstream(id);
    if (!current) throw PlanningError.notFound("Workstream");
    const changes = valueOrThrow(prepareWorkstreamUpdate(current, patch));
    return Object.keys(changes).length ? this.store.updateWorkstream(id, changes) : current;
  }

  async deleteWorkstream(id: string): Promise<void> {
    const current = await this.store.getWorkstream(id);
    if (!current) throw PlanningError.notFound("Workstream");
    const tasks = (await this.store.listTasks(current.projectId)).filter((t) => t.workstreamId === id);
    if (tasks.length) {
      throw PlanningError.conflict(`Workstream ${current.code} still has ${tasks.length} task(s); move or delete them first`, [
        { code: "WORKSTREAM_HAS_TASKS", message: `Workstream ${current.code} still has tasks` },
      ]);
    }
    await this.store.deleteWorkstream(id);
  }

  // Members -----------------------------------------------------------------

  async listMembers(projectId: string): Promise<Member[]> {
    await this.requireProject(projectId);
    return this.store.listMembers(projectId);
  }

  async createMember(projectId: string, input: { displayName: string; email?: string | null }): Promise<Member> {
    await this.requireProject(projectId);
    return this.store.createMember(projectId, valueOrThrow(prepareMember(input)));
  }

  // Tasks -------------------------------------------------------------------

  private async ruleContext(projectId: string): Promise<TaskRuleContext> {
    const [workstreams, members, tasks] = await Promise.all([
      this.store.listWorkstreams(projectId),
      this.store.listMembers(projectId),
      this.store.listTasks(projectId),
    ]);
    return { projectId, workstreams, members, tasks };
  }

  async listTasks(projectId: string): Promise<Task[]> {
    await this.requireProject(projectId);
    return this.store.listTasks(projectId);
  }

  async getTask(id: string): Promise<Task> {
    const task = await this.store.getTask(id);
    if (!task) throw PlanningError.notFound("Task");
    return task;
  }

  async createTask(projectId: string, input: NewTaskInput): Promise<Task> {
    await this.requireProject(projectId);
    const draft = valueOrThrow(prepareNewTask(input, await this.ruleContext(projectId)));
    return this.store.createTask(draft);
  }

  /**
   * Applies a patch. Pass `expectedUpdatedAt` (the version the editor loaded)
   * to reject edits based on stale data instead of overwriting them. Other
   * tasks are never moved, unless `cascade` confirms the reviewed moves: then
   * the change and the cascade are applied together, atomically.
   */
  async updateTask(id: string, patch: TaskPatch, expectedUpdatedAt?: string, cascade?: CascadeConfirmation): Promise<Task> {
    const current = await this.getTask(id);
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== current.updatedAt) throw staleEdit(current);
    const ctx = await this.ruleContext(current.projectId);
    const changes = valueOrThrow(prepareTaskUpdate(current, patch, ctx));
    if (cascade) {
      const next = { ...current, ...changes };
      const dependencies = await this.store.listDependencies(current.projectId);
      const plan = planCascade(ctx.tasks as Task[], dependencies, id, new Map([[id, next]]));
      const ops: BatchOp[] = [];
      if (Object.keys(changes).length) ops.push({ kind: "updateTask", id, changes, expectedUpdatedAt: current.updatedAt });
      ops.push(...this.cascadeOps(plan, cascade, ctx));
      if (ops.length) await this.store.applyBatch(ops, { cascade_from: current.edenCode });
      return this.getTask(id);
    }
    if (!Object.keys(changes).length) return current;
    const updated = await this.store.updateTask(id, changes, current.updatedAt);
    if (!updated) throw staleEdit(current);
    return updated;
  }

  /** What a patch would do to the schedule, without saving anything. */
  async previewTaskUpdate(id: string, patch: TaskPatch): Promise<TaskImpactPreview> {
    const current = await this.getTask(id);
    const ctx = await this.ruleContext(current.projectId);
    const changes = valueOrThrow(prepareTaskUpdate(current, patch, ctx));
    const dependencies = await this.store.listDependencies(current.projectId);
    const impact = impactOfChange(ctx.tasks as Task[], dependencies, id, { ...current, ...changes });
    return {
      taskId: id,
      edenCode: current.edenCode,
      changes,
      messages: describeImpact(current.edenCode, impact),
      created: impact.created,
      resolved: impact.resolved,
      cascade: impact.cascade,
    };
  }

  /** Cascade plan that would resolve the conflicts downstream of a task as it is now. */
  async previewCascade(id: string): Promise<CascadePlan> {
    const current = await this.getTask(id);
    const [tasks, dependencies] = await Promise.all([
      this.store.listTasks(current.projectId),
      this.store.listDependencies(current.projectId),
    ]);
    return planCascade(tasks, dependencies, id);
  }

  /** Applies the reviewed cascade downstream of a task, without changing the task itself. */
  async applyCascade(id: string, confirmation: CascadeConfirmation): Promise<CascadePlan> {
    const current = await this.getTask(id);
    const ctx = await this.ruleContext(current.projectId);
    const plan = planCascade(ctx.tasks as Task[], await this.store.listDependencies(current.projectId), id);
    const ops = this.cascadeOps(plan, confirmation, ctx);
    if (ops.length) await this.store.applyBatch(ops, { cascade_from: current.edenCode });
    return plan;
  }

  /** Dependency checks of a project (ok / violated / unknown / inactive). */
  async scheduleChecks(projectId: string): Promise<DependencyCheck[]> {
    await this.requireProject(projectId);
    const [tasks, dependencies] = await Promise.all([this.store.listTasks(projectId), this.store.listDependencies(projectId)]);
    return checkDependencies(tasks, dependencies);
  }

  private cascadeOps(plan: CascadePlan, confirmation: CascadeConfirmation, ctx: TaskRuleContext): BatchOp[] {
    const planned = plan.moves.map((m) => `${m.taskId}:${m.toStart}`).sort();
    const confirmed = confirmation.moves.map((m) => `${m.taskId}:${m.toStart}`).sort();
    if (planned.join(",") !== confirmed.join(",")) {
      throw PlanningError.conflict("The cascade changed since it was previewed; review it again", [
        { code: "CASCADE_CHANGED", message: "The cascade changed since it was previewed" },
      ]);
    }
    const tasks = ctx.tasks as Task[];
    return plan.moves.map((move) => {
      const task = tasks.find((t) => t.id === move.taskId) as Task;
      const changes = valueOrThrow(prepareTaskUpdate(task, { plannedStart: move.toStart }, ctx));
      return { kind: "updateTask", id: task.id, changes, expectedUpdatedAt: task.updatedAt };
    });
  }

  async deleteTask(id: string): Promise<void> {
    const task = await this.getTask(id);
    const issues = checkTaskDeletion(task, await this.store.listTasks(task.projectId));
    if (issues.length) throw PlanningError.conflict(issues[0]?.message ?? "Task has subtasks", issues);
    await this.store.deleteTask(id);
  }

  // Dependencies ------------------------------------------------------------

  async createDependency(input: NewDependencyInput): Promise<TaskDependency> {
    const predecessor = await this.store.getTask(input.predecessorTaskId);
    if (!predecessor) throw PlanningError.validation([{ code: "PREDECESSOR_NOT_FOUND", message: "Predecessor task not found" }]);
    const projectId = predecessor.projectId;
    const [tasks, dependencies] = await Promise.all([this.store.listTasks(projectId), this.store.listDependencies(projectId)]);
    // Tasks from other projects are not loaded, so a foreign successor is reported as not found.
    const issues = validateNewDependency(input, tasks, dependencies);
    if (issues.length) throw PlanningError.validation(issues);
    return this.store.createDependency(projectId, {
      predecessorTaskId: input.predecessorTaskId,
      successorTaskId: input.successorTaskId,
      lagDays: input.lagDays ?? 0,
    });
  }

  async updateDependency(id: string, patch: { lagDays: number }): Promise<TaskDependency> {
    const current = await this.store.getDependency(id);
    if (!current) throw PlanningError.notFound("Dependency");
    const issues = validateLag(patch.lagDays);
    if (issues.length) throw PlanningError.validation(issues);
    return patch.lagDays === current.lagDays ? current : this.store.updateDependency(id, patch.lagDays);
  }

  async deleteDependency(id: string): Promise<void> {
    const current = await this.store.getDependency(id);
    if (!current) throw PlanningError.notFound("Dependency");
    await this.store.deleteDependency(id);
  }
}

function staleEdit(current: Task): PlanningError {
  return PlanningError.conflict(`${current.edenCode} was changed by someone else; reload and try again`, [
    { code: "STALE_EDIT", message: `${current.edenCode} was changed by someone else` },
  ]);
}

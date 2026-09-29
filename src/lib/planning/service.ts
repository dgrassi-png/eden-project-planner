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
  type TaskPatch,
  type TaskRuleContext,
} from "@/domain/planning/taskRules";
import type { Member, PlanningSnapshot, Project, Task, TaskDependency, Workstream } from "@/domain/planning/types";
import type { Result } from "@/domain/result";

import { PlanningError } from "./errors";
import type { PlanningStore } from "./store";

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
   * to reject edits based on stale data instead of overwriting them.
   */
  async updateTask(id: string, patch: TaskPatch, expectedUpdatedAt?: string): Promise<Task> {
    const current = await this.getTask(id);
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== current.updatedAt) throw staleEdit(current);
    const changes = valueOrThrow(prepareTaskUpdate(current, patch, await this.ruleContext(current.projectId)));
    if (!Object.keys(changes).length) return current;
    const updated = await this.store.updateTask(id, changes, current.updatedAt);
    if (!updated) throw staleEdit(current);
    return updated;
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

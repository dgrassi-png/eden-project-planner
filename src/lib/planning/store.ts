import type { MemberDraft, ProjectDraft, WorkstreamDraft } from "@/domain/planning/entityRules";
import type { TaskChanges, TaskDraft } from "@/domain/planning/taskRules";
import type { Member, Project, Task, TaskDependency, Workstream } from "@/domain/planning/types";

/**
 * Persistence port for planning data. The SQLite implementation is the
 * only production store; an in-memory implementation backs service tests.
 * Implementations throw `PlanningError` on failure.
 */
export interface PlanningStore {
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(draft: ProjectDraft): Promise<Project>;

  listWorkstreams(projectId: string): Promise<Workstream[]>;
  getWorkstream(id: string): Promise<Workstream | null>;
  createWorkstream(projectId: string, draft: WorkstreamDraft): Promise<Workstream>;
  updateWorkstream(id: string, changes: Partial<Pick<Workstream, "name" | "sortOrder">>): Promise<Workstream>;
  deleteWorkstream(id: string): Promise<void>;

  listMembers(projectId: string): Promise<Member[]>;
  createMember(projectId: string, draft: MemberDraft): Promise<Member>;

  listTasks(projectId: string): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(draft: TaskDraft): Promise<Task>;
  /** Returns null when `expectedUpdatedAt` no longer matches (concurrent edit). */
  updateTask(id: string, changes: TaskChanges, expectedUpdatedAt?: string): Promise<Task | null>;
  deleteTask(id: string): Promise<void>;

  listDependencies(projectId: string): Promise<TaskDependency[]>;
  getDependency(id: string): Promise<TaskDependency | null>;
  createDependency(
    projectId: string,
    input: Pick<TaskDependency, "predecessorTaskId" | "successorTaskId" | "lagDays">,
  ): Promise<TaskDependency>;
  updateDependency(id: string, lagDays: number): Promise<TaskDependency>;
  deleteDependency(id: string): Promise<void>;
}

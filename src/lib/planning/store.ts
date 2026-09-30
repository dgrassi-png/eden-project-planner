import type { MemberDraft, ProjectDraft, WorkstreamDraft } from "@/domain/planning/entityRules";
import type { TaskChanges, TaskDraft } from "@/domain/planning/taskRules";
import type { TrelloSyncState } from "@/domain/planning/constants";
import type { Member, Project, Task, TaskDependency, Workstream } from "@/domain/planning/types";
import type { TrelloSettings } from "@/domain/trello/mapping";

/** Sync bookkeeping written by the Trello sync (never touches planning fields or `updatedAt`). */
export interface TrelloLinkUpdate {
  trelloSyncStatus: TrelloSyncState;
  trelloLastError: string | null;
  trelloCardId?: string | null;
  trelloCardUrl?: string | null;
  trelloSyncedHash?: string | null;
  trelloSyncedAt?: string | null;
}

export type MemberChanges = Partial<Pick<Member, "displayName" | "email" | "trelloMemberId" | "active">>;

/** One step of an atomic batch (cascade, proposal apply). IDs of new rows are chosen by the caller. */
export type BatchOp =
  | { kind: "createTask"; id: string; draft: TaskDraft }
  | { kind: "updateTask"; id: string; changes: TaskChanges; expectedUpdatedAt: string }
  | {
      kind: "createDependency";
      id: string;
      projectId: string;
      input: Pick<TaskDependency, "predecessorTaskId" | "successorTaskId" | "lagDays">;
    }
  | { kind: "updateDependency"; id: string; lagDays: number }
  | { kind: "deleteDependency"; id: string };

/**
 * Persistence port for planning data, implemented on SQLite
 * (`sqliteStore.ts`; tests use an in-memory SQLite database).
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
  getMember(id: string): Promise<Member | null>;
  createMember(projectId: string, draft: MemberDraft): Promise<Member>;
  updateMember(id: string, changes: MemberChanges): Promise<Member>;

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

  /**
   * Applies every op in one transaction, or none. A task whose version no
   * longer matches `expectedUpdatedAt` aborts the batch with STALE_EDIT.
   * `metadata` is added to each audit event (e.g. `{ cascade_from: "TEC-001" }`).
   */
  applyBatch(ops: BatchOp[], metadata?: Record<string, unknown>): Promise<void>;

  getTrelloSettings(projectId: string): Promise<TrelloSettings | null>;
  saveTrelloSettings(settings: Omit<TrelloSettings, "updatedAt">): Promise<TrelloSettings>;
  recordTrelloSync(taskId: string, link: TrelloLinkUpdate): Promise<void>;
}

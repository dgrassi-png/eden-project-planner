import type { Member, Project, Task, TaskDependency, Workstream } from "@/domain/planning/types";

import { PlanningError } from "./errors";
import type { PlanningStore } from "./store";

/**
 * In-memory PlanningStore for tests. It mirrors the uniqueness and
 * reference rules the database enforces, but not every trigger. Database
 * behaviour is covered by the SQLite store tests (src/lib/db, sqliteStore.test.ts).
 */
export function createMemoryPlanningStore(): PlanningStore & { clock: { tick(): void } } {
  const projects = new Map<string, Project>();
  const workstreams = new Map<string, Workstream>();
  const members = new Map<string, Member>();
  const tasks = new Map<string, Task>();
  const dependencies = new Map<string, TaskDependency>();
  let counter = 0;
  let now = Date.UTC(2026, 0, 1);
  const id = (prefix: string) => `${prefix}-${++counter}`;
  const timestamp = () => new Date(now).toISOString();
  const clock = { tick: () => void (now += 1000) };

  const referenced = (message: string) => PlanningError.conflict(message);

  return {
    clock,

    async listProjects() {
      return [...projects.values()];
    },
    async getProject(projectId) {
      return projects.get(projectId) ?? null;
    },
    async createProject(draft) {
      if ([...projects.values()].some((p) => p.slug === draft.slug)) throw PlanningError.conflict("Slug already exists");
      const project: Project = { id: id("project"), trelloBoardId: null, createdAt: timestamp(), updatedAt: timestamp(), ...draft };
      projects.set(project.id, project);
      return project;
    },

    async listWorkstreams(projectId) {
      return [...workstreams.values()].filter((w) => w.projectId === projectId);
    },
    async getWorkstream(workstreamId) {
      return workstreams.get(workstreamId) ?? null;
    },
    async createWorkstream(projectId, draft) {
      if ([...workstreams.values()].some((w) => w.projectId === projectId && w.code === draft.code))
        throw PlanningError.conflict("Workstream code already exists");
      const ws: Workstream = { id: id("ws"), projectId, createdAt: timestamp(), updatedAt: timestamp(), ...draft };
      workstreams.set(ws.id, ws);
      return ws;
    },
    async updateWorkstream(workstreamId, changes) {
      const current = workstreams.get(workstreamId);
      if (!current) throw PlanningError.notFound("Workstream");
      const next = { ...current, ...changes, updatedAt: timestamp() };
      workstreams.set(workstreamId, next);
      return next;
    },
    async deleteWorkstream(workstreamId) {
      if ([...tasks.values()].some((t) => t.workstreamId === workstreamId)) throw referenced("Workstream has tasks");
      workstreams.delete(workstreamId);
    },

    async listMembers(projectId) {
      return [...members.values()].filter((m) => m.projectId === projectId);
    },
    async createMember(projectId, draft) {
      const member: Member = {
        id: id("member"),
        projectId,
        edenUserId: null,
        trelloMemberId: null,
        active: true,
        createdAt: timestamp(),
        updatedAt: timestamp(),
        ...draft,
      };
      members.set(member.id, member);
      return member;
    },

    async listTasks(projectId) {
      return [...tasks.values()].filter((t) => t.projectId === projectId);
    },
    async getTask(taskId) {
      return tasks.get(taskId) ?? null;
    },
    async createTask(draft) {
      if ([...tasks.values()].some((t) => t.projectId === draft.projectId && t.edenCode === draft.edenCode))
        throw PlanningError.conflict("E:DEN code already exists");
      const task: Task = {
        id: id("task"),
        trelloCardId: null,
        trelloCardUrl: null,
        trelloSyncStatus: "NOT_SYNCED",
        createdAt: timestamp(),
        updatedAt: timestamp(),
        ...draft,
      };
      tasks.set(task.id, task);
      return task;
    },
    async updateTask(taskId, changes, expectedUpdatedAt) {
      const current = tasks.get(taskId);
      if (!current || (expectedUpdatedAt !== undefined && current.updatedAt !== expectedUpdatedAt)) return null;
      const next: Task = { ...current, ...changes, updatedAt: timestamp() };
      tasks.set(taskId, next);
      if (changes.workstreamId !== undefined) {
        for (const child of tasks.values()) {
          if (child.parentTaskId === taskId) tasks.set(child.id, { ...child, workstreamId: changes.workstreamId });
        }
      }
      return next;
    },
    async deleteTask(taskId) {
      if ([...tasks.values()].some((t) => t.parentTaskId === taskId)) throw referenced("Task has subtasks");
      tasks.delete(taskId);
      for (const dep of [...dependencies.values()]) {
        if (dep.predecessorTaskId === taskId || dep.successorTaskId === taskId) dependencies.delete(dep.id);
      }
    },

    async listDependencies(projectId) {
      return [...dependencies.values()].filter((d) => d.projectId === projectId);
    },
    async getDependency(dependencyId) {
      return dependencies.get(dependencyId) ?? null;
    },
    async createDependency(projectId, input) {
      const dep: TaskDependency = { id: id("dep"), projectId, createdAt: timestamp(), ...input };
      dependencies.set(dep.id, dep);
      return dep;
    },
    async updateDependency(dependencyId, lagDays) {
      const current = dependencies.get(dependencyId);
      if (!current) throw PlanningError.notFound("Dependency");
      const next = { ...current, lagDays };
      dependencies.set(dependencyId, next);
      return next;
    },
    async deleteDependency(dependencyId) {
      dependencies.delete(dependencyId);
    },
  };
}

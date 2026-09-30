import { randomUUID } from "node:crypto";

import type BetterSqlite3 from "better-sqlite3";

import type { TaskChanges, TaskDraft } from "@/domain/planning/taskRules";
import type { TaskDependency } from "@/domain/planning/types";
import type { MemberRow, ProjectRow, TaskDependencyRow, TaskRow, WorkstreamRow } from "@/lib/db/rows";

import type { Actor } from "./actor";
import { fromSqliteError, PlanningError, type SqliteLikeError } from "./errors";
import { taskChangesToColumns, toDependency, toMember, toProject, toTask, toWorkstream } from "./mappers";
import type { BatchOp, PlanningStore } from "./store";

type Db = BetterSqlite3.Database;
type Row = Record<string, unknown>;

/** ISO timestamp strictly after `previous` (keeps optimistic-concurrency tokens unique). */
function timestampAfter(previous?: string): string {
  const now = new Date().toISOString();
  return previous && now <= previous ? new Date(Date.parse(previous) + 1).toISOString() : now;
}

function isSqliteError(error: unknown): error is SqliteLikeError {
  const code = (error as { code?: unknown } | null)?.code;
  return error instanceof Error && typeof code === "string" && code.startsWith("SQLITE");
}

function staleBatch(): PlanningError {
  return PlanningError.conflict("The plan changed while this change was being prepared; review it again", [
    { code: "STALE_EDIT", message: "The plan changed while this change was being prepared" },
  ]);
}

function changedFields(before: Row, after: Row): string[] {
  return Object.keys(after)
    .filter((key) => key !== "updated_at" && before[key] !== after[key])
    .sort();
}

/**
 * Planning store on the planner-owned SQLite database. Every write runs in an
 * IMMEDIATE transaction together with its audit event (E:DEN audit contract:
 * change + audit in the same transaction), attributed to `actor`.
 */
export function createSqlitePlanningStore(db: Db, actor: Actor): PlanningStore {
  /** Extra audit metadata for the operation in progress (e.g. cascade or proposal id). */
  let context: Row = {};
  const get = <T>(sql: string, ...params: unknown[]) => (db.prepare(sql).get(...params) as T | undefined) ?? null;
  const all = <T>(sql: string, ...params: unknown[]) => db.prepare(sql).all(...params) as T[];

  function audit(entry: {
    action: "CREATE" | "UPDATE" | "DELETE";
    entityType: string;
    entityId: string;
    projectId: string | null;
    before?: Row | null;
    after?: Row | null;
  }) {
    const metadata: Row = { source: "planner", ...context };
    if (entry.action === "UPDATE" && entry.before && entry.after) metadata.changed_fields = changedFields(entry.before, entry.after);
    db.prepare(
      `INSERT INTO audit_events (id, project_id, actor_type, actor_id, action, entity_type, entity_id, before_json, after_json, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      entry.projectId,
      actor.type,
      actor.id,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.before ? JSON.stringify(entry.before) : null,
      entry.after ? JSON.stringify(entry.after) : null,
      JSON.stringify(metadata),
      new Date().toISOString(),
    );
  }

  /** Runs `fn` in an IMMEDIATE transaction; maps SQLite errors to PlanningError. */
  function write<T>(fn: () => T): Promise<T> {
    try {
      return Promise.resolve(db.transaction(fn).immediate());
    } catch (error) {
      if (error instanceof PlanningError) return Promise.reject(error);
      if (isSqliteError(error)) return Promise.reject(fromSqliteError(error));
      return Promise.reject(error);
    }
  }

  function read<T>(fn: () => T): Promise<T> {
    try {
      return Promise.resolve(fn());
    } catch (error) {
      if (isSqliteError(error)) return Promise.reject(fromSqliteError(error));
      return Promise.reject(error);
    }
  }

  function insert(table: string, row: Row) {
    const keys = Object.keys(row);
    db.prepare(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map((k) => `@${k}`).join(", ")})`).run(row);
  }

  function update(table: string, id: string, columns: Row) {
    const keys = Object.keys(columns);
    db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = @${k}`).join(", ")} WHERE id = @__id`).run({ ...columns, __id: id });
  }

  const taskRow = (id: string) => get<TaskRow>("SELECT * FROM tasks WHERE id = ?", id);
  const workstreamRow = (id: string) => get<WorkstreamRow>("SELECT * FROM workstreams WHERE id = ?", id);
  const dependencyRow = (id: string) => get<TaskDependencyRow>("SELECT * FROM task_dependencies WHERE id = ?", id);

  function createTaskSync(draft: TaskDraft, id: string = randomUUID()): TaskRow {
    const now = new Date().toISOString();
    const row = {
      ...taskChangesToColumns(draft),
      id,
      project_id: draft.projectId,
      parent_task_id: draft.parentTaskId,
      eden_code: draft.edenCode,
      created_at: now,
      updated_at: now,
    };
    insert("tasks", row);
    const after = taskRow(id) as TaskRow;
    audit({ action: "CREATE", entityType: "tasks", entityId: after.id, projectId: after.project_id, after: after as unknown as Row });
    return after;
  }

  function updateTaskSync(id: string, changes: TaskChanges, expectedUpdatedAt?: string): TaskRow | null {
    const before = taskRow(id);
    if (!before || (expectedUpdatedAt !== undefined && before.updated_at !== expectedUpdatedAt)) return null;
    const updatedAt = timestampAfter(before.updated_at);
    const childrenBefore =
      changes.workstreamId !== undefined && changes.workstreamId !== before.workstream_id
        ? all<TaskRow>("SELECT * FROM tasks WHERE parent_task_id = ?", id)
        : [];
    update("tasks", id, { ...taskChangesToColumns(changes), updated_at: updatedAt });
    const after = taskRow(id) as TaskRow;
    audit({ action: "UPDATE", entityType: "tasks", entityId: id, projectId: after.project_id, before: before as unknown as Row, after: after as unknown as Row });
    // Subtasks moved by the workstream trigger are audited too.
    for (const child of childrenBefore) {
      const childAfter = taskRow(child.id) as TaskRow;
      audit({ action: "UPDATE", entityType: "tasks", entityId: child.id, projectId: child.project_id, before: child as unknown as Row, after: childAfter as unknown as Row });
    }
    return after;
  }

  function createDependencySync(
    projectId: string,
    input: Pick<TaskDependency, "predecessorTaskId" | "successorTaskId" | "lagDays">,
    id: string = randomUUID(),
  ): TaskDependencyRow {
    // Authoritative cycle check inside the write transaction (writers are serialised).
    const cycle = get<{ found: number }>(
      `WITH RECURSIVE downstream(id) AS (
         SELECT successor_task_id FROM task_dependencies WHERE predecessor_task_id = @successor
         UNION
         SELECT d.successor_task_id FROM task_dependencies d JOIN downstream ON d.predecessor_task_id = downstream.id
       )
       SELECT 1 AS found FROM downstream WHERE id = @predecessor LIMIT 1`,
      { successor: input.successorTaskId, predecessor: input.predecessorTaskId },
    );
    if (cycle) {
      throw PlanningError.validation([{ code: "DEPENDENCY_CYCLE", message: "This dependency would create a cycle" }]);
    }
    const row: TaskDependencyRow = {
      id,
      project_id: projectId,
      predecessor_task_id: input.predecessorTaskId,
      successor_task_id: input.successorTaskId,
      lag_days: input.lagDays,
      created_at: new Date().toISOString(),
    };
    insert("task_dependencies", row as unknown as Row);
    audit({ action: "CREATE", entityType: "task_dependencies", entityId: row.id, projectId, after: row as unknown as Row });
    return row;
  }

  function updateDependencySync(id: string, lagDays: number): TaskDependencyRow {
    const before = dependencyRow(id);
    if (!before) throw PlanningError.notFound("Dependency");
    update("task_dependencies", id, { lag_days: lagDays });
    const after = dependencyRow(id) as TaskDependencyRow;
    audit({ action: "UPDATE", entityType: "task_dependencies", entityId: id, projectId: after.project_id, before: before as unknown as Row, after: after as unknown as Row });
    return after;
  }

  function deleteDependencySync(id: string): void {
    const before = dependencyRow(id);
    if (!before) return;
    db.prepare("DELETE FROM task_dependencies WHERE id = ?").run(id);
    audit({ action: "DELETE", entityType: "task_dependencies", entityId: id, projectId: before.project_id, before: before as unknown as Row });
  }

  function applyOp(op: BatchOp): void {
    switch (op.kind) {
      case "createTask":
        createTaskSync(op.draft, op.id);
        return;
      case "updateTask":
        if (!updateTaskSync(op.id, op.changes, op.expectedUpdatedAt)) throw staleBatch();
        return;
      case "createDependency":
        createDependencySync(op.projectId, op.input, op.id);
        return;
      case "updateDependency":
        updateDependencySync(op.id, op.lagDays);
        return;
      case "deleteDependency":
        deleteDependencySync(op.id);
        return;
    }
  }

  return {
    listProjects: () => read(() => all<ProjectRow>("SELECT * FROM projects ORDER BY created_at, id").map(toProject)),
    getProject: (id) => read(() => {
      const row = get<ProjectRow>("SELECT * FROM projects WHERE id = ?", id);
      return row && toProject(row);
    }),
    createProject: (draft) =>
      write(() => {
        const now = new Date().toISOString();
        const row: ProjectRow = { id: randomUUID(), trello_board_id: null, created_at: now, updated_at: now, ...draft };
        insert("projects", row as unknown as Row);
        audit({ action: "CREATE", entityType: "projects", entityId: row.id, projectId: row.id, after: row as unknown as Row });
        return toProject(row);
      }),

    listWorkstreams: (projectId) =>
      read(() => all<WorkstreamRow>("SELECT * FROM workstreams WHERE project_id = ? ORDER BY sort_order, code", projectId).map(toWorkstream)),
    getWorkstream: (id) => read(() => {
      const row = workstreamRow(id);
      return row && toWorkstream(row);
    }),
    createWorkstream: (projectId, draft) =>
      write(() => {
        const now = new Date().toISOString();
        const row: WorkstreamRow = {
          id: randomUUID(),
          project_id: projectId,
          code: draft.code,
          name: draft.name,
          sort_order: draft.sortOrder,
          created_at: now,
          updated_at: now,
        };
        insert("workstreams", row as unknown as Row);
        audit({ action: "CREATE", entityType: "workstreams", entityId: row.id, projectId, after: row as unknown as Row });
        return toWorkstream(row);
      }),
    updateWorkstream: (id, changes) =>
      write(() => {
        const before = workstreamRow(id);
        if (!before) throw PlanningError.notFound("Workstream");
        const columns: Row = { updated_at: timestampAfter(before.updated_at) };
        if (changes.name !== undefined) columns.name = changes.name;
        if (changes.sortOrder !== undefined) columns.sort_order = changes.sortOrder;
        update("workstreams", id, columns);
        const after = workstreamRow(id) as WorkstreamRow;
        audit({ action: "UPDATE", entityType: "workstreams", entityId: id, projectId: after.project_id, before: before as unknown as Row, after: after as unknown as Row });
        return toWorkstream(after);
      }),
    deleteWorkstream: (id) =>
      write(() => {
        const before = workstreamRow(id);
        if (!before) return;
        db.prepare("DELETE FROM workstreams WHERE id = ?").run(id);
        audit({ action: "DELETE", entityType: "workstreams", entityId: id, projectId: before.project_id, before: before as unknown as Row });
      }),

    listMembers: (projectId) =>
      read(() => all<MemberRow>("SELECT * FROM members WHERE project_id = ? ORDER BY display_name, id", projectId).map(toMember)),
    createMember: (projectId, draft) =>
      write(() => {
        const now = new Date().toISOString();
        const row: MemberRow = {
          id: randomUUID(),
          project_id: projectId,
          eden_user_id: null,
          display_name: draft.displayName,
          email: draft.email,
          trello_member_id: null,
          active: 1,
          created_at: now,
          updated_at: now,
        };
        insert("members", row as unknown as Row);
        audit({ action: "CREATE", entityType: "members", entityId: row.id, projectId, after: row as unknown as Row });
        return toMember(row);
      }),

    listTasks: (projectId) => read(() => all<TaskRow>("SELECT * FROM tasks WHERE project_id = ?", projectId).map(toTask)),
    getTask: (id) => read(() => {
      const row = taskRow(id);
      return row && toTask(row);
    }),
    createTask: (draft) => write(() => toTask(createTaskSync(draft))),
    updateTask: (id, changes: TaskChanges, expectedUpdatedAt) =>
      write(() => {
        const row = updateTaskSync(id, changes, expectedUpdatedAt);
        return row && toTask(row);
      }),
    deleteTask: (id) =>
      write(() => {
        const before = taskRow(id);
        if (!before) return;
        const dependencies = all<TaskDependencyRow>(
          "SELECT * FROM task_dependencies WHERE predecessor_task_id = ? OR successor_task_id = ?",
          id,
          id,
        );
        db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
        for (const dependency of dependencies) {
          audit({ action: "DELETE", entityType: "task_dependencies", entityId: dependency.id, projectId: dependency.project_id, before: dependency as unknown as Row });
        }
        audit({ action: "DELETE", entityType: "tasks", entityId: id, projectId: before.project_id, before: before as unknown as Row });
      }),

    listDependencies: (projectId) =>
      read(() => all<TaskDependencyRow>("SELECT * FROM task_dependencies WHERE project_id = ?", projectId).map(toDependency)),
    getDependency: (id) => read(() => {
      const row = dependencyRow(id);
      return row && toDependency(row);
    }),
    createDependency: (projectId, input) => write(() => toDependency(createDependencySync(projectId, input))),
    updateDependency: (id, lagDays) => write(() => toDependency(updateDependencySync(id, lagDays))),
    deleteDependency: (id) => write(() => deleteDependencySync(id)),

    applyBatch: (ops, metadata = {}) =>
      write(() => {
        context = metadata;
        try {
          for (const op of ops) applyOp(op);
        } finally {
          context = {};
        }
      }),
  };
}

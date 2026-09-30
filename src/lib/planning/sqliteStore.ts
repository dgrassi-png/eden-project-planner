import { randomUUID } from "node:crypto";

import type BetterSqlite3 from "better-sqlite3";

import type { TaskChanges, TaskDraft } from "@/domain/planning/taskRules";
import type { TaskDependency } from "@/domain/planning/types";
import type { SubtaskMode, TrelloSettings } from "@/domain/trello/mapping";
import type { ProposalState } from "@/domain/planning/constants";
import type { AuditEvent, ChangeProposal } from "@/domain/planning/types";
import type {
  AuditEventRow,
  ChangeProposalRow,
  MemberRow,
  ProjectRow,
  TaskDependencyRow,
  TaskRow,
  TrelloSettingsRow,
  WorkstreamRow,
} from "@/lib/db/rows";

import type { Actor } from "./actor";
import { fromSqliteError, PlanningError, type SqliteLikeError } from "./errors";
import { taskChangesToColumns, toDependency, toMember, toProject, toTask, toWorkstream } from "./mappers";
import type { BatchOp, MemberChanges, PlanningStore, TrelloLinkUpdate } from "./store";

function toProposal(row: ChangeProposalRow): ChangeProposal {
  return {
    id: row.id,
    projectId: row.project_id,
    source: row.source,
    reason: row.reason,
    payload: JSON.parse(row.payload) as unknown,
    status: row.status as ProposalState,
    submittedBy: row.submitted_by,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

const parseJson = (text: string | null) => (text === null ? null : (JSON.parse(text) as Record<string, unknown>));

function toAuditEvent(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    actorType: row.actor_type,
    actorId: row.actor_id,
    action: row.action as AuditEvent["action"],
    entityType: row.entity_type,
    entityId: row.entity_id,
    before: parseJson(row.before_json),
    after: parseJson(row.after_json),
    metadata: parseJson(row.metadata_json),
    createdAt: row.created_at,
  };
}

function toTrelloSettings(row: TrelloSettingsRow): TrelloSettings {
  return {
    projectId: row.project_id,
    boardId: row.board_id,
    boardName: row.board_name,
    boardUrl: row.board_url,
    subtaskMode: row.subtask_mode as SubtaskMode,
    statusLists: JSON.parse(row.status_lists) as TrelloSettings["statusLists"],
    workstreamLabels: JSON.parse(row.workstream_labels) as TrelloSettings["workstreamLabels"],
    updatedAt: row.updated_at,
  };
}

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
    // A planning change makes a synced card stale until the next sync.
    const syncState = before.trello_sync_status === "SYNCED" ? { trello_sync_status: "OUT_OF_SYNC" } : {};
    update("tasks", id, { ...taskChangesToColumns(changes), ...syncState, updated_at: updatedAt });
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
      case "reviewProposal": {
        const before = get<ChangeProposalRow>("SELECT * FROM change_proposals WHERE id = ?", op.id);
        if (!before || before.status !== "PENDING") {
          throw PlanningError.conflict("This proposal was already reviewed", [
            { code: "PROPOSAL_FINAL", message: "This proposal was already reviewed" },
          ]);
        }
        const now = timestampAfter(before.updated_at ?? before.created_at);
        update("change_proposals", op.id, {
          status: op.status,
          reviewed_by: op.reviewedBy,
          reviewed_at: now,
          review_note: op.reviewNote,
          updated_at: now,
        });
        const after = get<ChangeProposalRow>("SELECT * FROM change_proposals WHERE id = ?", op.id) as ChangeProposalRow;
        audit({ action: "UPDATE", entityType: "change_proposals", entityId: op.id, projectId: after.project_id, before: before as unknown as Row, after: after as unknown as Row });
        return;
      }
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
    getMember: (id) =>
      read(() => {
        const row = get<MemberRow>("SELECT * FROM members WHERE id = ?", id);
        return row && toMember(row);
      }),
    updateMember: (id, changes: MemberChanges) =>
      write(() => {
        const before = get<MemberRow>("SELECT * FROM members WHERE id = ?", id);
        if (!before) throw PlanningError.notFound("Member");
        const columns: Row = { updated_at: timestampAfter(before.updated_at) };
        if (changes.displayName !== undefined) columns.display_name = changes.displayName;
        if (changes.email !== undefined) columns.email = changes.email;
        if (changes.trelloMemberId !== undefined) columns.trello_member_id = changes.trelloMemberId;
        if (changes.active !== undefined) columns.active = changes.active ? 1 : 0;
        update("members", id, columns);
        const after = get<MemberRow>("SELECT * FROM members WHERE id = ?", id) as MemberRow;
        audit({ action: "UPDATE", entityType: "members", entityId: id, projectId: after.project_id, before: before as unknown as Row, after: after as unknown as Row });
        return toMember(after);
      }),
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

    getTrelloSettings: (projectId) =>
      read(() => {
        const row = get<TrelloSettingsRow>("SELECT * FROM trello_settings WHERE project_id = ?", projectId);
        return row && toTrelloSettings(row);
      }),
    saveTrelloSettings: (settings) =>
      write(() => {
        const before = get<TrelloSettingsRow>("SELECT * FROM trello_settings WHERE project_id = ?", settings.projectId);
        const now = timestampAfter(before?.updated_at);
        const row: TrelloSettingsRow = {
          project_id: settings.projectId,
          board_id: settings.boardId,
          board_name: settings.boardName,
          board_url: settings.boardUrl,
          subtask_mode: settings.subtaskMode,
          status_lists: JSON.stringify(settings.statusLists),
          workstream_labels: JSON.stringify(settings.workstreamLabels),
          created_at: before?.created_at ?? now,
          updated_at: now,
        };
        if (before) {
          db.prepare(
            `UPDATE trello_settings SET board_id = @board_id, board_name = @board_name, board_url = @board_url,
               subtask_mode = @subtask_mode, status_lists = @status_lists, workstream_labels = @workstream_labels,
               updated_at = @updated_at
             WHERE project_id = @project_id`,
          ).run(row);
        } else {
          insert("trello_settings", row as unknown as Row);
        }
        audit({
          action: before ? "UPDATE" : "CREATE",
          entityType: "trello_settings",
          entityId: settings.projectId,
          projectId: settings.projectId,
          before: (before ?? null) as unknown as Row | null,
          after: row as unknown as Row,
        });
        return toTrelloSettings(row);
      }),
    recordTrelloSync: (taskId, link: TrelloLinkUpdate) =>
      write(() => {
        const before = taskRow(taskId);
        if (!before) throw PlanningError.notFound("Task");
        const columns: Row = { trello_sync_status: link.trelloSyncStatus, trello_last_error: link.trelloLastError };
        if (link.trelloCardId !== undefined) columns.trello_card_id = link.trelloCardId;
        if (link.trelloCardUrl !== undefined) columns.trello_card_url = link.trelloCardUrl;
        if (link.trelloSyncedHash !== undefined) columns.trello_synced_hash = link.trelloSyncedHash;
        if (link.trelloSyncedAt !== undefined) columns.trello_synced_at = link.trelloSyncedAt;
        // Bookkeeping only: updated_at is kept so open editors are not invalidated.
        update("tasks", taskId, columns);
        const after = taskRow(taskId) as TaskRow;
        if (changedFields(before as unknown as Row, after as unknown as Row).length === 0) return;
        audit({ action: "UPDATE", entityType: "tasks", entityId: taskId, projectId: after.project_id, before: before as unknown as Row, after: after as unknown as Row });
      }),

    createProposal: (input) =>
      write(() => {
        const now = new Date().toISOString();
        const row: ChangeProposalRow = {
          id: randomUUID(),
          project_id: input.projectId,
          source: input.source,
          reason: input.reason,
          payload: JSON.stringify(input.payload),
          status: "PENDING",
          submitted_by: input.submittedBy,
          reviewed_by: null,
          reviewed_at: null,
          review_note: null,
          created_at: now,
          updated_at: now,
        };
        insert("change_proposals", row as unknown as Row);
        audit({ action: "CREATE", entityType: "change_proposals", entityId: row.id, projectId: row.project_id, after: row as unknown as Row });
        return toProposal(row);
      }),
    getProposal: (id) =>
      read(() => {
        const row = get<ChangeProposalRow>("SELECT * FROM change_proposals WHERE id = ?", id);
        return row && toProposal(row);
      }),
    listProposals: (projectId, options = {}) =>
      read(() =>
        all<ChangeProposalRow>(
          `SELECT * FROM change_proposals WHERE project_id = @projectId AND (@status IS NULL OR status = @status)
           ORDER BY created_at DESC, id LIMIT @limit`,
          { projectId, status: options.status ?? null, limit: options.limit ?? 200 },
        ).map(toProposal),
      ),
    listAuditEvents: (filter) =>
      read(() =>
        all<AuditEventRow>(
          `SELECT * FROM audit_events
            WHERE project_id = @projectId
              AND (@entityId IS NULL OR entity_id = @entityId)
              AND (@since IS NULL OR created_at >= @since)
            ORDER BY created_at DESC, rowid DESC LIMIT @limit`,
          { projectId: filter.projectId, entityId: filter.entityId ?? null, since: filter.since ?? null, limit: filter.limit ?? 200 },
        ).map(toAuditEvent),
      ),

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

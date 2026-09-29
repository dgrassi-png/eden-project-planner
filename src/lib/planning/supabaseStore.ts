import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { fromPostgrestError, PlanningError, type PostgrestLikeError } from "./errors";
import {
  taskChangesToUpdate,
  taskDraftToInsert,
  toDependency,
  toMember,
  toProject,
  toTask,
  toWorkstream,
} from "./mappers";
import type { PlanningStore } from "./store";

type Client = SupabaseClient<Database>;

function unwrap<T>(result: { data: T; error: PostgrestLikeError | null }): NonNullable<T> {
  if (result.error) throw fromPostgrestError(result.error);
  if (result.data === null || result.data === undefined) throw new PlanningError("internal", "Database returned no data");
  return result.data;
}

function unwrapMaybe<T>(result: { data: T; error: PostgrestLikeError | null }): NonNullable<T> | null {
  if (result.error) throw fromPostgrestError(result.error);
  return result.data ?? null;
}

function check(result: { error: PostgrestLikeError | null }): void {
  if (result.error) throw fromPostgrestError(result.error);
}

/** Planning store backed by Supabase/PostgREST (service-role client, server-only). */
export function createSupabasePlanningStore(db: Client): PlanningStore {
  return {
    async listProjects() {
      return unwrap(await db.from("projects").select("*").order("created_at")).map(toProject);
    },
    async getProject(id) {
      const row = unwrapMaybe(await db.from("projects").select("*").eq("id", id).maybeSingle());
      return row && toProject(row);
    },
    async createProject(draft) {
      return toProject(unwrap(await db.from("projects").insert(draft).select().single()));
    },

    async listWorkstreams(projectId) {
      const rows = unwrap(await db.from("workstreams").select("*").eq("project_id", projectId).order("sort_order").order("code"));
      return rows.map(toWorkstream);
    },
    async getWorkstream(id) {
      const row = unwrapMaybe(await db.from("workstreams").select("*").eq("id", id).maybeSingle());
      return row && toWorkstream(row);
    },
    async createWorkstream(projectId, draft) {
      const row = unwrap(
        await db
          .from("workstreams")
          .insert({ project_id: projectId, code: draft.code, name: draft.name, sort_order: draft.sortOrder })
          .select()
          .single(),
      );
      return toWorkstream(row);
    },
    async updateWorkstream(id, changes) {
      const row = unwrap(
        await db
          .from("workstreams")
          .update({ name: changes.name, sort_order: changes.sortOrder })
          .eq("id", id)
          .select()
          .single(),
      );
      return toWorkstream(row);
    },
    async deleteWorkstream(id) {
      check(await db.from("workstreams").delete().eq("id", id));
    },

    async listMembers(projectId) {
      return unwrap(await db.from("members").select("*").eq("project_id", projectId).order("display_name")).map(toMember);
    },
    async createMember(projectId, draft) {
      const row = unwrap(
        await db
          .from("members")
          .insert({ project_id: projectId, display_name: draft.displayName, email: draft.email })
          .select()
          .single(),
      );
      return toMember(row);
    },

    async listTasks(projectId) {
      return unwrap(await db.from("tasks").select("*").eq("project_id", projectId)).map(toTask);
    },
    async getTask(id) {
      const row = unwrapMaybe(await db.from("tasks").select("*").eq("id", id).maybeSingle());
      return row && toTask(row);
    },
    async createTask(draft) {
      return toTask(unwrap(await db.from("tasks").insert(taskDraftToInsert(draft)).select().single()));
    },
    async updateTask(id, changes, expectedUpdatedAt) {
      let query = db.from("tasks").update(taskChangesToUpdate(changes)).eq("id", id);
      if (expectedUpdatedAt !== undefined) query = query.eq("updated_at", expectedUpdatedAt);
      const row = unwrapMaybe(await query.select().maybeSingle());
      return row && toTask(row);
    },
    async deleteTask(id) {
      check(await db.from("tasks").delete().eq("id", id));
    },

    async listDependencies(projectId) {
      return unwrap(await db.from("task_dependencies").select("*").eq("project_id", projectId)).map(toDependency);
    },
    async getDependency(id) {
      const row = unwrapMaybe(await db.from("task_dependencies").select("*").eq("id", id).maybeSingle());
      return row && toDependency(row);
    },
    async createDependency(projectId, input) {
      const row = unwrap(
        await db
          .from("task_dependencies")
          .insert({
            project_id: projectId,
            predecessor_task_id: input.predecessorTaskId,
            successor_task_id: input.successorTaskId,
            lag_days: input.lagDays,
          })
          .select()
          .single(),
      );
      return toDependency(row);
    },
    async updateDependency(id, lagDays) {
      return toDependency(unwrap(await db.from("task_dependencies").update({ lag_days: lagDays }).eq("id", id).select().single()));
    },
    async deleteDependency(id) {
      check(await db.from("task_dependencies").delete().eq("id", id));
    },
  };
}

/**
 * Database types for supabase-js, matching supabase/migrations.
 *
 * Hand-maintained in the `supabase gen types typescript` shape. Regenerate
 * with the Supabase CLI once a project is linked and keep this file in sync
 * with every migration.
 */

import type {
  Geography,
  ProposalState,
  TaskPriority,
  TaskStatus,
  TrelloSyncState,
} from "@/domain/planning/constants";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Required extends keyof Row, Generated extends keyof Row> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Omit<Row, Generated>>;
  Relationships: [];
};

export type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  trello_board_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkstreamRow = {
  id: string;
  project_id: string;
  code: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type MemberRow = {
  id: string;
  project_id: string;
  auth_user_id: string | null;
  display_name: string;
  email: string | null;
  trello_member_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type TaskRow = {
  id: string;
  project_id: string;
  workstream_id: string;
  parent_task_id: string | null;
  eden_code: string;
  title: string;
  description: string | null;
  owner_member_id: string | null;
  planned_start: string | null;
  planned_duration_days: number | null;
  planned_finish: string | null;
  status: TaskStatus;
  priority: TaskPriority | null;
  geography: Geography | null;
  is_milestone: boolean;
  progress_percent: number | null;
  sort_order: number;
  trello_card_id: string | null;
  trello_card_url: string | null;
  trello_sync_status: TrelloSyncState;
  created_at: string;
  updated_at: string;
};

export type TaskDependencyRow = {
  id: string;
  project_id: string;
  predecessor_task_id: string;
  successor_task_id: string;
  lag_days: number;
  created_at: string;
};

export type ChangeProposalRow = {
  id: string;
  project_id: string;
  source: string;
  reason: string | null;
  payload: Json;
  status: ProposalState;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type AuditEventRow = {
  id: string;
  project_id: string | null;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_json: Json | null;
  after_json: Json | null;
  metadata_json: Json | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      projects: Table<ProjectRow, "name" | "slug", "id" | "created_at" | "updated_at">;
      workstreams: Table<WorkstreamRow, "project_id" | "code" | "name", "id" | "project_id" | "code" | "created_at" | "updated_at">;
      members: Table<MemberRow, "project_id" | "display_name", "id" | "project_id" | "created_at" | "updated_at">;
      tasks: Table<
        TaskRow,
        "project_id" | "workstream_id" | "eden_code" | "title",
        "id" | "project_id" | "eden_code" | "parent_task_id" | "created_at" | "updated_at"
      >;
      task_dependencies: Table<
        TaskDependencyRow,
        "project_id" | "predecessor_task_id" | "successor_task_id",
        "id" | "project_id" | "predecessor_task_id" | "successor_task_id" | "created_at"
      >;
      change_proposals: Table<ChangeProposalRow, "project_id" | "source" | "payload", "id" | "created_at">;
      audit_events: Table<AuditEventRow, "actor_type" | "action" | "entity_type", "id" | "created_at">;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      task_status: TaskStatus;
      task_priority: TaskPriority;
      geography_type: Geography;
      trello_sync_state: TrelloSyncState;
      proposal_state: ProposalState;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

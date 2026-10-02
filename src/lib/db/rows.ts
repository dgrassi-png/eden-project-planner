/** Row shapes of the SQLite schema (db/migrations). Booleans are 0/1, JSON is text. */

export interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  trello_board_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkstreamRow {
  id: string;
  project_id: string;
  code: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MemberRow {
  id: string;
  project_id: string;
  eden_user_id: string | null;
  display_name: string;
  email: string | null;
  trello_member_id: string | null;
  active: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
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
  status: string;
  priority: string | null;
  geography: string | null;
  is_milestone: 0 | 1;
  progress_percent: number | null;
  deadline: string | null;
  blocker: string | null;
  waiting_for: string | null;
  notes: string | null;
  splittable: 0 | 1 | null;
  sort_order: number;
  trello_card_id: string | null;
  trello_card_url: string | null;
  trello_sync_status: string;
  trello_synced_hash: string | null;
  trello_synced_at: string | null;
  trello_last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrelloSettingsRow {
  project_id: string;
  board_id: string;
  board_name: string | null;
  board_url: string | null;
  subtask_mode: string;
  status_lists: string;
  workstream_labels: string;
  created_at: string;
  updated_at: string;
}

export interface ChangeProposalRow {
  id: string;
  project_id: string;
  source: string;
  reason: string | null;
  payload: string;
  status: string;
  submitted_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface AuditEventRow {
  id: string;
  project_id: string | null;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_json: string | null;
  after_json: string | null;
  metadata_json: string | null;
  created_at: string;
}

export interface TaskDependencyRow {
  id: string;
  project_id: string;
  predecessor_task_id: string;
  successor_task_id: string;
  lag_days: number;
  created_at: string;
}

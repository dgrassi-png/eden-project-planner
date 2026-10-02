-- Phase 04: controlled Planner -> Trello sync (one-way, previewed, idempotent).
--
-- IDs in these columns are discovered from the Trello API at configuration
-- time; they are never guessed. Card links live on the task (trello_card_id).

CREATE TABLE trello_settings (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  -- Long Trello board id, as returned by GET /boards/{id}.
  board_id TEXT NOT NULL CHECK (length(board_id) BETWEEN 1 AND 64),
  board_name TEXT,
  board_url TEXT,
  -- How subtasks appear in Trello: checklist items on the parent card, or their own cards.
  subtask_mode TEXT NOT NULL DEFAULT 'CHECKLIST' CHECK (subtask_mode IN ('CHECKLIST', 'CARD')),
  -- {"BACKLOG": "<list id>", ...}; a status without a list cannot be synced.
  status_lists TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(status_lists) AND json_type(status_lists) = 'object'),
  -- {"<workstream id>": "<label id>"}
  workstream_labels TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(workstream_labels) AND json_type(workstream_labels) = 'object'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Fingerprint of what was last sent, to report unchanged cards and skip no-op writes.
ALTER TABLE tasks ADD COLUMN trello_synced_hash TEXT;
ALTER TABLE tasks ADD COLUMN trello_synced_at TEXT;
ALTER TABLE tasks ADD COLUMN trello_last_error TEXT CHECK (trello_last_error IS NULL OR length(trello_last_error) <= 1000);

-- One card per task: the same card can never be linked twice.
CREATE UNIQUE INDEX tasks_trello_card_idx ON tasks (trello_card_id) WHERE trello_card_id IS NOT NULL;

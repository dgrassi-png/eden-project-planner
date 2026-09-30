-- Phase 05: AI change proposals with human review.
--
-- A proposal is inert data until a person applies it. Applying writes the
-- planning changes, the proposal status and their audit events in one
-- transaction. Proposals are never deleted (they are part of the history).

ALTER TABLE change_proposals ADD COLUMN submitted_by TEXT;
ALTER TABLE change_proposals ADD COLUMN review_note TEXT CHECK (review_note IS NULL OR length(review_note) <= 2000);
ALTER TABLE change_proposals ADD COLUMN updated_at TEXT;

CREATE INDEX proposals_status_idx ON change_proposals (project_id, status, created_at);

-- Reviewed proposals are final.
CREATE TRIGGER proposals_final BEFORE UPDATE ON change_proposals
  WHEN old.status <> 'PENDING'
  BEGIN SELECT RAISE(ABORT, 'PROPOSAL_FINAL: a reviewed proposal cannot change'); END;

CREATE TRIGGER proposals_payload_immutable BEFORE UPDATE OF payload, source, project_id ON change_proposals
  WHEN new.payload IS NOT old.payload OR new.source IS NOT old.source OR new.project_id IS NOT old.project_id
  BEGIN SELECT RAISE(ABORT, 'PROPOSAL_IMMUTABLE: a proposal cannot be edited, submit a new one'); END;

CREATE TRIGGER proposals_no_delete BEFORE DELETE ON change_proposals
  WHEN EXISTS (SELECT 1 FROM projects p WHERE p.id = old.project_id)
  BEGIN SELECT RAISE(ABORT, 'PROPOSAL_KEPT: proposals are part of the history'); END;

-- Phase 03: operational context and Personal Assistant constraints
-- (Product Definition §5, §26, §27). All nullable: unknown stays unknown.
--
-- deadline     external due date (not derived; may differ from planned finish)
-- blocker      what is blocking the task, free text
-- waiting_for  who/what the task waits for, free text
-- notes        planning notes
-- splittable   1 = can be split into shorter work blocks, 0 = must be one block

ALTER TABLE tasks ADD COLUMN deadline TEXT CHECK (deadline IS NULL OR date(deadline) IS deadline);
ALTER TABLE tasks ADD COLUMN blocker TEXT CHECK (blocker IS NULL OR length(blocker) <= 2000);
ALTER TABLE tasks ADD COLUMN waiting_for TEXT CHECK (waiting_for IS NULL OR length(waiting_for) <= 2000);
ALTER TABLE tasks ADD COLUMN notes TEXT CHECK (notes IS NULL OR length(notes) <= 10000);
ALTER TABLE tasks ADD COLUMN splittable INTEGER CHECK (splittable IS NULL OR splittable IN (0, 1));

CREATE INDEX audit_created_idx ON audit_events (created_at);

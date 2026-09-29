-- Integrity tests for the Phase 01 migration. Each block runs in its own
-- transaction via the runner; failures abort with a descriptive message.

begin;

insert into projects (id, name, slug) values ('00000000-0000-0000-0000-000000000001', 'Test', 'test');
insert into workstreams (id, project_id, code, name) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'TEC', 'Engineering'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001', 'CERT', 'Certification');

-- Unscheduled task: NULL planning values are allowed and are not defaulted.
insert into tasks (id, project_id, workstream_id, eden_code, title)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-0000000000a1', 'TEC-001', 'Controller');
select test.assert(
  (select priority is null and geography is null and progress_percent is null and status = 'BACKLOG'
     from tasks where eden_code = 'TEC-001'),
  'unvalidated planning values default to NULL');

-- Code format and level.
select test.expect_error($$insert into tasks (project_id, workstream_id, eden_code, title)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'tec-1', 'x')$$,
  '23514');
select test.expect_error($$insert into tasks (project_id, workstream_id, eden_code, title)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'TEC-002.1', 'x')$$,
  '23514');
select test.expect_error($$insert into tasks (project_id, workstream_id, eden_code, title)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'TEC-001', 'dup')$$,
  '23505');

-- Subtasks.
insert into tasks (id, project_id, workstream_id, parent_task_id, eden_code, title)
values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'TEC-001.1', 'Wiring');
select test.expect_error($$insert into tasks (project_id, workstream_id, parent_task_id, eden_code, title)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-0000000000b1', 'TEC-009.1', 'x')$$, 'EDEN_CODE_PARENT_PREFIX');
select test.expect_error($$insert into tasks (project_id, workstream_id, parent_task_id, eden_code, title)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000b1', 'TEC-001.2', 'x')$$, 'SUBTASK_WORKSTREAM_MISMATCH');

-- Permanent codes; titles can change.
update tasks set title = 'Controller stabilisation' where eden_code = 'TEC-001';
select test.expect_error($$update tasks set eden_code = 'TEC-099' where eden_code = 'TEC-001'$$, 'EDEN_CODE_IMMUTABLE');
select test.expect_error($$update workstreams set code = 'ENG' where code = 'TEC'$$, 'WORKSTREAM_CODE_IMMUTABLE');
select test.expect_error($$update tasks set parent_task_id = null where eden_code = 'TEC-001.1'$$, 'PARENT_IMMUTABLE');
select test.expect_error($$update tasks set is_milestone = true, planned_duration_days = 0 where eden_code = 'TEC-001'$$,
  'MILESTONE_WITH_SUBTASKS');

-- Moving a parent carries its subtasks.
update tasks set workstream_id = '00000000-0000-0000-0000-0000000000a2' where eden_code = 'TEC-001';
select test.assert(
  (select workstream_id = '00000000-0000-0000-0000-0000000000a2' from tasks where eden_code = 'TEC-001.1'),
  'subtask follows parent workstream');

-- Scheduling invariants.
update tasks set planned_start = '2026-10-05', planned_duration_days = 3, planned_finish = '2026-10-07'
 where eden_code = 'TEC-001';
select test.expect_error($$update tasks set planned_finish = null where eden_code = 'TEC-001'$$, '23514');
select test.expect_error($$update tasks set planned_start = '2026-10-04', planned_finish = '2026-10-07'
  where eden_code = 'TEC-001'$$, '23514'); -- Sunday
select test.expect_error($$update tasks set planned_duration_days = 0 where eden_code = 'TEC-001'$$, '23514');

-- Milestones: zero duration, finish = start, any calendar day.
insert into tasks (id, project_id, workstream_id, eden_code, title, is_milestone, planned_duration_days,
                   planned_start, planned_finish)
values ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-0000000000a2', 'CERT-003', 'CE', true, 0, '2026-11-08', '2026-11-08');
select test.expect_error($$update tasks set planned_duration_days = 2 where eden_code = 'CERT-003'$$, '23514');
select test.expect_error($$update tasks set planned_finish = '2026-11-09' where eden_code = 'CERT-003'$$, '23514');
select test.expect_error($$insert into tasks (project_id, workstream_id, parent_task_id, eden_code, title)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000b3', 'CERT-003.1', 'x')$$, 'MILESTONE_WITH_SUBTASKS');

-- Dependencies.
insert into tasks (id, project_id, workstream_id, eden_code, title)
values ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-0000000000a2', 'CERT-001', 'Docs');
insert into task_dependencies (project_id, predecessor_task_id, successor_task_id, lag_days) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b4', 0),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b3', 2);
select test.expect_error($$insert into task_dependencies (project_id, predecessor_task_id, successor_task_id)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b3',
          '00000000-0000-0000-0000-0000000000b1')$$, 'DEPENDENCY_CYCLE');
select test.expect_error($$insert into task_dependencies (project_id, predecessor_task_id, successor_task_id)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-0000000000b1')$$, '23514');
select test.expect_error($$insert into task_dependencies (project_id, predecessor_task_id, successor_task_id)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-0000000000b4')$$, '23505');
select test.expect_error($$insert into task_dependencies (project_id, predecessor_task_id, successor_task_id)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2',
          '00000000-0000-0000-0000-0000000000b1')$$, 'DEPENDENCY_PARENT_CHILD');
select test.expect_error($$insert into task_dependencies (project_id, predecessor_task_id, successor_task_id, lag_days)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2',
          '00000000-0000-0000-0000-0000000000b3', -1)$$, '23514');

-- Deletes are blocked while children exist.
select test.expect_error($$delete from tasks where eden_code = 'TEC-001'$$, '23503');
select test.expect_error($$delete from workstreams where code = 'CERT'$$, '23503');

-- Audit: actor from PostgREST request headers; SYSTEM otherwise.
select set_config('request.headers', '{"x-eden-actor-type":"USER","x-eden-actor-id":"u-1"}', true);
update tasks set title = 'Tech docs' where eden_code = 'CERT-001';
select test.assert(
  (select actor_type = 'USER' and actor_id = 'u-1' and action = 'UPDATE' and entity_type = 'tasks'
          and before_json ->> 'title' = 'Docs' and after_json ->> 'title' = 'Tech docs'
          and metadata_json -> 'changed_fields' = '["title"]'::jsonb
     from audit_events where entity_type = 'tasks' and after_json ->> 'title' = 'Tech docs'),
  'task update audited with actor and diff');
select set_config('request.headers', '', true);
select test.assert(
  (select count(*) = 1 from audit_events where entity_type = 'projects' and action = 'CREATE' and actor_type = 'SYSTEM'),
  'direct SQL audited as SYSTEM');
select test.expect_error($$update audit_events set actor_type = 'USER'$$, 'AUDIT_APPEND_ONLY');
select test.expect_error($$delete from audit_events$$, 'AUDIT_APPEND_ONLY');

-- No-op updates are not audited.
select count(*) as before_count from audit_events \gset
update tasks set title = title where eden_code = 'CERT-001';
select test.assert((select count(*) from audit_events) = :before_count, 'no-op update not audited');

-- Project deletion cascades, and the audit history survives it.
delete from projects where id = '00000000-0000-0000-0000-000000000001';
select test.assert((select count(*) = 0 from tasks), 'project delete cascades');
select test.assert(
  (select count(*) > 0 from audit_events where entity_type = 'tasks' and action = 'DELETE'),
  'audit history survives project deletion');

-- RLS denies anon access.
select test.assert(
  (select bool_and(relrowsecurity) from pg_class
    where relname in ('projects','workstreams','members','tasks','task_dependencies','change_proposals','audit_events')
      and relnamespace = 'public'::regnamespace),
  'RLS enabled on every table');

rollback;

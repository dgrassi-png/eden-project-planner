-- Phase 01 — planning domain integrity, audit and access baseline.
--
-- The application (src/domain) validates every change first and returns
-- readable errors. The rules below are the last line of defence, so the
-- canonical data stays consistent whatever the writer (API, SQL editor,
-- future sync or proposal jobs).

------------------------------------------------------------------------------
-- Timestamps
------------------------------------------------------------------------------

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

alter table public.workstreams
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

alter table public.members
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

alter table public.task_dependencies
  add column created_at timestamptz not null default now();

create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger workstreams_set_updated_at before update on public.workstreams
  for each row execute function public.set_updated_at();
create trigger members_set_updated_at before update on public.members
  for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------------
-- Unvalidated planning values are NULL, never an invented default
------------------------------------------------------------------------------

alter table public.tasks
  alter column priority drop not null,
  alter column priority drop default,
  alter column geography drop not null,
  alter column geography drop default,
  alter column progress_percent drop not null,
  alter column progress_percent drop default;

------------------------------------------------------------------------------
-- Codes
------------------------------------------------------------------------------

-- Project slug: lowercase URL-safe.
alter table public.projects
  add constraint projects_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Workstream code, e.g. GOV, TEC, CERT.
alter table public.workstreams
  add constraint workstreams_code_format check (code ~ '^[A-Z][A-Z0-9]{1,9}$');

-- E:DEN code: PREFIX-NNN for tasks, PREFIX-NNN.N for subtasks (one level).
alter table public.tasks
  add constraint tasks_eden_code_format
    check (eden_code ~ '^[A-Z][A-Z0-9]{1,9}-[0-9]{3,}(\.[1-9][0-9]*)?$'),
  add constraint tasks_eden_code_matches_level
    check ((parent_task_id is null) = (position('.' in eden_code) = 0));

------------------------------------------------------------------------------
-- Hierarchy: Project > Workstream > Task > Subtask
------------------------------------------------------------------------------

-- Every task belongs to a workstream. NO ACTION (checked at statement end)
-- blocks deleting a workstream / parent that still has tasks, while still
-- allowing a project delete to cascade through everything.
alter table public.tasks
  alter column workstream_id set not null,
  drop constraint tasks_workstream_id_fkey,
  add constraint tasks_workstream_id_fkey
    foreign key (workstream_id) references public.workstreams(id) on delete no action,
  drop constraint tasks_parent_task_id_fkey,
  add constraint tasks_parent_task_id_fkey
    foreign key (parent_task_id) references public.tasks(id) on delete no action;

------------------------------------------------------------------------------
-- Scheduling invariants (planned_finish is derived by the application from
-- start + working-day duration, Monday–Friday calendar)
------------------------------------------------------------------------------

alter table public.tasks
  add constraint tasks_milestone_zero_duration
    check (not is_milestone or planned_duration_days = 0),
  add constraint tasks_task_positive_duration
    check (is_milestone or planned_duration_days is null or planned_duration_days >= 1),
  add constraint tasks_finish_derivation
    check (
      case
        when is_milestone then planned_finish is not distinct from planned_start
        else (planned_finish is null) = (planned_start is null or planned_duration_days is null)
      end
    ),
  add constraint tasks_finish_after_start
    check (planned_finish is null or planned_finish >= planned_start),
  add constraint tasks_task_dates_on_working_days
    check (
      is_milestone
      or (
        (planned_start is null or extract(isodow from planned_start) < 6)
        and (planned_finish is null or extract(isodow from planned_finish) < 6)
      )
    );

------------------------------------------------------------------------------
-- Guards: immutable identifiers and cross-row hierarchy rules
------------------------------------------------------------------------------

create or replace function public.workstreams_guard() returns trigger
language plpgsql as $$
begin
  if new.code is distinct from old.code then
    raise exception 'Workstream code % is permanent and cannot be changed', old.code
      using errcode = 'P0001', hint = 'WORKSTREAM_CODE_IMMUTABLE';
  end if;
  if new.project_id is distinct from old.project_id then
    raise exception 'A workstream cannot move to another project'
      using errcode = 'P0001', hint = 'PROJECT_IMMUTABLE';
  end if;
  return new;
end $$;

create trigger workstreams_guard before update on public.workstreams
  for each row execute function public.workstreams_guard();

create or replace function public.tasks_guard() returns trigger
language plpgsql as $$
declare
  parent public.tasks%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.eden_code is distinct from old.eden_code then
      raise exception 'E:DEN code % is permanent and cannot be changed', old.eden_code
        using errcode = 'P0001', hint = 'EDEN_CODE_IMMUTABLE';
    end if;
    if new.project_id is distinct from old.project_id then
      raise exception 'A task cannot move to another project'
        using errcode = 'P0001', hint = 'PROJECT_IMMUTABLE';
    end if;
    -- The parent is encoded in the permanent code (TEC-001.1 -> TEC-001).
    if new.parent_task_id is distinct from old.parent_task_id then
      raise exception 'The parent of % cannot be changed', old.eden_code
        using errcode = 'P0001', hint = 'PARENT_IMMUTABLE';
    end if;
    if new.is_milestone and not old.is_milestone
       and exists (select 1 from public.tasks c where c.parent_task_id = new.id) then
      raise exception 'Task % has subtasks and cannot become a milestone', new.eden_code
        using errcode = 'P0001', hint = 'MILESTONE_WITH_SUBTASKS';
    end if;
  end if;

  if not exists (
    select 1 from public.workstreams w where w.id = new.workstream_id and w.project_id = new.project_id
  ) then
    raise exception 'Workstream belongs to another project'
      using errcode = 'P0001', hint = 'WORKSTREAM_PROJECT_MISMATCH';
  end if;

  if new.parent_task_id is not null then
    select * into parent from public.tasks where id = new.parent_task_id;
    if not found then
      raise exception 'Parent task not found' using errcode = 'P0001', hint = 'PARENT_NOT_FOUND';
    end if;
    if parent.project_id <> new.project_id then
      raise exception 'Parent task belongs to another project'
        using errcode = 'P0001', hint = 'PARENT_PROJECT_MISMATCH';
    end if;
    if parent.parent_task_id is not null then
      raise exception 'Subtasks cannot have subtasks (% is already a subtask)', parent.eden_code
        using errcode = 'P0001', hint = 'HIERARCHY_TOO_DEEP';
    end if;
    if parent.is_milestone then
      raise exception 'Milestone % cannot have subtasks', parent.eden_code
        using errcode = 'P0001', hint = 'MILESTONE_WITH_SUBTASKS';
    end if;
    if split_part(new.eden_code, '.', 1) <> parent.eden_code then
      raise exception 'Subtask code % must start with its parent code %.', new.eden_code, parent.eden_code
        using errcode = 'P0001', hint = 'EDEN_CODE_PARENT_PREFIX';
    end if;
    if new.workstream_id <> parent.workstream_id then
      raise exception 'Subtask % must be in the same workstream as %', new.eden_code, parent.eden_code
        using errcode = 'P0001', hint = 'SUBTASK_WORKSTREAM_MISMATCH';
    end if;
  end if;

  return new;
end $$;

create trigger tasks_guard before insert or update on public.tasks
  for each row execute function public.tasks_guard();

-- Moving a task to another workstream carries its subtasks along.
create or replace function public.tasks_propagate_workstream() returns trigger
language plpgsql as $$
begin
  update public.tasks set workstream_id = new.workstream_id
   where parent_task_id = new.id and workstream_id <> new.workstream_id;
  return null;
end $$;

create trigger tasks_propagate_workstream after update of workstream_id on public.tasks
  for each row when (old.workstream_id is distinct from new.workstream_id)
  execute function public.tasks_propagate_workstream();

------------------------------------------------------------------------------
-- Dependencies: Finish-to-Start, lag >= 0, same project, no parent/child
-- links, no cycles
------------------------------------------------------------------------------

alter table public.task_dependencies
  add constraint task_dependencies_lag_non_negative check (lag_days >= 0);

create index deps_predecessor_idx on public.task_dependencies(predecessor_task_id);
create index deps_project_idx on public.task_dependencies(project_id);
create index tasks_workstream_idx on public.tasks(workstream_id);

create or replace function public.task_dependencies_guard() returns trigger
language plpgsql as $$
declare
  pred public.tasks%rowtype;
  succ public.tasks%rowtype;
begin
  if tg_op = 'UPDATE' and (
    new.predecessor_task_id <> old.predecessor_task_id
    or new.successor_task_id <> old.successor_task_id
    or new.project_id <> old.project_id
  ) then
    raise exception 'Dependency endpoints cannot be changed; delete and recreate it'
      using errcode = 'P0001', hint = 'DEPENDENCY_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE' then
    return new;
  end if;

  -- Serialise dependency inserts per project so concurrent inserts cannot
  -- form a cycle between them.
  perform pg_advisory_xact_lock(hashtextextended('task_dependencies:' || new.project_id::text, 0));

  select * into pred from public.tasks where id = new.predecessor_task_id;
  select * into succ from public.tasks where id = new.successor_task_id;
  if pred.project_id <> new.project_id or succ.project_id <> new.project_id then
    raise exception 'Dependency tasks must belong to the dependency project'
      using errcode = 'P0001', hint = 'DEPENDENCY_PROJECT_MISMATCH';
  end if;
  if pred.parent_task_id = succ.id or succ.parent_task_id = pred.id then
    raise exception 'A task cannot depend on its own parent or subtask'
      using errcode = 'P0001', hint = 'DEPENDENCY_PARENT_CHILD';
  end if;

  if exists (
    with recursive downstream(id) as (
      select d.successor_task_id from public.task_dependencies d
       where d.predecessor_task_id = new.successor_task_id
      union
      select d.successor_task_id from public.task_dependencies d
        join downstream on d.predecessor_task_id = downstream.id
    )
    select 1 from downstream where id = new.predecessor_task_id
  ) then
    raise exception '% -> % would create a dependency cycle', pred.eden_code, succ.eden_code
      using errcode = 'P0001', hint = 'DEPENDENCY_CYCLE';
  end if;

  return new;
end $$;

create trigger task_dependencies_guard before insert or update on public.task_dependencies
  for each row execute function public.task_dependencies_guard();

------------------------------------------------------------------------------
-- Audit: every change to planning tables is recorded in the same
-- transaction. The server identifies the actor through PostgREST request
-- headers (x-eden-actor-type / x-eden-actor-id); direct SQL is SYSTEM.
------------------------------------------------------------------------------

-- The audit log must outlive the rows (and projects) it describes.
alter table public.audit_events drop constraint audit_events_project_id_fkey;

alter table public.audit_events
  add constraint audit_events_actor_type_valid
    check (actor_type in ('USER', 'CHATGPT', 'CLAUDE', 'SYSTEM', 'TRELLO_SYNC'));

create index audit_entity_idx on public.audit_events(entity_type, entity_id);

create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_actor_type text := coalesce(headers ->> 'x-eden-actor-type', 'SYSTEM');
  v_actor_id text := headers ->> 'x-eden-actor-id';
  v_before jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_after jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row jsonb := coalesce(v_after, v_before);
  v_changed jsonb;
begin
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(n.key order by n.key), '[]'::jsonb) into v_changed
      from jsonb_each(v_after) n
     where n.key <> 'updated_at' and n.value is distinct from v_before -> n.key;
    if v_changed = '[]'::jsonb then
      return null; -- no material change
    end if;
  end if;

  insert into public.audit_events
    (project_id, actor_type, actor_id, action, entity_type, entity_id, before_json, after_json, metadata_json)
  values (
    case when tg_table_name = 'projects' then (v_row ->> 'id')::uuid else (v_row ->> 'project_id')::uuid end,
    v_actor_type,
    v_actor_id,
    case tg_op when 'INSERT' then 'CREATE' when 'UPDATE' then 'UPDATE' else 'DELETE' end,
    tg_table_name,
    v_row ->> 'id',
    v_before,
    v_after,
    jsonb_strip_nulls(jsonb_build_object('source', 'db_trigger', 'changed_fields', v_changed))
  );
  return null;
end $$;

create trigger projects_audit after insert or update or delete on public.projects
  for each row execute function public.audit_row_change();
create trigger workstreams_audit after insert or update or delete on public.workstreams
  for each row execute function public.audit_row_change();
create trigger members_audit after insert or update or delete on public.members
  for each row execute function public.audit_row_change();
create trigger tasks_audit after insert or update or delete on public.tasks
  for each row execute function public.audit_row_change();
create trigger task_dependencies_audit after insert or update or delete on public.task_dependencies
  for each row execute function public.audit_row_change();

-- Append-only.
create or replace function public.audit_events_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'Audit events are append-only' using errcode = 'P0001', hint = 'AUDIT_APPEND_ONLY';
end $$;

create trigger audit_events_immutable before update or delete on public.audit_events
  for each row execute function public.audit_events_immutable();

------------------------------------------------------------------------------
-- Access: deny by default.
--
-- RLS is enabled with no policies, so the public anon key (shipped to
-- browsers) can neither read nor write planning data. All access goes through
-- the Next.js server with the service-role key. Per-user policies arrive with
-- Supabase Auth.
------------------------------------------------------------------------------

alter table public.projects enable row level security;
alter table public.workstreams enable row level security;
alter table public.members enable row level security;
alter table public.tasks enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.change_proposals enable row level security;
alter table public.audit_events enable row level security;

-- Trigger functions are never called directly; keep them off the API surface.
revoke execute on function
  public.set_updated_at(),
  public.workstreams_guard(),
  public.tasks_guard(),
  public.tasks_propagate_workstream(),
  public.task_dependencies_guard(),
  public.audit_row_change(),
  public.audit_events_immutable()
from public, anon, authenticated;

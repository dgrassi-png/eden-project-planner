create extension if not exists "pgcrypto";

create type task_status as enum ('BACKLOG','READY','IN_PROGRESS','WAITING_BLOCKED','DONE','CANCELLED');
create type task_priority as enum ('P0','P1','P2','P3');
create type geography_type as enum ('CECINA_REQUIRED','CECINA_PREFERRED','REMOTE_OK','ANYWHERE');
create type trello_sync_state as enum ('NOT_SYNCED','SYNC_PENDING','SYNCED','SYNC_ERROR','OUT_OF_SYNC');
create type proposal_state as enum ('PENDING','APPLIED','REJECTED');

create table projects (
 id uuid primary key default gen_random_uuid(),
 name text not null, slug text unique not null, description text,
 trello_board_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table workstreams (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references projects(id) on delete cascade,
 code text not null, name text not null, sort_order integer not null default 0,
 unique(project_id,code)
);

create table members (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references projects(id) on delete cascade,
 auth_user_id uuid, display_name text not null, email text, trello_member_id text,
 active boolean not null default true
);

create table tasks (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references projects(id) on delete cascade,
 workstream_id uuid references workstreams(id) on delete set null,
 parent_task_id uuid references tasks(id) on delete cascade,
 eden_code text not null, title text not null, description text,
 owner_member_id uuid references members(id) on delete set null,
 planned_start date, planned_duration_days integer check(planned_duration_days is null or planned_duration_days >= 0),
 planned_finish date,
 status task_status not null default 'BACKLOG',
 priority task_priority not null default 'P1',
 geography geography_type not null default 'ANYWHERE',
 is_milestone boolean not null default false,
 progress_percent integer not null default 0 check(progress_percent between 0 and 100),
 sort_order integer not null default 0,
 trello_card_id text, trello_card_url text,
 trello_sync_status trello_sync_state not null default 'NOT_SYNCED',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(project_id,eden_code),
 check(not is_milestone or planned_duration_days is null or planned_duration_days=0)
);

create table task_dependencies (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references projects(id) on delete cascade,
 predecessor_task_id uuid not null references tasks(id) on delete cascade,
 successor_task_id uuid not null references tasks(id) on delete cascade,
 lag_days integer not null default 0,
 unique(predecessor_task_id,successor_task_id),
 check(predecessor_task_id <> successor_task_id)
);

create table change_proposals (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references projects(id) on delete cascade,
 source text not null, reason text, payload jsonb not null,
 status proposal_state not null default 'PENDING',
 reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz not null default now()
);

create table audit_events (
 id uuid primary key default gen_random_uuid(),
 project_id uuid references projects(id) on delete cascade,
 actor_type text not null, actor_id text, action text not null,
 entity_type text not null, entity_id text,
 before_json jsonb, after_json jsonb, metadata_json jsonb,
 created_at timestamptz not null default now()
);

create index tasks_project_idx on tasks(project_id);
create index tasks_parent_idx on tasks(parent_task_id);
create index deps_successor_idx on task_dependencies(successor_task_id);
create index proposals_project_idx on change_proposals(project_id);
create index audit_project_idx on audit_events(project_id);

-- Add auth/RLS policies during implementation before production deployment.

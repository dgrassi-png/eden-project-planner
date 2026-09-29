-- Schema version marker, read by /readyz and the deploy gate so a release
-- never runs against a database with unapplied migrations (E:DEN manual:
-- "a migration present in code is not operative until applied and verified").
-- Bump by inserting a new row in every future migration.

create table public.planner_schema_version (
  version integer primary key,
  applied_at timestamptz not null default now(),
  description text not null
);

alter table public.planner_schema_version enable row level security;

insert into public.planner_schema_version (version, description) values
  (1, 'initial schema'),
  (2, 'planning domain integrity, audit, RLS'),
  (3, 'schema version marker');

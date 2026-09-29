-- Test helpers (loaded into a throwaway database only).
create schema if not exists test;

-- Runs `stmt` and asserts it fails with the given hint (guard triggers) or SQLSTATE.
create or replace function test.expect_error(stmt text, expected text) returns void
language plpgsql as $$
declare
  v_hint text;
  v_state text;
begin
  begin
    execute stmt;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_state = returned_sqlstate;
    if v_hint = expected or v_state = expected then
      return;
    end if;
    raise exception 'Expected % but got % / %: %', expected, v_state, v_hint, stmt;
  end;
  raise exception 'Expected % but statement succeeded: %', expected, stmt;
end $$;

create or replace function test.assert(condition boolean, message text) returns void
language plpgsql as $$
begin
  if not coalesce(condition, false) then
    raise exception 'Assertion failed: %', message;
  end if;
end $$;

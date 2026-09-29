#!/usr/bin/env bash
# Applies supabase/migrations to a throwaway local Postgres and runs the SQL
# tests in supabase/tests. Requires PostgreSQL 15+ binaries (initdb, pg_ctl,
# psql) on PATH or in /usr/lib/postgresql/*/bin.
#
# Usage: npm run test:db
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | sort -V | tail -1)")"
TMP="$(mktemp -d)"
PORT="${TEST_DB_PORT:-54329}"

if [ "$(id -u)" = "0" ]; then RUN=(runuser -u postgres --); chown postgres "$TMP"; else RUN=(); fi
cleanup() { "${RUN[@]}" "$PG_BIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

"${RUN[@]}" "$PG_BIN/initdb" -D "$TMP/data" -A trust -U postgres >/dev/null
"${RUN[@]}" "$PG_BIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null

PSQL=("${RUN[@]}" "$PG_BIN/psql" -h "$TMP" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1 -d postgres)

# Roles that exist in every Supabase project.
"${PSQL[@]}" -c "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;"

for file in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate  $(basename "$file")"
  "${PSQL[@]}" -f "$file"
done

for file in "$ROOT"/supabase/tests/*.sql; do
  echo "test     $(basename "$file")"
  "${PSQL[@]}" -o /dev/null -f "$file"
done

echo "database tests passed"

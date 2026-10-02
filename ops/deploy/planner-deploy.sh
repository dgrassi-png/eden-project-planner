#!/usr/bin/env bash
# E:DEN Planner deploy (candidate/rollback swap, modelled on the E:DEN website
# preview deploy, manual Rev.09).
#
#   planner-deploy.sh deploy   <preview|production> <40-char-sha> [--confirm-production]
#   planner-deploy.sh rollback <preview|production>              [--confirm-production]
#
# Guarantees:
# - builds into .next-candidate; the live build is only replaced after the
#   candidate has a BUILD_ID;
# - backs up the SQLite database, then applies migrations, before the swap;
# - after restart: systemd active, /healthz 200, X-Eden-Deploy-Sha == target,
#   /readyz 200 (Identity configured, database present, schema up to date);
#   otherwise automatic rollback to the previous build;
# - a preview deploy can never touch the production unit, port or worktree,
#   and verifies afterwards that production's SHA did not move;
# - production requires --confirm-production.
set -euo pipefail

die() { echo "planner-deploy: ERROR: $*" >&2; exit 1; }
log() { echo "planner-deploy: $*"; }

action=${1:-}; environment=${2:-}
case "$action" in deploy|rollback) ;; *) die "usage: $0 deploy|rollback <preview|production> [sha]";; esac

case "$environment" in
  preview)
    service=eden-planner-preview; port=3310; other_port=3300 ;;
  production)
    service=eden-planner-production; port=3300; other_port=3310 ;;
  *) die "environment must be preview or production" ;;
esac

confirmed=false
for arg in "$@"; do [[ "$arg" == "--confirm-production" ]] && confirmed=true; done
if [[ "$environment" == "production" && "$confirmed" != true ]]; then
  die "production requires --confirm-production"
fi

readonly worktree="/home/ubuntu/workspace/eden-planner-$environment"
readonly state_dir="/var/lib/eden/planner-$environment"
readonly database="$state_dir/planner.sqlite3"
readonly backup_root="/var/backups/eden"
readonly live_build="$worktree/.next"
readonly candidate_build="$worktree/.next-candidate"
readonly rollback_build="$worktree/.next-rollback"
readonly failed_build="$worktree/.next-failed"
readonly deployed_file="$state_dir/deployed-sha"
readonly rollback_file="$state_dir/rollback-sha"
readonly loopback="http://127.0.0.1:$port"
export PATH="/home/ubuntu/.local/node22/bin:$PATH"

[[ -d "$worktree/.git" || -f "$worktree/.git" ]] || die "missing worktree $worktree"
[[ -d "$state_dir" ]] || die "missing state dir $state_dir"
[[ "$worktree" == *"eden-planner-$environment" ]] || die "worktree/environment mismatch"

exec 9>"/run/lock/eden-planner-$environment-deploy.lock"
/usr/bin/flock -n 9 || die "another $environment deployment is running"

remove_build_dir() {
  case "$1" in "$candidate_build"|"$rollback_build"|"$failed_build") /usr/bin/rm -rf -- "$1" ;; *) die "refusing to remove $1" ;; esac
}

deployed_sha_header() {
  /usr/bin/curl --fail --silent --max-time 15 -o /dev/null -D - "http://127.0.0.1:$1/healthz" 2>/dev/null \
    | /usr/bin/awk 'tolower($1)=="x-eden-deploy-sha:" {gsub("\r",""); print $2}'
}

healthy() {
  local expected_sha=$1
  for _ in $(seq 1 30); do
    if /usr/bin/systemctl is-active --quiet "$service" \
      && /usr/bin/curl --fail --silent --max-time 10 "$loopback/healthz" >/dev/null; then
      break
    fi
    sleep 2
  done
  /usr/bin/systemctl is-active --quiet "$service" || return 1
  [[ -z "$expected_sha" || "$(deployed_sha_header "$port")" == "$expected_sha" ]] || return 1
  /usr/bin/curl --fail --silent --max-time 15 "$loopback/readyz" >/dev/null || return 1
}

restore_previous() {
  log "restoring previous build"
  /usr/bin/systemctl stop "$service" || true
  remove_build_dir "$failed_build"
  [[ -d "$live_build" ]] && /usr/bin/mv -- "$live_build" "$failed_build"
  [[ -d "$rollback_build" ]] || die "rollback build is missing; service left stopped"
  /usr/bin/mv -- "$rollback_build" "$live_build"
  /usr/bin/systemctl restart "$service"
  healthy "" || die "previous build did not recover; manual intervention required"
}

other_before=$(deployed_sha_header "$other_port" || true)

if [[ "$action" == "deploy" ]]; then
  sha=${3:-}
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die "target must be a full 40-char commit SHA"
  previous_sha=$([[ -s "$deployed_file" ]] && cat "$deployed_file" || echo none)
  log "deploying $sha to $environment (previous: $previous_sha)"

  cd "$worktree"
  git fetch --quiet origin
  git cat-file -e "$sha^{commit}" || die "commit $sha not found"
  git checkout --quiet --detach "$sha"
  npm ci --no-audit --no-fund
  npm run check                      # evidence: lint, typecheck, tests
  remove_build_dir "$candidate_build"
  if ! EDEN_DEPLOY_SHA="$sha" EDEN_NEXT_DIST_DIR=.next-candidate npm run build; then
    remove_build_dir "$candidate_build"
    die "build failed; live build untouched"
  fi
  [[ -s "$candidate_build/BUILD_ID" ]] || { remove_build_dir "$candidate_build"; die "candidate has no BUILD_ID"; }

  # Database: backup before any migration, then migrate (E:DEN release rules).
  # Migrations are additive; a schema rollback is a restore from this backup.
  if [[ -f "$database" ]]; then
    node scripts/db.mjs backup --database "$database" --destination "$backup_root" \
      --product "planner-$environment" --retention-days 14 \
      || { remove_build_dir "$candidate_build"; die "database backup failed; nothing changed"; }
    node scripts/db.mjs migrate --database "$database" \
      || { remove_build_dir "$candidate_build"; die "migration failed; restore from $backup_root/planner-$environment if needed"; }
  else
    log "no database yet: creating $database"
    node scripts/db.mjs migrate --database "$database" --create
  fi

  remove_build_dir "$rollback_build"
  [[ -d "$live_build" ]] && /usr/bin/mv -- "$live_build" "$rollback_build"
  /usr/bin/mv -- "$candidate_build" "$live_build"
  /usr/bin/systemctl restart "$service"

  if ! healthy "$sha"; then
    restore_previous
    die "health/readiness failed for $sha; previous build restored"
  fi
  printf '%s\n' "$previous_sha" > "$rollback_file"
  printf '%s\n' "$sha" > "$deployed_file"
  log "deployed $sha to $environment"
else
  [[ -s "$rollback_file" && -d "$rollback_build" ]] || die "no rollback build recorded"
  target=$(cat "$rollback_file")
  current=$([[ -s "$deployed_file" ]] && cat "$deployed_file" || echo unknown)
  log "rolling back $environment from $current to $target"
  /usr/bin/systemctl stop "$service"
  remove_build_dir "$failed_build"
  /usr/bin/mv -- "$live_build" "$failed_build"
  /usr/bin/mv -- "$rollback_build" "$live_build"
  /usr/bin/mv -- "$failed_build" "$rollback_build"
  /usr/bin/systemctl restart "$service"
  healthy "$target" || die "rollback target failed health checks"
  printf '%s\n' "$current" > "$rollback_file"
  printf '%s\n' "$target" > "$deployed_file"
  log "rolled back to $target"
fi

# Guardrail: the other environment must not have moved.
other_after=$(deployed_sha_header "$other_port" || true)
if [[ "$other_before" != "$other_after" ]]; then
  echo "planner-deploy: CRITICAL INCIDENT: the other environment changed SHA during this deploy ($other_before -> $other_after)" >&2
  exit 2
fi

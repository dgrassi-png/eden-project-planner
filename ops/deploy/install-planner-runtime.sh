#!/usr/bin/env bash
# One-time host setup for an E:DEN Planner environment (run with sudo).
#   install-planner-runtime.sh <preview|production> <repo-url>
# Creates the dedicated worktree, state dir and env file skeleton, and installs
# the systemd unit. Does NOT write nginx (host-managed) or any secret value.
set -euo pipefail
environment=${1:-}; repo=${2:-}
case "$environment" in preview|production) ;; *) echo "usage: $0 <preview|production> <repo-url>" >&2; exit 1;; esac
[[ -n "$repo" ]] || { echo "repo url required" >&2; exit 1; }

here=$(cd "$(dirname "$0")/../.." && pwd)
worktree="/home/ubuntu/workspace/eden-planner-$environment"
state="/var/lib/eden/planner-$environment"
envfile="/etc/eden/planner-$environment.env"
unit="eden-planner-$environment.service"

install -d -o ubuntu -g ubuntu -m 0750 "$state"
install -d -o ubuntu -g ubuntu -m 0700 "/var/backups/eden/planner-$environment"
[[ -d "$worktree" ]] || sudo -u ubuntu git clone --quiet "$repo" "$worktree"
install -d -o ubuntu -g ubuntu -m 0750 "$worktree/.next"

if [[ ! -f "$envfile" ]]; then
  install -d -m 0755 /etc/eden
  install -o root -g root -m 0600 "$here/ops/env/planner.env.example" "$envfile"
  echo "Created $envfile from the example: fill in the values (never commit them)."
fi

install -o root -g root -m 0644 "$here/ops/systemd/$unit" "/etc/systemd/system/$unit"
if [[ "$environment" == production ]]; then
  # Daily database backup (preview data is disposable and backed up by each deploy only).
  for file in eden-planner-backup-production.service eden-planner-backup-production.timer; do
    install -o root -g root -m 0644 "$here/ops/systemd/$file" "/etc/systemd/system/$file"
  done
fi
systemctl daemon-reload
systemctl enable "$unit"
if [[ "$environment" == production ]]; then systemctl enable --now eden-planner-backup-production.timer; fi
echo "Installed $unit. Next: fill $envfile, add the nginx server block (ops/nginx/planner.conf.example),"
echo "then deploy with: ops/deploy/planner-deploy.sh deploy $environment <sha>"

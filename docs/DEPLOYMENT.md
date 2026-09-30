# Deployment runbook (E:DEN host)

Target (pending confirmation, see `docs/ECOSYSTEM_ALIGNMENT.md` §3): the E:DEN
EC2 host, following the platform conventions. Next.js runs under systemd
behind nginx, with separate preview and production runtimes (manual Rev.09
ADR-R09-04).

| | Production | Preview |
|---|---|---|
| Hostname | `planner.e-den.tech` | `planner-preview.e-den.tech` |
| Upstream | `127.0.0.1:3300` | `127.0.0.1:3310` |
| Unit | `eden-planner-production.service` | `eden-planner-preview.service` |
| Worktree | `/home/ubuntu/workspace/eden-planner-production` | `…/eden-planner-preview` |
| State | `/var/lib/eden/planner-production` | `/var/lib/eden/planner-preview` |
| Database | `/var/lib/eden/planner-production/planner.sqlite3` | `/var/lib/eden/planner-preview/planner.sqlite3` |
| Backups | `/var/backups/eden/planner-production/<stamp>/` | `/var/backups/eden/planner-preview/<stamp>/` |
| Env (root, 0600) | `/etc/eden/planner-production.env` | `/etc/eden/planner-preview.env` |
| Identity callback | `https://planner.e-den.tech/auth/eden/callback` | to be agreed with Identity |

## Preconditions (go-live blockers)

1. The planner is registered in E:DEN Identity (`docs/IDENTITY_INTEGRATION.md` §4).
2. Nothing to provision for the database: it is a SQLite file in the state dir, created and migrated by the deploy script (backup first, see below).
3. A TLS certificate and an nginx server block are in place for the hostnames (host-managed).
4. Node 22 is at `/home/ubuntu/.local/node22/bin`, the same path the website uses.

## One-time setup

```bash
sudo ops/deploy/install-planner-runtime.sh preview    <repo-url>
sudo ops/deploy/install-planner-runtime.sh production <repo-url>
sudoedit /etc/eden/planner-production.env   # see ops/env/planner.env.example; never commit or print
# add ops/nginx/planner.conf.example to the host-managed nginx config, then:
sudo nginx -t && sudo systemctl reload nginx
```

## Deploy (evidence package: commit, checks, migrations, smoke, rollback pointer)

```bash
# Preview (the script backs up the database, then migrates it, before switching builds):
ops/deploy/planner-deploy.sh deploy preview <40-char-sha>
# Production, after preview qualification:
ops/deploy/planner-deploy.sh deploy production <40-char-sha> --confirm-production
```

The script:
1. Takes a `flock`, then checks out the exact SHA.
2. Runs `npm ci` and `npm run check`.
3. Builds into `.next-candidate` with `EDEN_DEPLOY_SHA` baked in, and requires a `BUILD_ID`.
4. Swaps the candidate in and keeps `.next-rollback`.
5. Restarts only this environment's unit.
6. Verifies that `systemctl` reports the unit active, `/healthz` returns 200, `X-Eden-Deploy-Sha` equals the target, and `/readyz` returns 200 (Identity configured, DB reachable, schema at the expected version).
7. Restores the previous build automatically if any check fails.
8. Afterwards, checks that the **other** environment's SHA did not move, and logs `CRITICAL INCIDENT` otherwise.

Rollback: `ops/deploy/planner-deploy.sh rollback <env> [--confirm-production]`.

## Smoke after deploy

- `curl -sI https://planner.e-den.tech/healthz` returns 200 and the expected `X-Eden-Deploy-Sha`.
- `curl -s https://planner.e-den.tech/readyz` returns `"ready":true` and `"authentication":"identity"`.
- An anonymous request to `/planner` redirects (307) to `/auth/eden/start`.
- An anonymous request to `/api/projects` returns 401.
- Signing in with an `@e-den.tech` account through Identity lands on `/planner`.

## Database backups and restore

- Format identical to the E:DEN `ops/backup/backup_sqlite.py`: online backup, `quick_check`, gzip -9, SHA-256 manifest, 0600/0700, atomic publish, retention.
- Every deploy takes a backup before migrating. For a daily backup, add a timer that runs:
  `node scripts/db.mjs backup --database /var/lib/eden/planner-production/planner.sqlite3 --destination /var/backups/eden --product planner-production --retention-days 7`
  (as for `eden-sqlite-backup@budget`; the planner can use that template once it lives in the monorepo).
- Restore (to an isolated path first):
  1. Verify the archive SHA-256 against `manifest.json`.
  2. `gunzip -c planner-production.sqlite3.gz > restored.sqlite3`.
  3. Check with `node scripts/db.mjs status --database $PWD/restored.sqlite3` and `PRAGMA integrity_check`.
  4. Stop the unit, replace the database file, remove any `-wal`/`-shm`, start the unit, check `/readyz`.

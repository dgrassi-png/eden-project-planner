# Deployment runbook (E:DEN host)

Target (confirmed, D-018): the E:DEN EC2 host, following the platform
conventions. What each owner must do first is listed in `docs/HANDOFF.md`. Next.js runs under systemd
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
| Backups | `/var/backups/eden/planner-production/<stamp>/` (each deploy + daily timer, 14 days) | `/var/backups/eden/planner-preview/<stamp>/` (each deploy) |
| Env (root, 0600) | `/etc/eden/planner-production.env` | `/etc/eden/planner-preview.env` |
| Identity callback | `https://planner.e-den.tech/auth/eden/callback` | to be agreed with Identity |

## Preconditions (go-live blockers)

1. The planner is registered in E:DEN Identity (`docs/IDENTITY_INTEGRATION.md` §4).
2. Nothing to provision for the database: it is a SQLite file in the state dir, created and migrated by the deploy script (backup first, see below).
3. A TLS certificate and an nginx server block are in place for the hostnames (host-managed).
4. Node 22 is at `/home/ubuntu/.local/node22/bin`, the same path the website uses.
5. Outbound HTTPS from the host is allowed to `auth.e-den.tech` (code exchange), `api.trello.com` (sync) and, only if server-side drafting is enabled, `api.anthropic.com` / `api.openai.com`.

## Environment file (`/etc/eden/planner-<env>.env`, root 0600)

| Variable | Required | Notes |
|---|---|---|
| `PLANNER_AUTH_MODE` | yes | `identity` |
| `EDEN_IDENTITY_BASE_URL` | yes | `https://auth.e-den.tech` |
| `EDEN_IDENTITY_APP_ID` | yes | `planner` |
| `PLANNER_PUBLIC_URL` | yes | `https://planner.e-den.tech` (preview: its own hostname) |
| `PLANNER_SESSION_SECRET` | yes | `openssl rand -base64 48`, different per environment |
| `TRELLO_API_KEY`, `TRELLO_API_TOKEN` | for Trello | dedicated E:DEN service account on the board, token scope read,write |
| `TRELLO_BOARD_ID` | for Trello | `9n93W4ym` (https://trello.com/b/9n93W4ym/eden) |
| `PLANNER_AGENT_TOKENS` | for agents | `CLAUDE:<sha256>,CHATGPT:<sha256>,ASSISTANT:<sha256>` from `node scripts/agent-token.mjs <NAME>` |
| `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`) | optional | server-side drafting with Claude (default model `claude-opus-5-5`) |
| `OPENAI_API_KEY` + `OPENAI_MODEL` | optional | server-side drafting with ChatGPT (no default model) |
| `AI_MUTATIONS_REQUIRE_APPROVAL` | keep `true` | V0 has no auto-apply path anyway |

`PLANNER_DATABASE_PATH` is set by the systemd unit, never in the env file.
`TRELLO_API_BASE_URL` is for offline tests only and must stay unset.

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
- `/settings/integrations` shows Identity, database and (if configured) Trello and AI as configured.
- With an agent token: `curl -H "Authorization: Bearer <token>" https://planner.e-den.tech/api/projects` returns 200,
  and the same token on `/api/tasks/<id>` returns 401/403.
- Settings → Trello reads the board; "Trello sync…" in the planner shows a dry-run (confirm only when it looks right).

## Database backups and restore

- Format identical to the E:DEN `ops/backup/backup_sqlite.py`: online backup, `quick_check`, gzip -9, SHA-256 manifest, 0600/0700, atomic publish, retention.
- Every deploy takes a backup before migrating.
- Production also has a daily backup: `eden-planner-backup-production.timer` (02:40 Europe/Rome, 14 days retention),
  installed and enabled by `install-planner-runtime.sh production`. Check it with
  `systemctl list-timers eden-planner-backup-production.timer` and `journalctl -u eden-planner-backup-production`.
  Once the planner lives in the monorepo, `eden-sqlite-backup@` can replace it.
- Off-host copies (S3) follow the platform backup policy; the manifest carries the `s3_ready_key_prefix`.
- Restore (to an isolated path first):
  1. Verify the archive SHA-256 against `manifest.json`.
  2. `gunzip -c planner-production.sqlite3.gz > restored.sqlite3`.
  3. Check with `node scripts/db.mjs status --database $PWD/restored.sqlite3` and `PRAGMA integrity_check`.
  4. Stop the unit, replace the database file, remove any `-wal`/`-shm`, start the unit, check `/readyz`.

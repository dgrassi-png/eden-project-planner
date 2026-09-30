# E:DEN Project Planner

Web-based master planning system for E:DEN.

**Planner = source of truth. Trello = execution layer.**

## V0
- True interactive Gantt (drag to move, resize to change duration, dependency arrows, milestones, unscheduled tray)
- Project > Workstream > Task > Subtask
- Stable E:DEN task IDs
- Owner, dates, duration, status, priority, geography
- Milestones and Finish-to-Start dependencies
- Controlled Planner -> Trello sync
- AI change proposals for ChatGPT / Claude with human approval
- Audit log

## Stack
Next.js (App Router) + TypeScript + Tailwind (on the E:DEN UI foundation) + SQLite (planner-owned, like Budget and Natura) + E:DEN Identity SSO. Runs on the E:DEN host (nginx + systemd).

See `docs/PRODUCT_DEFINITION.md` (product source of truth), `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/CLAUDE_CODE_PROMPTS.md`.

## Getting started

Requires Node.js 20.9+ (22 recommended).

```bash
npm install
cp .env.example .env.local   # fill in values as integrations are set up; all optional for now
npm run dev                  # http://localhost:3000 → /planner
```

The app runs with an empty environment. The planner then shows clearly marked
UI scaffolding. `/settings/integrations` shows which integrations are configured
(never their values).

### Database

The planner owns a single SQLite file (no external service, no Docker).
Offline, `npm run dev` creates and migrates `.data/planner.sqlite3`
automatically; open `/planner` and create the project. `npm run db:status`
shows the schema version. On the E:DEN host the file lives in
`/var/lib/eden/planner-<env>/` and the deploy script backs it up and migrates it
(`docs/DEPLOYMENT.md`).

### Sign-in and going online

Sign-in goes through **E:DEN Identity** (`auth.e-den.tech`); there is no local
login. Offline, the planner runs in `local-dev` mode (no login, loopback only).
To go online, see `docs/ECOSYSTEM_ALIGNMENT.md` (congruence with the E:DEN
manual, open decisions), `docs/IDENTITY_INTEGRATION.md` and
`docs/DEPLOYMENT.md` (E:DEN host runbook, `ops/`).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | Route type generation + `tsc --noEmit` |
| `npm test` | Unit tests (Vitest) |
| `npm run check` | Lint + typecheck + tests |
| `npm run db:migrate` / `db:status` | Apply migrations to / inspect the local (or `PLANNER_DATABASE_PATH`) database |

## Layout

```
src/app/         routes (/planner, /settings/team, /settings/integrations, /api/*)
src/components/  UI grouped by surface (shell, planner, settings, ui)
src/config/      env validation (server-only secrets vs public vars), app constants
src/domain/      framework-free planning + timeline logic (unit tested)
src/lib/         SQLite store and migrator, planning service, auth, API helpers
db/migrations/   canonical SQLite schema (NNNN_name.sql)
ops/             systemd units, nginx example, deploy/install scripts
scripts/db.mjs   host CLI: migrate, status, backup
```

Never commit secrets. Use `.env.local`.

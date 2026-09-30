# E:DEN Project Planner

Web-based master planning system for E:DEN.

**Planner = source of truth. Trello = execution layer.**

## V0 (phases 00–07 implemented)
- True interactive Gantt: drag to move, resize to change duration, dependency arrows (red when violated), milestones, today line, zoom, unscheduled tray, filters and search
- Project > Workstream > Task > Subtask, permanent E:DEN codes
- Owner, dates, duration, status, priority, geography, deadline, blocker, waiting for, notes, splittable (unknown = TBD)
- Finish-to-Start dependencies with lag, conflict warnings, impact preview and explicit forward-only cascade (DONE never moves)
- Controlled Planner → Trello sync: mapping, dry-run, confirm, idempotent (D-021)
- AI change proposals (ChatGPT / Claude): structured context, BEFORE → PROPOSED review, human apply/reject (D-022)
- Weekly review, change history, Personal Assistant feed (D-024)
- E:DEN macro structure seed, codes and titles only (D-023)
- Append-only audit log of every write

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

The app runs with an empty environment (offline `local-dev` mode, loopback
only). `/settings/integrations` shows which integrations are configured (never
their values). On an empty database the planner offers "Create E:DEN master
plan" (the 16 macro tasks, no dates).

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
What others must do to go online: `docs/HANDOFF.md`. Details: `docs/ECOSYSTEM_ALIGNMENT.md` (congruence with the E:DEN
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
| `node scripts/agent-token.mjs CLAUDE` | New API token for an AI agent (prints the token once and the hash for `PLANNER_AGENT_TOKENS`) |

## Layout

```
src/app/         routes (/planner, /review, /proposals, /history, /settings/*, /api/*)
src/components/  UI grouped by surface (shell, planner, settings, ui)
src/config/      env validation (server-only secrets vs public vars), app constants
src/domain/      framework-free planning, scheduling, Trello mapping, proposals, review (unit tested)
src/lib/         SQLite store and migrator, services (planning, Trello, proposals), auth, API helpers
db/migrations/   canonical SQLite schema (NNNN_name.sql)
ops/             systemd units, nginx example, deploy/install scripts
scripts/         db.mjs (migrate, status, backup), agent-token.mjs
```

Never commit secrets. Use `.env.local`.

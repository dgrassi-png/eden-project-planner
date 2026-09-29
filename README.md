# E:DEN Project Planner

Web-based master planning system for E:DEN.

**Planner = source of truth. Trello = execution layer.**

## V0
- True interactive Gantt
- Project > Workstream > Task > Subtask
- Stable E:DEN task IDs
- Owner, dates, duration, status, priority, geography
- Milestones and Finish-to-Start dependencies
- Controlled Planner -> Trello sync
- AI change proposals for ChatGPT / Claude with human approval
- Audit log

## Stack
Next.js (App Router) + TypeScript + Tailwind + Supabase/Postgres + Vercel.

See `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/CLAUDE_CODE_PROMPTS.md`.

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

### Supabase

1. Create a Supabase project.
2. Apply the migrations in `supabase/migrations/` in filename order, either
   with the SQL editor or with `supabase db push` after `supabase link`.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (or in Vercel).
4. Open `/planner`, create the project, then add workstreams, tasks and team members.

The service-role key stays on the server. RLS blocks direct access with the
anon key. **Sign-in is not implemented yet**, so do not expose a deployment
publicly without protection (see `docs/DECISIONS.md`, D-007).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | Route type generation + `tsc --noEmit` |
| `npm test` | Unit tests (Vitest) |
| `npm run check` | Lint + typecheck + tests |
| `npm run test:db` | Apply migrations to a throwaway local Postgres and run `supabase/tests` (needs PostgreSQL 15+ binaries) |

## Layout

```
src/app/         routes (/planner, /settings/team, /settings/integrations, /api/*)
src/components/  UI grouped by surface (shell, planner, settings, ui)
src/config/      env validation (server-only secrets vs public vars), app constants
src/domain/      framework-free planning + timeline logic (unit tested)
src/lib/         Supabase clients, planning service + store, API helpers
supabase/        migrations (canonical schema) and SQL tests
```

Never commit secrets. Use `.env.local`.

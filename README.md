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

The app runs with an empty environment. `/settings/integrations` shows which
integrations are configured (never their values).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | Route type generation + `tsc --noEmit` |
| `npm test` | Unit tests (Vitest) |
| `npm run check` | Lint + typecheck + tests |

## Layout

```
src/app/         routes (/planner, /settings/integrations)
src/components/  UI grouped by surface (shell, planner, settings, ui)
src/config/      env validation (server-only secrets vs public vars), app constants
src/domain/      framework-free planning + timeline logic (unit tested)
src/lib/         Supabase clients, integration status
supabase/        database schema
```

Never commit secrets. Use `.env.local`.

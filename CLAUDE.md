@AGENTS.md

# E:DEN Project Planner — working notes

Read `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` and
`supabase/migrations/` before changing behaviour. Phases are listed in
`docs/CLAUDE_CODE_PROMPTS.md`; do one phase at a time.

Hard rules:
- Planner is the source of truth; Trello sync is Planner → Trello only, idempotent, previewed.
- Never invent E:DEN dates, durations, owners, progress or dependencies — unknown = `null`/TBD.
- AI agents only submit proposals; canonical writes require human approval.
- Secrets only via `src/config/env.server.ts` (server-only). Never commit credentials.
- Domain logic in `src/domain` stays free of React/Next imports and is unit tested.

Before committing: `npm run check` (lint + typecheck + tests) and `npm run build`.

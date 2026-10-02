@AGENTS.md

# E:DEN Project Planner — working notes

Read `docs/PRODUCT_DEFINITION.md` (product source of truth), `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` and
`db/migrations/` before changing behaviour. Phases are listed in
`docs/CLAUDE_CODE_PROMPTS.md`; do one phase at a time.

Hard rules:
- Planner is the source of truth; Trello sync is Planner → Trello only, idempotent, previewed.
- Never invent E:DEN dates, durations, owners, progress or dependencies — unknown = `null`/TBD.
- AI agents only submit proposals; canonical writes require human approval.
- Secrets only via `src/config/env.server.ts` (server-only). Never commit credentials.
- Domain logic in `src/domain` stays free of React/Next imports and is unit tested.
- Sign-in only through E:DEN Identity; never add a local login or re-derive access from the email domain (`docs/IDENTITY_INTEGRATION.md`).
- UI tokens only from the E:DEN foundation (`src/vendor/eden_ui`, verbatim copies); no raw brand hex, no orange.
- Preview and production never share a unit, port, worktree, env file or state dir (`ops/`, `src/ops/boundary.test.ts`).
- Database = planner-owned SQLite (`db/migrations`, `scripts/db.mjs`); every write goes through the store with its audit event in the same transaction; never edit applied migrations, add a new one.
- E:DEN platform rules: `docs/ECOSYSTEM_ALIGNMENT.md` (manual Rev.09 + `simobarre-EDEN/eden-platform`).

Before committing: `npm run check` (lint + typecheck + tests) and `npm run build`.

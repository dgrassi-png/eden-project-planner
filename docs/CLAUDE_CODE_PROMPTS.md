# Claude Code — implementation sequence

## 00 — Bootstrap
Read README.md, docs/PRODUCT_SPEC.md, docs/ARCHITECTURE.md and supabase/schema.sql first.

Bootstrap a production-quality Next.js App Router application with TypeScript and Tailwind. Use strict TypeScript, ESLint, src/ layout, clean server/client boundaries and environment variables. Create /planner and /settings/integrations. Do not invent E:DEN dates.

Run lint/typecheck/build and fix errors.
Commit: `feat: bootstrap E:DEN project planner`

## 01 — Domain + persistence
Implement typed Supabase access and domain models for Project, Workstream, Task, Dependency, Member and ChangeProposal. Implement task/dependency CRUD, stable eden_code validation, working-day finish calculation, milestones and unscheduled tasks. Add tests.
Commit: `feat: add planning domain and persistence`

## 02 — True Gantt
Implement /planner as an actual interactive date-driven Gantt: hierarchy left, timeline right, week/month/quarter zoom, workstreams, nested tasks, unscheduled area, task bars, milestone diamonds, today line, drag, resize, dependency arrows, editable drawer and sticky header.

Use a permissively licensed maintained library only if appropriate; document licensing/choice in docs/DECISIONS.md. Never fake a Gantt with static colored cells.
Commit: `feat: implement interactive gantt planner`

## 03 — Dependency engine
Implement Finish-to-Start, cycle detection, violation warnings, impact preview and explicit forward-only cascade. Never silently move DONE tasks. Add tests.
Commit: `feat: add dependency scheduling engine`

## 04 — Trello
Implement server-only Trello integration. Credentials never reach client. Add board/member/label/list mappings, idempotent create/update, persisted card mapping, single-task sync, project dry-run + sync, readable failures and audit logging. Direction is Planner -> Trello only.
Commit: `feat: add controlled Trello sync`

## 05 — AI alignment
Implement provider-neutral structured change proposals. App must work without AI keys. Add project AI context, proposal create/read/apply/reject, schema validation, human-readable diff, before/after preview and audit. ChatGPT/Claude do not directly write Trello.
Commit: `feat: add AI proposal approval workflow`

## 06 — E:DEN seed
Seed macro workstreams/task codes from PRODUCT_SPEC. Do not invent dates/durations. Macro milestones can remain unscheduled.
Commit: `feat: add E:DEN initial seed`

## 07 — Hardening + deploy
Review auth/RLS, authorization, injection/XSS, service-role isolation, audit coverage, scheduling/date edge cases, responsive UX and errors. Run lint/typecheck/tests/build. Add docs/DEPLOYMENT.md for Supabase + Vercel.
Commit: `chore: harden and document deployment`

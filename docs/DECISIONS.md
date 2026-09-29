# Decisions

Architecture decision log. Newest entries at the bottom. Each entry: context,
decision, consequences.

## D-001 — Framework and tooling (Phase 00)

**Decision.** Next.js 16 (App Router, `src/` layout), React 19, TypeScript
`strict`, Tailwind CSS v4, ESLint 9 (`eslint-config-next`), Vitest for unit
tests, npm as package manager.

**Why.** Matches the specified stack, deploys to Vercel with zero
configuration. Vitest is used instead of Jest because it runs TypeScript/ESM
natively with no transform setup.

**Notes.**
- `@types/node` is pinned to v22 to match the Node 22 runtime (and Vitest 5's
  peer range). `engines.node` is `>=20.9` (Next.js 16 minimum).
- No Google-hosted fonts: the system font stack keeps builds free of network
  fetches and avoids a third-party request from an internal tool.

## D-002 — Code layout and server/client boundary (Phase 00)

```
src/
  app/                 routes only (thin; compose components + server data)
  components/          React components, grouped by surface (shell, planner, settings, ui)
  config/              env schemas (pure), env.server (server-only), env.public, app constants
  domain/              framework-free business logic (planning enums, timeline/date math)
  lib/                 adapters: supabase clients, integrations status
```

- **Domain logic has no React/Next imports** and is unit tested directly.
- **Secrets are only reachable through `src/config/env.server.ts`**, which
  imports `server-only`; importing it from a Client Component fails the build.
  `src/config/env.public.ts` exposes only `NEXT_PUBLIC_*` variables.
- Three Supabase factories: browser (anon, RLS), server (anon + auth cookies,
  RLS) and admin (service role, bypasses RLS, server-only). All return `null`
  while unconfigured so the app runs with an empty environment.
- Env is read at request time (`connection()`), not baked in at build, so one
  build can be promoted across environments. Verified: building with sentinel
  secret values leaves no trace of them in `.next/static`.

## D-003 — Environment validation semantics (Phase 00)

- Every integration variable is **optional** during V0 so a fresh checkout
  runs. Empty strings (as shipped in `.env.example`) count as unset.
- **Malformed** values (e.g. a non-URL Supabase URL) fail loudly. Error
  messages list variable names only, never values.
- `AI_MUTATIONS_REQUIRE_APPROVAL` defaults to `true`. Only the literal string
  `false` disables approval; any other value is rejected rather than coerced.

## D-004 — Planning timezone (Phase 00)

"Today" on the timeline is computed server-side in `Europe/Rome`
(`PLANNING_TIME_ZONE`), where E:DEN operates, and passed to the client. That
way server and client render the same date and there is no hydration mismatch.
Planning dates are date-only (`YYYY-MM-DD`) and all date arithmetic is UTC, so
it is unaffected by DST.

## D-005 — Bootstrap planner surface (Phase 00)

- The `/planner` page uses a single scroll container with a sticky task
  table (left) and a date-driven time axis (right). Rows stay aligned, and
  horizontal scrolling moves only the timeline.
- The axis is computed by `src/domain/timeline/scale.ts` (week/month/quarter
  zoom, two header tiers, today marker). Task bars are **not** rendered yet,
  and will not be approximated with coloured cells.
- Placeholder rows live in `src/components/planner/scaffold.ts`. They use a
  `SCAFFOLD-` code prefix, have every planning value `null`, and are flagged
  as UI scaffolding in the UI. No E:DEN codes, dates, owners or durations are
  used before the seed phase. Since Phase 01 they appear only while Supabase
  is not configured.

## D-006: Gantt rendering: own layer, no third-party Gantt library (Phase 02)

**Decision.** The timeline is rendered by our own small layer on top of the
Phase 00 axis. Bars, milestones and start markers are absolutely positioned
elements; dependency arrows are SVG paths; drag and resize use pointer
events. Geometry and snapping rules are pure functions in
`src/domain/timeline/gantt.ts` and are unit tested.

**Candidates evaluated** (npm metadata checked 2026-09-29):

| Library | License | Verdict |
|---|---|---|
| SVAR React Gantt 2.7 (`@svar-ui/react-gantt`) | MIT core + commercial PRO | Rejected: work-time calendar, **unscheduled tasks**, **vertical markers (today line)** and **task grouping** are PRO-only |
| DHTMLX Gantt 10 Community (`dhtmlx-gantt`) | MIT + commercial PRO | Rejected: working-time calendars are PRO-only; imperative global API, own data store and lightbox; type definitions include PRO-only methods |
| Frappe Gantt 1.2 | MIT | Rejected: no hierarchy or workstream grouping, renders its own rows (cannot align with our table); vanilla JS; moves dependencies by default |
| React Modern Gantt 0.9 | MIT | Rejected: 0.x with a single maintainer; flat groups, no subtasks, no working-day calendar |
| gantt-task-react 0.3.9 | MIT | Rejected: unmaintained since 2022, React 18 only |
| Bryntum Gantt, Syncfusion Gantt | Commercial | Rejected: paid licences |

**Why our own layer is the better fit:**
- The database is authoritative: drag → propose → validate on the server →
  persist → reload. Libraries keep their own mutable task store, which would
  have to be intercepted on every change (and in Phase 03, held back for the
  impact preview and the explicit cascade).
- Our scheduling semantics (Mon–Fri working days, start day counts as day 1,
  weekend starts rejected, zero-duration milestones on any day, derived
  finish) are domain rules we already test. Free editions do not offer a
  working-day calendar, so it would have to be reimplemented around them
  anyway.
- The axis, sticky hierarchy table, zoom and today line already existed and
  were tested. Bars, arrows, drag/resize and the unscheduled tray added about 900 lines.

**Limitations and mitigations:**
- No row virtualisation. That is fine for hundreds of tasks; add windowing if
  the plan grows past about 1,500 rows.
- Dependency arrows use simple orthogonal routing and can cross labels
  (labels get a translucent background).
- No drag-to-create dependencies and no left-edge resize (change the start
  in the task panel instead). Both can be added later on the same geometry
  functions.
- Touch input works through pointer events but is not optimised (the app
  is desktop-first).

## D-007: Persistence and access model (Phase 01)

**Decision.** Supabase/Postgres is the only persistence layer. No ORM or
other database abstraction is used. Planning data is read and written
**server-side only**, through `supabase-js` with the service-role key
(`src/lib/planning/supabaseStore.ts`). Every table has **RLS enabled with no
policies**, so the public anon key (shipped to browsers) can neither read
nor write planning data.

- Layering: API route / Server Component → `PlanningService` (use cases) →
  domain rules (`src/domain`, pure) → `PlanningStore` port → Supabase store.
  An in-memory store implements the same port for service tests only.
- **There is no sign-in yet.** Anyone who can reach a running instance can
  edit the plan. Do not expose a deployment publicly until Supabase Auth is
  added: use Vercel Deployment Protection or keep it local. Writes are
  attributed to an unidentified `USER` until then.
- Mutating API routes reject cross-origin requests (Origin check), so the
  API is ready for cookie-based auth.

## D-008: Schema changes (Phase 01)

`supabase/schema.sql` became the baseline migration
`supabase/migrations/20260929000000_initial_schema.sql`. Phase 01 changes are
in `20260930000000_planning_domain.sql`:

- `priority`, `geography` and `progress_percent` are **nullable with no
  default**. Unvalidated values are NULL (TBD). The previous defaults
  (`P1`, `ANYWHERE`, `0`) would have invented planning data. `status`
  keeps its `BACKLOG` default, because a new task is genuinely in the backlog.
- `tasks.workstream_id` is required. A subtask is always in its parent's
  workstream; moving a parent moves its subtasks (trigger).
- Deleting a workstream that has tasks, or a task that has subtasks, is
  blocked (FK `NO ACTION`); deleting a project still cascades.
- `audit_events.project_id` no longer has a foreign key, so audit history
  outlives what it describes. Audit events are append-only.
- `updated_at` triggers; `created_at`/`updated_at` columns added on
  workstreams, members and dependencies.

## D-009: Permanent identifiers (Phase 01)

- `eden_code` is **immutable** once created (DB trigger + API rejects it in
  patches). Format `PREFIX-NNN` (task) or `PREFIX-NNN.N` (subtask, one
  level). The prefix is free (`EIMA-001` can sit in any workstream).
- A subtask's code must start with its parent's code. Because the parent is
  encoded in the code, `parent_task_id` is immutable too.
- Workstream `code` is immutable; name and order can change.
- A typo in a code is fixed by deleting and recreating the task. Codes are
  never renamed in place.

## D-010: Scheduling semantics (Phase 01)

- Calendar: Monday–Friday, no public holidays yet (`src/domain/planning/calendar.ts`).
- Duration is in working days, and **the start day counts as day 1**: a
  5-day task starting Monday finishes Friday.
- `planned_finish` is **derived** (start + duration). It can never be set
  directly and is NULL until both inputs are known.
- Tasks must start on a working day (rejected otherwise, never silently
  moved) and last at least 1 working day. Milestones have duration 0,
  finish = start, and may fall on any calendar day (e.g. a trade fair).
- States: *unscheduled* (no start), *partial* (start, no validated
  duration), *scheduled*.
- Dependencies: Finish-to-Start only, lag is a whole number of **working
  days ≥ 0** (no negative lead in V0). No self, duplicate, parent↔child or
  cyclic links. Cycles are checked in the domain (with a readable path) and
  again by a DB trigger under a per-project advisory lock.

## D-011: Audit through database triggers (Phase 01)

Every insert, update or delete on projects, workstreams, members, tasks and
dependencies writes an `audit_events` row **in the same transaction**, with
before/after JSON and the changed fields. No-op updates are skipped. The
server identifies the actor with PostgREST request headers
(`x-eden-actor-type`, `x-eden-actor-id`). Changes made directly in SQL are
recorded as `SYSTEM`. This covers every writer, including future Trello sync
and AI-proposal apply jobs, without extra code paths.

## D-012: Concurrent edits (Phase 01)

Task edits send the `updatedAt` the editor loaded, and the update only
applies if it still matches. Otherwise the API answers 409 `STALE_EDIT`
instead of silently overwriting a colleague's change.

## D-013: Consequences for Phase 02 (Gantt)

- Bars must be positioned from `plannedStart`/`plannedFinish` through
  `TimelineAxis`. Unscheduled and partial tasks have no bar and need an
  explicit visual treatment.
- Drag = PATCH `plannedStart`; resize = PATCH `plannedDurationDays`. The
  server re-derives the finish. Drops must snap to working days, because
  weekend starts are rejected.
- Send `expectedUpdatedAt` with drag/resize and handle 409 by reloading.
- Dependency arrows use `predecessors`/`successors` from the planner view
  model. Violation warnings and cascade are Phase 03.

## D-014: Timeline interaction rules (Phase 02)

- **Move** (drag a bar): changes `plannedStart`; duration is kept and the
  finish is re-derived. Task starts snap to a working day in the drag
  direction; milestones may land on any day.
- **Resize** (drag the finish edge): changes `plannedDurationDays` in working
  days, minimum 1. A finish dragged onto a weekend snaps back to Friday.
- **Keyboard**: a focused bar moves with ←/→ and changes duration with
  Shift+←/→; Enter opens the task panel.
- **Unscheduled** tasks have no bar and are listed in the Unscheduled tray.
  Double-clicking a task's timeline row sets its start (duration stays TBD
  until validated). Tasks with a start but no duration show a start marker.
- **DONE and CANCELLED** tasks are locked on the timeline (they can still be
  edited explicitly in the task panel).
- Every change is a single PATCH with `expectedUpdatedAt`. It **never moves
  other tasks**: successors stay put until the Phase 03 impact preview and
  explicit cascade. A conflicting edit is rejected (409) and the view
  reloads.
- Workstream rows show a display-only span of their scheduled tasks. It is
  computed and never stored.

## D-015: Offline validation and future authentication (2026-09-29)

Decided by the product owner:
- For now the planner runs **locally only** (no public deployment) while the
  team validates planning data and workflows. Local development uses the
  Supabase CLI stack (`npx supabase start`, requires Docker) or a hosted
  Supabase project with the app running on `localhost`.
- When sign-in is added, it is restricted to **`@e-den.tech`** accounts
  (Supabase Auth, email domain enforced server-side and in RLS policies).
  Until then the planner must not be deployed publicly.

## D-016: Reading the Master Product Definition v1.0 (2026-09-29)

`docs/PRODUCT_DEFINITION.md` is the product source of truth. Where it could
be read in two ways, the planner follows these interpretations:

- **§32 "Identity: code" in the drawer.** The drawer *shows* the E code but
  does not edit it. §4 (the code is permanent and referenced in Trello,
  emails and AI) takes precedence. A mistyped code is fixed by deleting and
  recreating the task before it is used elsewhere (D-009).
- **§23 "Finish: 10 Oct → 17 Oct" in AI proposals.** Planned finish stays
  derived (D-010). A proposal that targets a finish date is translated into
  a duration (or start) change and previewed as such. The UI still shows
  the finish before and after.
- **Roadmap (§41).** Phases 00–05 match `docs/CLAUDE_CODE_PROMPTS.md`. The
  definition's Phase 06 (population with the team), 07 (operating views) and
  08 (Personal Assistant interface) replace the prompt file's 06 (seed) and
  07 (hardening and deploy). Hardening (auth restricted to `@e-den.tech`,
  RLS policies, deployment) is still required before any public deployment
  (D-015).

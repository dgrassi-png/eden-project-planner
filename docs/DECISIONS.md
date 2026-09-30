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

## D-017: Congruence with the E:DEN digital ecosystem (2026-09-29)

The planner was checked against the *Manuale dell'Ecosistema Digitale*
Rev.03–09 and the `simobarre-EDEN/eden-platform` monorepo (full report:
`docs/ECOSYSTEM_ALIGNMENT.md`). Resulting decisions:

- **Sign-in = E:DEN Identity relying party** (supersedes the Supabase Auth
  plans in D-007 and D-015). No local login. Admission is Identity's
  `platform_full_access` claim or an ACTIVE planner entitlement; the planner
  never re-derives access from the email domain (ADR-R09-01/02). Offline
  `local-dev` mode serves loopback requests only. Details:
  `docs/IDENTITY_INTEGRATION.md`.
- **Database is server-only**: the browser Supabase client, anon key and
  `NEXT_PUBLIC_*` variables are removed (`SUPABASE_URL` is server-only).
- **UI = E:DEN foundation**: `shared/eden_ui` files vendored verbatim with
  SHA-256 provenance (TRANSITORIO until the move into the monorepo);
  Carbon/Ice operational material; Blue/Cyan/Mint; no orange.
- **Health/readiness**: `/healthz` (liveness, no DB) and `/readyz`
  (configuration, Identity, DB, schema-version gate via
  `planner_schema_version`).
- **Ops as code** (`ops/`): hardened systemd units, nginx example, installer
  and candidate/rollback deploy script with a preview/production guardrail;
  `X-Eden-Deploy-Sha` release header.
- **Hosting**: E:DEN host (nginx + systemd) is prepared as the congruent
  target instead of Vercel. **Pending confirmation** by the product owner.
- **Open**: database provider approval, monorepo placement, hostnames/ports,
  Trello vs. the removed legacy `task_intelligence`, Identity registration
  (owned by the Identity team).

## D-018: Product-owner decisions on going online (2026-09-30)

Confirmed:
1. **Hosting on the E:DEN host** (nginx + systemd, `ops/`), not Vercel.
2. **Move into the monorepo** as `simobarre-EDEN/eden-platform/frontends/planner`.
   This needs write access to that repository, or its owner to accept the
   change. Until then the vendored UI foundation stays TRANSITORIO.
3. **Hostnames and ports**: `planner.e-den.tech` → 127.0.0.1:3300,
   `planner-preview.e-den.tech` → 127.0.0.1:3310.

Still open: database provider (D-017) and Trello compatibility with the
removed legacy `task_intelligence`.

## D-019: SQLite on the E:DEN host; Trello confirmed (2026-09-30)

Decided by the product owner. This supersedes the Supabase/Postgres choices in
D-007, D-008 and D-011 and the "Supabase" wording of Product Definition §33.
Canonical data now lives in the planner's own SQLite database; Supabase is no
longer used.

- **Why.** It is the E:DEN standard for per-service data (Budget, Natura). It
  adds no external provider and needs no approval (PostgreSQL is NO-GO in the
  manual), and backups use the existing E:DEN format and tooling. SQLite is
  ample for an internal planning tool.
- **Storage.** One file per environment, `/var/lib/eden/planner-<env>/planner.sqlite3`,
  set in the systemd unit. WAL mode, `foreign_keys=ON`, 5 s busy timeout,
  driver `better-sqlite3`. Offline the file is `.data/planner.sqlite3`.
- **Schema.** `db/migrations/NNNN_name.sql`, applied by `scripts/db.mjs migrate`
  (never implicitly in production). Each migration is recorded in
  `schema_migrations` with its SHA-256; changing an applied migration is a hard
  error. The app refuses to serve a schema older than `EXPECTED_SCHEMA_VERSION`,
  and `/readyz` reports it.
- **Integrity.**
  - CHECK constraints: code formats via `GLOB`, enums, scheduling invariants.
  - `RAISE(ABORT, 'CODE: …')` triggers: permanent codes, parent and project,
    hierarchy rules, subtask workstream propagation, dependency project and
    parent/child rules, append-only audit.
  - Cycles are rejected inside the write transaction with a recursive query,
    because SQLite does not allow CTEs in triggers and writers are serialised.
- **Audit** (replaces D-011's DB trigger). The store writes the audit event in
  the same IMMEDIATE transaction as the change, with before/after rows and the
  changed fields, attributed to the Identity user. This follows the E:DEN
  audit contract ("config save + audit event → same transaction"). Changes made
  directly with the `sqlite3` CLI are not audited; operators must not edit the
  database by hand.
- **Backups.**
  - `scripts/db.mjs backup` uses the same layout and manifest as
    `ops/backup/backup_sqlite.py`.
  - The deploy script backs up before migrating.
  - Once the planner is in the monorepo, the platform script and the
    `eden-sqlite-backup@` timer can be used by adding `planner` to its product
    choices.
- **Tests.** Schema guards, store, audit and the service scenarios (shared
  with the in-memory store) run against real SQLite in vitest, so also in CI.
- **Trello (item 5).** The Planner → Trello sync (Phase 04) is confirmed. It is
  one-way, previewed, idempotent and planner-owned, and it does not revive the
  removed `task_intelligence` (no email-to-task, no scoring).

## D-020: Dependency scheduling engine (Phase 03)

Pure engine in `src/domain/planning/scheduling.ts`, used by the service, the
API and the Gantt.

- **Finish-to-Start rule.** A successor may start on the first working day
  after its predecessor's finish, plus `lag` working days (lag 2 after a
  Friday finish → Wednesday). A milestone successor may fall on any calendar
  day after that point. Conflict size is counted in working days for tasks and
  calendar days for milestones.
- **States.** Each dependency is `ok`, `violated`, `unknown` (the predecessor
  has no finish or the successor no start: nothing is guessed) or `inactive`
  (either side is CANCELLED).
- **Nothing moves silently.** A drag or an edit that creates a conflict opens
  the impact dialog ("Moving TEC-001 creates a 5-day conflict with TEC-002")
  with three choices: cancel, save and keep the conflict, or cascade.
- **Cascade** is explicit and forward-only. It walks the tasks downstream of
  the changed task in topological order and moves each one to the earliest
  start its predecessors allow (the latest constraint wins, including
  predecessors outside the chain), keeping its duration. It never moves a task
  earlier, never gives an unscheduled task a date, and never moves DONE or
  CANCELLED tasks: those are listed as blocked and keep their conflict.
- **Previewed = applied.** The client sends back the moves it showed. The
  server re-plans and refuses with 409 `CASCADE_CHANGED` if the plan differs.
  The change and all moves are written in one transaction (`applyBatch`), and
  each audit event carries `metadata.cascade_from`.
- **API.** `POST /api/tasks/:id/impact` (preview, saves nothing);
  `PATCH /api/tasks/:id` with `cascade: { moves }`; `GET|POST /api/tasks/:id/cascade`
  (resolve existing downstream conflicts); `GET /api/projects/:id/schedule`
  (all checks).
- **New nullable task fields** (migration 0002): `deadline` (external due date,
  never derived; the planner flags a finish after it), `blocker`,
  `waiting_for`, `notes`, `splittable` (yes/no/unknown, Product Definition
  §27). Unknown stays NULL.
- The in-memory test store was removed: every service test runs on a real
  in-memory SQLite database with the production migrations.

## D-021: Controlled Planner → Trello sync (Phase 04)

- **One way.** The planner writes cards; it never reads Trello back into the
  plan. The only reads are the board's lists, labels and members (for the
  mapping screen) and the board's cards, to find the card a task is linked to
  and to adopt a card that an interrupted run already created.
- **Mapping** (`trello_settings`, migration 0003, Settings → Trello): status →
  list, workstream → label, person → Trello member (`members.trello_member_id`),
  and subtasks either as checklist items on the parent card (default) or as
  their own cards. Every id is picked from what the Trello API returns for the
  board and is re-validated on save; nothing is guessed. A status without a
  list is a mapping error (the card is not written). A missing label or member
  is a warning (the card is written without it).
- **Card content.** Title `[TEC-001] Title`, due = planned finish at 12:00 UTC
  (same calendar day in every European time zone; cleared when the finish is
  TBD), `dueComplete` when DONE, and a compact description (workstream, owner,
  plan, deadline, priority, location, predecessors, blocker, waiting for,
  description). It ends with `EDEN_CODE:<code>` and `EDEN_PLANNER_ID:<uuid>`.
  Unknown values appear as TBD. Edits made on the card in Trello are
  overwritten by the next sync.
- **Idempotency.** A linked card (`trello_card_id`, unique) is always updated,
  never recreated. Without a link, a card whose description carries the task's
  `EDEN_PLANNER_ID` is adopted. The link is stored as soon as the card is
  written, before the checklist, so a later failure cannot lose it. Checklist
  items are reconciled by E:DEN code, and items people added by hand are kept.
  A SHA-256 fingerprint of the last content sent marks unchanged cards, and
  any planning edit marks a synced task `OUT_OF_SYNC`.
- **Previewed = applied.** The project sync (and the single-task sync) always
  starts with a dry-run ("12 unchanged · 3 will be updated · 2 will be created
  · 1 mapping error"). Confirming sends the previewed items back, and the
  server refuses with 409 `SYNC_PLAN_CHANGED` if the plan has changed. Items
  are independent: a failure is recorded on the task (`SYNC_ERROR`, readable
  message) and the rest continue.
- **Security.** The key and token stay on the server (`TRELLO_*` in the
  environment file). They are sent in the `Authorization: OAuth …` header,
  never in URLs, and every Trello response is validated with zod.
  `TRELLO_API_BASE_URL` exists only for offline tests and is refused unless it
  is the Trello API or a loopback address.
- **Audit.** Mapping changes are audited as the user. Sync bookkeeping is
  audited as `TRELLO_SYNC` with the user's id. Sync bookkeeping does not
  change a task's `updated_at`, so open editors are not invalidated.
- A deleted card is reported ("no longer on the board"). "Unlink" in the task
  panel forgets the link, and the next sync re-links the card by its marker or
  creates a new one. Nothing is ever deleted or archived in Trello.

## D-022: AI change proposals with human approval (Phase 05)

- **Provider-neutral format** (`src/domain/proposals/schema.ts`): a list of
  `update_task`, `create_task`, `add_dependency`, `update_dependency` and
  `remove_dependency` changes. Tasks are referenced by E:DEN code and people by
  name or email. Tasks cannot be deleted through a proposal. A target
  `plannedFinish` is translated into a duration (or a milestone date), per D-016.
- **Review** (`simulate.ts`): the proposal is replayed on a copy of the
  current plan, change by change, with the same domain rules as a manual edit.
  The review shows every problem with its change number, a BEFORE → PROPOSED
  table per task and dependency, and the dependency conflicts the proposal
  creates or resolves. Successors are never moved by a proposal; cascade stays
  an explicit planner action.
- **Apply = one transaction.** Only a signed-in person can apply. The request
  carries the fingerprint of the diff they reviewed; if the plan changed since
  then, the server answers 409 `PROPOSAL_CHANGED`. The planning writes, the
  proposal status and their audit events (actor = the approving user,
  `metadata.proposal_id` / `proposal_source`) are written together. Reviewed
  proposals are final, and proposals are never deleted (DB triggers).
- **Agents** (ChatGPT, Claude) authenticate with an API token
  (`Authorization: Bearer`). The server stores only its SHA-256 in
  `PLANNER_AGENT_TOKENS` (`scripts/agent-token.mjs` generates one). A token
  may only list projects, read `/ai-context` and submit or read proposals,
  always as itself (audit actor `CLAUDE` / `CHATGPT`). Every person-only route
  rejects Bearer tokens, even in local-dev mode. `ASSISTANT` tokens are
  read-only (Personal Assistant, §26).
- **AI context** (`GET /api/projects/:id/ai-context`, schema
  `eden-planner/ai-context@1`): the rules, workstreams, people (names only, no
  emails or ids), tasks with every planning field (unknown = null), dependency
  states, violations, pending proposals, 14 days of changes, and the proposal
  format.
- **Optional drafting** (`POST /api/projects/:id/ai-draft`): with
  `ANTHROPIC_API_KEY` (model `ANTHROPIC_MODEL`, default `claude-opus-5-5`,
  forced tool call) or `OPENAI_API_KEY` + `OPENAI_MODEL` (JSON mode; no default
  model is assumed), the server asks the provider for a proposal. The answer
  goes through the same schema and review. Without keys everything else works.
- `AI_MUTATIONS_REQUIRE_APPROVAL` stays `true`. In V0 the planner has no
  auto-apply path at all, so `false` changes nothing (hard rule: canonical
  writes need human approval).

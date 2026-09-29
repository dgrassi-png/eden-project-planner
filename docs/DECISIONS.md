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
  used before the seed phase.

## D-006 — Gantt library (pending, Phase 02)

Not decided yet. The Phase 02 evaluation will record, for each candidate,
its license, drag/resize support, custom rendering, dependency arrows and
maintenance status, then select one or justify a custom renderer. Constraints:
permissive license, no paid tier needed for essential features, React 19 /
Next.js 16 compatible. The planner shell is built so the timeline pane can be
replaced without touching the domain or data layers.

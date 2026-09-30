# Planner ↔ E:DEN digital ecosystem: congruence check

**Sources checked (2026-09-29):**
- *Manuale dell'Ecosistema Digitale* Rev.03, 06, 07, 08 and 09 (Shared Drive; Rev.09 of 2026-09-25 is the current baseline).
- The `simobarre-EDEN/eden-platform` monorepo:
  - operational branch `foundation/phase-9-natura-linux-deployability` @ `fed71e6`;
  - `fix/internal-platform-full-access` @ `ca44152` (Rev.09 Identity fix);
  - `fix/website-production-isolation` @ `6f0fcb4` (Rev.09 website boundary).

Status labels follow the manual: CANONICO / ATTIVO / TRANSITORIO / TARGET / RISCHIO.

## 1. Already congruent

| Manual rule | Planner |
|---|---|
| Runtime, DB, secrets, deploy and rollback per service; no cross-DB access (ADR-0001/0002) | Planner owns its DB; no other product's data is read |
| Next.js 16 / React 19 / TypeScript for frontends | Next.js 16.3, React 19.2, strict TS |
| Audit append-only, before/after, actor metadata ≠ authentication | DB-trigger audit, append-only, no-op skipped, actor from headers |
| Error contract distinguishes 401/403/404/409/422/5xx | API error kinds map to those codes |
| Review-before-apply for machine-proposed changes | AI proposals (Phase 05) are reviewed before apply |
| Seed/placeholder ≠ real data; don't invent specs | Unknown values stay NULL/TBD; no seed data |
| Secrets outside git, `/etc/eden/*.env` | All config server-side, env files outside the repo |

## 2. Changed in this iteration to become congruent

| Area | Manual rule | Change |
|---|---|---|
| Sign-in | Identity (`auth.e-den.tech`) is the **only** source of truth for internal access; no local login; consumers read the claim, never re-derive the domain rule (Rev.09 ADR-R09-01/02/03) | Planner is an Identity **relying party**: `/entry/planner` → callback `?code=` → server exchange. Admission = `platform_full_access` or ACTIVE planner entitlement. No password login, no Supabase Auth. Local-dev mode (no login) is served to loopback requests only. See `docs/IDENTITY_INTEGRATION.md` |
| Authorization | Server-side; browser can never set access | Signed HttpOnly session cookie (`__Host-` prefix online); verified in the proxy **and** in every page and route handler |
| Browser ↔ DB | Least privilege, no public data plane for admin state | Removed the browser Supabase client and anon key; DB is server-only (`SUPABASE_URL` is no longer `NEXT_PUBLIC_*`) |
| UI foundation | `shared/eden_ui` tokens are canonical; Blue/Cyan/Mint; orange deprecated; operational products use Carbon/Ice; `data-eden-foundation` on `<html>` | Verbatim foundation + Carbon/Ice layer vendored with SHA-256 provenance (TRANSITORIO); Tailwind scales mapped onto E:DEN tokens; amber/violet removed; primary action in E:DEN Blue with on-accent ink; E:DEN mark as favicon |
| Health | Health and critical-route smoke per service; migrations must be verified as applied | `/healthz` (liveness, no DB, Natura convention) and `/readyz` (config, Identity, DB, **schema version** gate). New `planner_schema_version` migration |
| Release identity | `X-Eden-Deploy-Sha` baked at build (website) | Same header from `EDEN_DEPLOY_SHA`; `EDEN_NEXT_DIST_DIR` for candidate builds |
| Preview/production boundary | Distinct services, ports, worktrees, guardrail (Rev.09 ADR-R09-04) | `eden-planner-production` (:3300) and `eden-planner-preview` (:3310) units, nginx example, candidate/rollback deploy script with production guardrail; a unit test enforces the boundary |
| Ops as code | Critical config mirrored in the repo (ADR-R09-05) | `ops/` holds units, nginx example, env example, installer and deploy script |
| Hardening | systemd hardening, security headers | `ProtectSystem=strict`, `NoNewPrivileges`, `PrivateTmp`, `UMask=0027`; CSP frame-ancestors, X-Frame-Options, HSTS, nosniff, same-origin referrer, noindex |

## 3. Decisions

Confirmed by the product owner on 2026-09-30 (D-018): **1. hosting on the E:DEN host**, **3. move into the monorepo**, **4. hostnames/ports as proposed**. Items 2 (database) and 5 (Trello) are still open.

Original list:

1. **Hosting.** The ecosystem runs on the E:DEN EC2 host behind nginx + systemd, with no Vercel in use. ADR-0002 also says browsers must never see provider hostnames. This iteration prepares the **EC2 path** as the congruent target. The original brief said Vercel, so please confirm.
2. **Database.** The ecosystem uses per-service SQLite on local disk; PostgreSQL is "NO-GO until driver, server, suite and restore are approved". The planner uses **Postgres (Supabase-hosted)**. That respects exclusive ownership, but it is a new external provider without precedent. Options:
   - **(a)** Keep Supabase as a DB-only provider in an EU region, on a plan with backups, plus a written `pg_dump`/restore runbook. Needs approval.
   - **(b)** Self-host Postgres on the E:DEN host. Needs the same approval, plus server isolation.
   - **(c)** Move to SQLite. This is a rewrite of the persistence layer and the DB-level guards.

   **Recommendation: (a).**
3. **Monorepo placement.** Rules: shared capabilities live on the production deploy line (ADR-R08-01); foundation consumers import `shared/eden_ui` by relative path, and the contract test lists them; a new frontend must justify its security/deploy boundary, owner, API contract and value (entrypoints map). **Recommendation:** move the planner into the monorepo as `frontends/planner` and drop the vendored foundation copy.
4. **Hostnames and ports.** Proposed: `planner.e-den.tech` → :3300, `planner-preview.e-den.tech` → :3310. There is no port registry, so this needs confirmation.
5. **Trello.** Rev.08 **removed** Budget's `task_intelligence` (Trello + email-to-task) as LEGACY. The Product Definition v1.0 still requires a new, bounded **Planner → Trello** sync. It is planner-owned, previewed and idempotent, and it does not revive email-to-task or scoring. Please confirm that the two are compatible before Phase 04.

## 4. Blocked on other owners

- **Identity (owner: Identity/platform).** `planner` does not exist in `auth.e-den.tech` yet: it needs the `/entry/planner`, `/sso/planner/` and `/api/sso/planner/exchange` routes, a `PLANNER_CALLBACK_URL` validator and infra parameters. The `platform_full_access` claim only exists on `fix/internal-platform-full-access`, which is not merged yet. The exact change list is in `docs/IDENTITY_INTEGRATION.md` §4. It was not applied: the monorepo belongs to another team.
- **Host (owner: ops).** TLS certificate for the planner hostnames, the nginx server block in the host-managed `eden-platform.conf`, and the Node 22 runtime path.
- **Backups.** `ops/backup/backup_sqlite.py` only covers SQLite for budget/natura. Whatever the DB decision, the planner needs a backup and restore runbook before go-live.

## 5. Residual risks (planner)

| Risk | Sev. | Mitigation |
|---|---|---|
| Identity exchange is unsigned JSON with no RP authentication; there is no `state` round-trip | MED | 60 s one-time code; server-side exchange over TLS; strict contract validation; pending-flow cookie binds the callback to the browser that started it. Signed responses and a `state` echo have been requested from Identity |
| No logout propagation / revocation push from Identity | MED | 8 h planner session (aligned with Identity); access re-checked at every login |
| Vendored foundation drifts from upstream | LOW | SHA-256 test; removed on move into the monorepo |
| No login/public exposure before Identity registration | HIGH if deployed | `/readyz` fails in production unless `identity` mode is configured; the deploy script refuses an unready release |

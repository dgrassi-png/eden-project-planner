# E:DEN Identity integration (planner as relying party)

Identity (`auth.e-den.tech`) is the only source of truth for internal access
(manual Rev.09, ADR-R09-01/02/03). The planner has **no local login**.

## 1. Contract (as implemented by Identity for Natura and the external rooms)

1. The browser goes to `GET {IDENTITY}/entry/planner`. This takes no parameters; Identity keeps its own intent.
2. Identity authenticates the user (Cognito) and checks access:
   - **ACTIVE** `ENT#planner` entitlement, or
   - **platform full access**: a verified, exact-domain `@e-den.tech` account, or an ADMIN_GRANT. This is the FIX branch.
3. Identity sends `302 {PLANNER_CALLBACK_URL}?code=<one-time>`. The code is valid for 60 s.
4. The planner server calls `POST {IDENTITY}/api/sso/planner/exchange` with body `{"code": "…"}` and gets back JSON:

   ```json
   {"identity_subject":"eden_…","eden_user_id":"eden_…","email":"…","email_verified":true,
    "application":"planner","platform_full_access":true,"entitlement":"ACTIVE"}
   ```

   `entitlement` is present only when an ACTIVE entitlement exists. Errors are `401` (invalid or used code), `403` (no access) and `400`.

## 2. Planner implementation

| Piece | File |
|---|---|
| Contract validation (fail-closed), admission rule, `next` sanitising | `src/domain/auth/identityContract.ts` (unit tested) |
| Auth mode resolution (`identity` / `local-dev` / `misconfigured`) | `src/config/auth.ts` (unit tested) |
| HMAC-signed cookies (session 8 h, pending flow 10 min) | `src/lib/auth/token.ts`, `session.ts` (unit tested) |
| Exchange client (5 s timeout, no redirects, 4 KiB cap) | `src/lib/auth/identityClient.ts` |
| Routes | `GET /auth/eden/start?next=`, `GET /auth/eden/callback?code=`, `POST /auth/logout` |
| First gate | `src/proxy.ts` (pages → sign-in redirect, API → 401) |
| Defence in depth | Every page (`requirePagePrincipal`) and API handler (`planningRoute`) re-verifies the session |
| Audit attribution | Every write carries `x-eden-actor-id: <eden_user_id>` and is recorded by the DB trigger |

Rules:
- **Admission** is `platform_full_access === true` **or** `entitlement === "ACTIVE"`. The planner never inspects the email domain.
- A `platform_full_access` value that is not a boolean, an unverified email, a wrong `application` or a malformed `eden_user_id` all mean rejection.
- The callback is accepted only if this browser started the flow (signed pending cookie). This limits login CSRF while Identity has no `state` echo.
- **Session.** The cookie is `__Host-planner_session` (Secure, HttpOnly, SameSite=Lax, Path=/) and holds `eden_user_id`, email and the `platform_full_access` value at login.
- **Logout** is local, as in Budget and Natura. The Identity session is managed by the portal.

## 3. Configuration

```
PLANNER_AUTH_MODE=identity
EDEN_IDENTITY_BASE_URL=https://auth.e-den.tech
EDEN_IDENTITY_APP_ID=planner
PLANNER_PUBLIC_URL=https://planner.e-den.tech
PLANNER_SESSION_SECRET=<48+ random bytes, per environment>
```

- Offline, with nothing configured and outside production, the planner runs in `local-dev` mode: there is no login, only loopback requests are served, and actions are attributed to `local-dev`.
- In a production build, missing configuration means `misconfigured`: everything is refused and `/readyz` returns 503.

## 4. Changes required in Identity (owner: Identity / platform)

These have **not** been applied: the monorepo belongs to another team. They mirror the existing Natura pattern, without the legacy link or bootstrap, because the planner has no legacy accounts. They should build on `fix/internal-platform-full-access`, which provides `platform_full_access`.

1. **`services/identity/src/eden_identity/lambda_app.py`**
   - Add `"planner": "/sso/planner/"` to `APPLICATION_PATHS`. This feeds entitlements, return paths, the admin overview and the internal "all apps" list.
   - In `handler()`, route `GET /sso/planner/` to `_planner_sso_start` and `POST /api/sso/planner/exchange` to `_planner_sso_exchange`.
   - `_planner_sso_start` works like `_natura_sso_start`:
     - require a session with `"planner"` in `session["applications"]`;
     - check the Cognito-verified email (generalise `_natura_verified_email` with an application id);
     - store `PLANNERSSO#<sha256(code)>` with `application_id="planner"` and a TTL of `SSO_CODE_TTL`;
     - audit `PLANNER_SSO_CODE_ISSUED`;
     - redirect to `_planner_callback_url()?code=…`.
   - `_planner_sso_exchange` works like `_natura_sso_exchange`:
     - consume the code atomically (`OPEN→CONSUMED`, not expired, `application_id="planner"`);
     - require an ACTIVE `ENT#planner` **or** `_platform_access_claim()`;
     - **no** `LEGACY#` requirement;
     - audit `PLANNER_SSO_CODE_CONSUMED`;
     - return the JSON in §1, always with a boolean `platform_full_access`.
   - `_planner_callback_url()` reads `PLANNER_CALLBACK_URL` and accepts exactly `https://planner.e-den.tech/auth/eden/callback`: https, exact host, exact path, no query, fragment or userinfo, port 443.
   - The resolver (`_resolve_intended_access`) needs no change: the generic `if active: return return_path` branch already covers the planner.
2. **Infra.**
   - `infra/identity-sandbox/application.yaml`: a `PlannerCallbackUrl` parameter with an `AllowedPattern` for the exact URL, added to the Lambda `Environment.Variables`.
   - `scripts/deploy-aws.sh`: a required-variable check and a parameter override.
   - `scripts/deploy-production.sh`: a production default.
3. **Account portal.** Add `planner: "/entry/planner"` to `LIVE_LAUNCH_PATHS` in `frontends/account/components/AccountExperience.tsx`, and a card in `services/identity/fixtures/applications.json`.
4. **Tests.** Patch `PLANNER_CALLBACK_URL` in `setUp` of `tests/test_classic_access_flow.py` and cover the following:
   - an internal user is exchanged without an entitlement, with `platform_full_access=true`;
   - an external user needs ACTIVE `ENT#planner`;
   - a revoked or expired entitlement gives 403;
   - a code is single-use (401 the second time);
   - the callback validator rejects other hosts and paths.

## 5. Questions for the Identity owner

1. Should the planner be entitlement-gated (AccessRequest and admin approval) for non-internal users, as proposed above, or internal-only?
2. When will `fix/internal-platform-full-access` merge? Is `platform_full_access` guaranteed on every exchange?
3. Are any of these planned: RP authentication on the exchange (client secret or HMAC), a `state` round-trip, or signed responses?
4. Is there a sandbox callback allowance for a staging hostname (`planner-preview.e-den.tech`)?
5. Is there a session-validity or revocation signal for relying parties?

## 6. Local verification

A mock of the contract was used to run the full flow against the production build:
- internal user admitted;
- external user without access denied;
- a non-boolean claim rejected (`contract`);
- a replayed or foreign callback rejected (`expired`);
- a tampered cookie gives 401;
- an open redirect in `next` neutralised;
- logout clears the session;
- writes are audited with the Identity `eden_user_id`.

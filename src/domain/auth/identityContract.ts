import { fail, issue, ok, type Result } from "../result";

/**
 * E:DEN Identity relying-party contract (see docs/IDENTITY_INTEGRATION.md).
 *
 * Identity (auth.e-den.tech) redirects to the planner callback with a
 * one-time `code`; the planner server exchanges it at
 * `POST /api/sso/<app>/exchange` and receives plain JSON. Identity is the
 * only source of truth for platform access (manual Rev.09, ADR-R09-01): the
 * planner never re-derives access from the email domain. It only consumes
 * the `platform_full_access` claim and the product entitlement.
 */

export interface IdentityPrincipal {
  /** Stable, provider-independent E:DEN user id (`eden_…`). */
  edenUserId: string;
  /** Verified email; an attribute, never the key. */
  email: string;
  platformFullAccess: boolean;
  /** True when Identity reports an ACTIVE planner entitlement. */
  entitlementActive: boolean;
}

const EDEN_USER_ID = /^eden_[A-Za-z0-9_-]{1,128}$/;
const MAX_EMAIL = 320;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strict, fail-closed validation of the exchange response. Any unexpected
 * shape is rejected. `platform_full_access` must be a boolean (Identity FIX
 * contract), never coerced.
 */
export function parseExchangeResponse(json: unknown, expectedApplication: string): Result<IdentityPrincipal> {
  if (!isObject(json)) return fail([issue("IDENTITY_CONTRACT", "Identity response is not an object")]);
  const { eden_user_id, email, email_verified, application, platform_full_access, entitlement } = json;
  const problems: string[] = [];
  if (typeof eden_user_id !== "string" || !EDEN_USER_ID.test(eden_user_id)) problems.push("eden_user_id");
  if (typeof email !== "string" || email.length > MAX_EMAIL || email.split("@").length !== 2) problems.push("email");
  if (email_verified !== true) problems.push("email_verified");
  if (application !== expectedApplication) problems.push("application");
  if (typeof platform_full_access !== "boolean") problems.push("platform_full_access");
  if (entitlement !== undefined && entitlement !== "ACTIVE") problems.push("entitlement");
  if (problems.length) {
    return fail([issue("IDENTITY_CONTRACT", `Identity response rejected (${problems.join(", ")})`)]);
  }
  return ok({
    edenUserId: eden_user_id as string,
    email: email as string,
    platformFullAccess: platform_full_access as boolean,
    entitlementActive: entitlement === "ACTIVE",
  });
}

/**
 * Admission to the planner: internal platform access (claim computed by
 * Identity for verified @e-den.tech accounts) or an explicit ACTIVE planner
 * entitlement granted in Identity. Nothing else.
 */
export function isAdmitted(principal: IdentityPrincipal): boolean {
  return principal.platformFullAccess || principal.entitlementActive;
}

const DEFAULT_NEXT = "/planner";

/**
 * Post-login destination: only same-origin relative paths are accepted
 * (no scheme, no protocol-relative `//`, no backslashes or control chars).
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || raw.length > 512) return DEFAULT_NEXT;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return DEFAULT_NEXT;
  // Reject control characters (incl. encoded CR/LF tricks after decoding by the browser).
  if (/[\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_NEXT;
  try {
    const url = new URL(raw, "https://planner.invalid");
    if (url.origin !== "https://planner.invalid") return DEFAULT_NEXT;
    if (url.pathname.startsWith("/auth/")) return DEFAULT_NEXT;
    return `${url.pathname}${url.search}`;
  } catch {
    return DEFAULT_NEXT;
  }
}

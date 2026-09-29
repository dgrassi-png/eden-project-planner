import "server-only";

import type { AuthConfig } from "@/config/auth";
import { parseExchangeResponse, type IdentityPrincipal } from "@/domain/auth/identityContract";

type IdentityConfig = Extract<AuthConfig, { mode: "identity" }>;

export type ExchangeOutcome =
  | { ok: true; principal: IdentityPrincipal }
  | { ok: false; reason: "invalid" | "denied" | "unavailable" | "contract" };

const MAX_RESPONSE_BYTES = 4096;
const TIMEOUT_MS = 5000;

/** One-time code: opaque URL-safe string, at most 256 characters (Identity limit). */
export function isPlausibleCode(code: string | null): code is string {
  return !!code && code.length <= 256 && /^[A-Za-z0-9_-]+$/.test(code);
}

/**
 * Server-to-server exchange of the one-time code, mirroring the Django
 * adapters: JSON POST, 5 s timeout, no redirects, capped response size,
 * strict contract validation.
 */
export async function exchangeCode(config: IdentityConfig, code: string): Promise<ExchangeOutcome> {
  let response: Response;
  try {
    response = await fetch(`${config.identityBaseUrl}/api/sso/${config.applicationId}/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ code }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (response.status === 401) return { ok: false, reason: "invalid" };
  if (response.status === 403) return { ok: false, reason: "denied" };
  if (!response.ok) return { ok: false, reason: "unavailable" };

  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) return { ok: false, reason: "contract" };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "contract" };
  }
  const parsed = parseExchangeResponse(json, config.applicationId);
  return parsed.ok ? { ok: true, principal: parsed.value } : { ok: false, reason: "contract" };
}

import { NextResponse, type NextRequest } from "next/server";

import { isAdmitted } from "@/domain/auth/identityContract";
import { exchangeCode, isPlausibleCode } from "@/lib/auth/identityClient";
import { getAuthConfig } from "@/lib/auth/server";
import {
  cookieOptions,
  createSessionToken,
  pendingCookieName,
  readPending,
  SESSION_TTL_SECONDS,
  sessionCookieName,
} from "@/lib/auth/session";

/**
 * Identity redirects here with `?code=<one-time code>` (valid 60 s). The
 * code is exchanged server-side; the planner session is created only if the
 * Identity response passes the contract and grants access.
 */
export async function GET(request: NextRequest) {
  const config = getAuthConfig();
  if (config.mode !== "identity") return NextResponse.redirect(new URL("/planner", request.url));

  const fail = (reason: string) => {
    const response = NextResponse.redirect(`${config.publicOrigin}/auth/error?reason=${reason}`);
    response.cookies.delete(pendingCookieName(config));
    response.headers.set("cache-control", "no-store");
    return response;
  };

  // The flow must have been started from this browser (see docs/IDENTITY_INTEGRATION.md).
  const pending = await readPending(config, request.cookies.get(pendingCookieName(config))?.value);
  if (!pending) return fail("expired");

  const code = request.nextUrl.searchParams.get("code");
  if (!isPlausibleCode(code)) return fail("invalid");

  const outcome = await exchangeCode(config, code);
  if (!outcome.ok) return fail(outcome.reason);
  if (!isAdmitted(outcome.principal)) return fail("denied");

  const response = NextResponse.redirect(`${config.publicOrigin}${pending.next}`);
  response.cookies.delete(pendingCookieName(config));
  response.cookies.set(sessionCookieName(config), await createSessionToken(config, outcome.principal), cookieOptions(config, SESSION_TTL_SECONDS));
  response.headers.set("cache-control", "no-store");
  return response;
}

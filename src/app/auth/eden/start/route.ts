import { NextResponse, type NextRequest } from "next/server";

import { hostnameFromHostHeader, isLoopbackHost } from "@/config/auth";
import { safeNextPath } from "@/domain/auth/identityContract";
import { getAuthConfig } from "@/lib/auth/server";
import { cookieOptions, createPendingToken, PENDING_TTL_SECONDS, pendingCookieName } from "@/lib/auth/session";

/** Starts E:DEN Identity SSO: remembers the destination, then sends the browser to /entry/<app>. */
export async function GET(request: NextRequest) {
  const config = getAuthConfig();
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));

  if (config.mode === "local-dev") {
    // No sign-in offline; non-loopback requests are refused rather than redirected in a loop.
    if (!isLoopbackHost(hostnameFromHostHeader(request.headers.get("host")))) {
      return new NextResponse("Local development mode: loopback only", { status: 403 });
    }
    return NextResponse.redirect(new URL(next, request.url));
  }
  if (config.mode === "misconfigured") return NextResponse.redirect(new URL("/auth/error?reason=misconfigured", request.url));

  const response = NextResponse.redirect(`${config.identityBaseUrl}/entry/${config.applicationId}`);
  response.cookies.set(pendingCookieName(config), await createPendingToken(config, next), cookieOptions(config, PENDING_TTL_SECONDS));
  response.headers.set("cache-control", "no-store");
  return response;
}

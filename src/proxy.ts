import { NextResponse, type NextRequest } from "next/server";

import { hostnameFromHostHeader, isLoopbackHost, resolveAuthConfig, type AuthConfig } from "@/config/auth";
import { parseServerEnv } from "@/config/env.schema";
import { readSession, sessionCookieName } from "@/lib/auth/session";

/**
 * First gate on every protected request. Pages and route handlers verify the
 * session again (defence in depth); this layer only avoids rendering
 * anything for anonymous requests.
 */
export async function proxy(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  const deny = (status: number, message: string) =>
    isApi
      ? NextResponse.json({ error: { kind: status === 401 ? "unauthenticated" : "forbidden", message, issues: [] } }, { status })
      : new NextResponse(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

  let config: AuthConfig;
  try {
    config = resolveAuthConfig(parseServerEnv(process.env), process.env.NODE_ENV);
  } catch {
    return deny(503, "Planner configuration is invalid");
  }

  if (config.mode === "misconfigured") return deny(503, "Planner authentication is not configured");

  if (config.mode === "local-dev") {
    // Use the Host header of the request (nextUrl reflects the server's own bind address).
    const hostname = hostnameFromHostHeader(request.headers.get("host"));
    return isLoopbackHost(hostname) ? NextResponse.next() : deny(403, "Local development mode: loopback only");
  }

  const principal = await readSession(config, request.cookies.get(sessionCookieName(config))?.value);
  if (principal) return NextResponse.next();
  if (isApi) return deny(401, "Sign in with E:DEN Identity");

  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  return NextResponse.redirect(`${config.publicOrigin}/auth/eden/start?next=${encodeURIComponent(next)}`);
}

export const config = {
  // Everything except auth endpoints, health probes and static assets.
  matcher: ["/((?!auth/|healthz|readyz|_next/static|_next/image|favicon.ico).*)"],
};

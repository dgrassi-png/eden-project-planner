import { NextResponse, type NextRequest } from "next/server";

import { getAuthConfig } from "@/lib/auth/server";
import { sessionCookieName } from "@/lib/auth/session";

/**
 * Ends the planner session (local logout, as Budget and Natura do). The
 * E:DEN Identity session is managed by the Identity portal.
 */
export async function POST(request: NextRequest) {
  const config = getAuthConfig();
  const base = config.mode === "identity" ? config.publicOrigin : request.nextUrl.origin;
  const origin = request.headers.get("origin");
  if (origin && origin !== base) return new NextResponse("Cross-origin request rejected", { status: 403 });

  const response = NextResponse.redirect(`${base}/auth/signed-out`, 303);
  if (config.mode === "identity") response.cookies.delete(sessionCookieName(config));
  return response;
}

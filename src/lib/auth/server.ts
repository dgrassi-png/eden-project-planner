import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { hostnameFromHostHeader, isLoopbackHost, resolveAuthConfig, type AuthConfig } from "@/config/auth";
import { getServerEnv } from "@/config/env.server";

import { LOCAL_DEV_PRINCIPAL, readSession, sessionCookieName, type Principal } from "./session";

export function getAuthConfig(): AuthConfig {
  return resolveAuthConfig(getServerEnv(), process.env.NODE_ENV);
}

/**
 * Principal of the current request, or null. Verified on every request
 * (defence in depth: the proxy's check is only a first gate).
 */
export async function getCurrentPrincipal(): Promise<Principal | null> {
  const config = getAuthConfig();
  if (config.mode === "misconfigured") return null;
  if (config.mode === "local-dev") {
    const host = hostnameFromHostHeader((await headers()).get("host"));
    return isLoopbackHost(host) ? LOCAL_DEV_PRINCIPAL : null;
  }
  const token = (await cookies()).get(sessionCookieName(config))?.value;
  return readSession(config, token);
}

/** For pages: the principal, or a redirect to sign-in. */
export async function requirePagePrincipal(nextPath: string): Promise<Principal> {
  const principal = await getCurrentPrincipal();
  if (!principal) redirect(`/auth/eden/start?next=${encodeURIComponent(nextPath)}`);
  return principal;
}

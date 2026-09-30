import type { ServerEnv } from "./env.schema";

/**
 * Authentication mode, resolved from configuration. Pure, so it can be used
 * from the proxy and tested.
 *
 * - identity: E:DEN Identity SSO (auth.e-den.tech). Mandatory online.
 * - local-dev: no login, loopback requests only (offline development).
 * - misconfigured: fail closed; every protected request is refused.
 *
 * There is deliberately no local username/password login: Identity is the
 * only source of truth for internal access (manual Rev.09, ADR-R09-01).
 */
export type AuthConfig =
  | {
      mode: "identity";
      identityBaseUrl: string;
      applicationId: string;
      publicOrigin: string;
      sessionSecret: string;
      /** False only for loopback test setups over plain http. */
      secureCookies: boolean;
    }
  | { mode: "local-dev" }
  | { mode: "misconfigured"; problems: string[] };

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/** Hostname from a Host header value (`name:port`, `[v6]:port`); "" when absent/malformed. */
export function hostnameFromHostHeader(host: string | null | undefined): string {
  if (!host) return "";
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end > 0 ? host.slice(0, end + 1) : "";
  }
  return host.split(":")[0] ?? "";
}

/** https origin with no path/query/fragment/credentials; http allowed only on loopback. */
function checkOrigin(value: string | undefined, name: string, problems: string[]): URL | null {
  if (!value) {
    problems.push(`${name} is required`);
    return null;
  }
  const url = new URL(value);
  const pathOk = url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
  const schemeOk = url.protocol === "https:" || (url.protocol === "http:" && isLoopbackHost(url.hostname));
  if (!pathOk || !schemeOk) {
    problems.push(`${name} must be an https origin without path`);
    return null;
  }
  return url;
}

export function resolveAuthConfig(env: ServerEnv, nodeEnv: string | undefined): AuthConfig {
  const requested = env.PLANNER_AUTH_MODE ?? (env.EDEN_IDENTITY_BASE_URL ? "identity" : undefined);

  if (requested === "local-dev" || (requested === undefined && nodeEnv !== "production")) {
    return { mode: "local-dev" };
  }
  if (requested === undefined) {
    return { mode: "misconfigured", problems: ["PLANNER_AUTH_MODE / EDEN_IDENTITY_BASE_URL not set"] };
  }

  const problems: string[] = [];
  const identity = checkOrigin(env.EDEN_IDENTITY_BASE_URL, "EDEN_IDENTITY_BASE_URL", problems);
  const publicUrl = checkOrigin(env.PLANNER_PUBLIC_URL, "PLANNER_PUBLIC_URL", problems);
  if (!env.PLANNER_SESSION_SECRET) problems.push("PLANNER_SESSION_SECRET (>= 32 chars) is required");
  if (!identity || !publicUrl || !env.PLANNER_SESSION_SECRET) return { mode: "misconfigured", problems };

  return {
    mode: "identity",
    identityBaseUrl: identity.origin,
    applicationId: env.EDEN_IDENTITY_APP_ID,
    publicOrigin: publicUrl.origin,
    sessionSecret: env.PLANNER_SESSION_SECRET,
    secureCookies: publicUrl.protocol === "https:",
  };
}

/**
 * True for requests the Next.js router makes in the background (prefetch or
 * RSC payload fetches). These must never start a sign-in: each one would ask
 * Identity for a new one-time code.
 */
export function isBackgroundRequest(headers: Headers, searchParams: URLSearchParams): boolean {
  return (
    headers.get("next-router-prefetch") === "1" ||
    headers.get("purpose") === "prefetch" ||
    headers.get("sec-purpose")?.includes("prefetch") === true ||
    headers.get("rsc") === "1" ||
    searchParams.has("_rsc")
  );
}

import type { AuthConfig } from "@/config/auth";
import type { Actor } from "@/lib/supabase/admin";

import { signToken, verifyToken, type TokenClaims } from "./token";

/** Planner session: its own cookie, independent from the Identity session. */

export const SESSION_TTL_SECONDS = 8 * 60 * 60; // aligned with the Identity session (8 h)
export const PENDING_TTL_SECONDS = 10 * 60;

type IdentityConfig = Extract<AuthConfig, { mode: "identity" }>;

/** `__Host-` prefix (Secure, Path=/, no Domain) whenever cookies are Secure. */
export function sessionCookieName(config: IdentityConfig): string {
  return config.secureCookies ? "__Host-planner_session" : "planner_session";
}

export function pendingCookieName(config: IdentityConfig): string {
  return config.secureCookies ? "__Host-planner_sso" : "planner_sso";
}

export function cookieOptions(config: IdentityConfig, maxAge: number) {
  return { httpOnly: true, secure: config.secureCookies, sameSite: "lax" as const, path: "/", maxAge };
}

export interface SessionClaims extends TokenClaims {
  typ: "session";
  sub: string; // eden_user_id
  email: string;
  pfa: boolean; // platform_full_access at login time
  iat: number;
}

export interface PendingClaims extends TokenClaims {
  typ: "sso-pending";
  nonce: string;
  next: string;
}

export interface Principal {
  edenUserId: string;
  email: string | null;
  platformFullAccess: boolean;
  mode: "identity" | "local-dev";
}

export const LOCAL_DEV_PRINCIPAL: Principal = {
  edenUserId: "local-dev",
  email: null,
  platformFullAccess: false,
  mode: "local-dev",
};

export function actorFor(principal: Principal): Actor {
  return { type: "USER", id: principal.edenUserId };
}

const now = () => Math.floor(Date.now() / 1000);

export async function createSessionToken(
  config: IdentityConfig,
  identity: { edenUserId: string; email: string; platformFullAccess: boolean },
): Promise<string> {
  const iat = now();
  return signToken<SessionClaims>(
    { typ: "session", sub: identity.edenUserId, email: identity.email, pfa: identity.platformFullAccess, iat, exp: iat + SESSION_TTL_SECONDS },
    config.sessionSecret,
  );
}

export async function readSession(config: IdentityConfig, token: string | undefined): Promise<Principal | null> {
  const claims = await verifyToken<SessionClaims>(token, config.sessionSecret, "session");
  if (!claims || typeof claims.sub !== "string" || typeof claims.email !== "string" || typeof claims.pfa !== "boolean") return null;
  return { edenUserId: claims.sub, email: claims.email, platformFullAccess: claims.pfa, mode: "identity" };
}

export async function createPendingToken(config: IdentityConfig, next: string): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return signToken<PendingClaims>({ typ: "sso-pending", nonce, next, exp: now() + PENDING_TTL_SECONDS }, config.sessionSecret);
}

export async function readPending(config: IdentityConfig, token: string | undefined): Promise<PendingClaims | null> {
  const claims = await verifyToken<PendingClaims>(token, config.sessionSecret, "sso-pending");
  return claims && typeof claims.next === "string" && typeof claims.nonce === "string" ? claims : null;
}

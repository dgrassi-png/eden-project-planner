import { z } from "zod";

/**
 * Environment schemas.
 *
 * Pure module (no `server-only`, no `process.env` access) so it can be unit
 * tested. Every integration is optional during V0 bootstrap: the app must run
 * with nothing configured, and integration status is surfaced in the UI
 * instead of crashing. Malformed values (as opposed to missing ones) fail
 * loudly so misconfiguration is caught early.
 */

/** Treat unset and empty-string variables identically (`.env.example` ships empty values). */
const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.url().optional(),
);

/**
 * Safety-critical flag: only the literal string "false" disables approval.
 * Anything else that is not "true" is rejected rather than silently coerced.
 */
const approvalFlag = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
);

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), z.enum(values).optional());

/**
 * All configuration is server-side. Nothing is exposed to the browser: the
 * database is reached only by the Next.js server, and sign-in
 * goes through E:DEN Identity, so no `NEXT_PUBLIC_*` variable is needed.
 * The database is a local SQLite file owned by the planner (like Budget and
 * Natura), so there is no database credential.
 */
export const serverEnvSchema = z.object({
  /**
   * Planner-owned SQLite database file (absolute path), e.g.
   * /var/lib/eden/planner-production/planner.sqlite3. Required in production.
   */
  PLANNER_DATABASE_PATH: optionalString,
  /** "identity" (E:DEN SSO, required online) or "local-dev" (loopback only, no login). */
  PLANNER_AUTH_MODE: optionalEnum(["identity", "local-dev"] as const),
  /** E:DEN Identity origin, e.g. https://auth.e-den.tech (no path). */
  EDEN_IDENTITY_BASE_URL: optionalUrl,
  /** Application id registered in Identity (`/entry/<id>`). */
  EDEN_IDENTITY_APP_ID: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().regex(/^[a-z][a-z0-9-]{1,31}$/).default("planner"),
  ),
  /** Public origin of this planner, e.g. https://planner.e-den.tech. */
  PLANNER_PUBLIC_URL: optionalUrl,
  /** HMAC key for planner session cookies (>= 32 characters, random). */
  PLANNER_SESSION_SECRET: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(32).optional(),
  ),
  TRELLO_API_KEY: optionalString,
  TRELLO_API_TOKEN: optionalString,
  /** Board id or short link, e.g. 9n93W4ym for https://trello.com/b/9n93W4ym/eden. */
  TRELLO_BOARD_ID: optionalString,
  /** Test/offline override of the Trello API origin. Refused in production. */
  TRELLO_API_BASE_URL: optionalUrl,
  OPENAI_API_KEY: optionalString,
  /** OpenAI model for server-side drafting (required to enable it; no default is guessed). */
  OPENAI_MODEL: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  /** Anthropic model for server-side drafting. */
  ANTHROPIC_MODEL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().min(1).default("claude-opus-5-5"),
  ),
  /**
   * SHA-256 hashes of agent API tokens: `CLAUDE:<hex>,CHATGPT:<hex>,ASSISTANT:<hex>`
   * (scripts/agent-token.mjs). Agents may read context and submit proposals only.
   */
  PLANNER_AGENT_TOKENS: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z
      .string()
      .regex(/^\s*(CLAUDE|CHATGPT|ASSISTANT):[0-9a-f]{64}\s*(,\s*(CLAUDE|CHATGPT|ASSISTANT):[0-9a-f]{64}\s*)*$/)
      .optional(),
  ),
  AI_MUTATIONS_REQUIRE_APPROVAL: approvalFlag,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly invalidKeys: string[]) {
    // Only variable names are reported, never values.
    super(`Invalid environment variables: ${invalidKeys.join(", ")}`);
    this.name = "EnvValidationError";
  }
}

function parseWith<T extends z.ZodType>(schema: T, source: Record<string, unknown>): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "unknown")))];
    throw new EnvValidationError(keys);
  }
  return result.data;
}

export function parseServerEnv(source: Record<string, unknown>): ServerEnv {
  return parseWith(serverEnvSchema, source);
}

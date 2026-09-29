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

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  NEXT_PUBLIC_APP_URL: optionalUrl,
});

export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  TRELLO_API_KEY: optionalString,
  TRELLO_API_TOKEN: optionalString,
  TRELLO_BOARD_ID: optionalString,
  OPENAI_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  AI_MUTATIONS_REQUIRE_APPROVAL: approvalFlag,
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
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

export function parsePublicEnv(source: Record<string, unknown>): PublicEnv {
  return parseWith(publicEnvSchema, source);
}

export function parseServerEnv(source: Record<string, unknown>): ServerEnv {
  return parseWith(serverEnvSchema, source);
}

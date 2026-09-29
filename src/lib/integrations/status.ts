import type { ServerEnv } from "@/config/env.schema";

/**
 * Integration status derived from configuration.
 *
 * Output contains only variable NAMES and booleans — never values — so it is
 * safe to render in the browser.
 */

export type IntegrationState = "configured" | "partial" | "not_configured";

export interface IntegrationCheck {
  envVar: string;
  present: boolean;
  /** Whether the variable is exposed to the browser bundle. */
  public: boolean;
}

export interface IntegrationStatus {
  id: "supabase" | "trello" | "ai";
  name: string;
  state: IntegrationState;
  required: boolean;
  checks: IntegrationCheck[];
}

type SecretKey = Exclude<keyof ServerEnv, "AI_MUTATIONS_REQUIRE_APPROVAL">;

function check(env: ServerEnv, envVar: SecretKey): IntegrationCheck {
  return { envVar, present: env[envVar] !== undefined, public: envVar.startsWith("NEXT_PUBLIC_") };
}

function stateOf(checks: IntegrationCheck[], mode: "all" | "any"): IntegrationState {
  const present = checks.filter((c) => c.present).length;
  if (present === 0) return "not_configured";
  if (mode === "any" || present === checks.length) return "configured";
  return "partial";
}

export function getIntegrationStatuses(env: ServerEnv): IntegrationStatus[] {
  const supabase = [
    check(env, "NEXT_PUBLIC_SUPABASE_URL"),
    check(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    check(env, "SUPABASE_SERVICE_ROLE_KEY"),
  ];
  const trello = [
    check(env, "TRELLO_API_KEY"),
    check(env, "TRELLO_API_TOKEN"),
    check(env, "TRELLO_BOARD_ID"),
  ];
  // AI providers are independent and optional: any one is enough.
  const ai = [check(env, "OPENAI_API_KEY"), check(env, "ANTHROPIC_API_KEY")];

  return [
    { id: "supabase", name: "Supabase", state: stateOf(supabase, "all"), required: true, checks: supabase },
    { id: "trello", name: "Trello", state: stateOf(trello, "all"), required: false, checks: trello },
    { id: "ai", name: "AI providers", state: stateOf(ai, "any"), required: false, checks: ai },
  ];
}

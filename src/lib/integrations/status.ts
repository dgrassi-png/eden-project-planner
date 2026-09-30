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
}

export interface IntegrationStatus {
  id: "identity" | "database" | "trello" | "ai";
  name: string;
  state: IntegrationState;
  required: boolean;
  checks: IntegrationCheck[];
}

type SecretKey = Exclude<keyof ServerEnv, "AI_MUTATIONS_REQUIRE_APPROVAL" | "PLANNER_AUTH_MODE" | "EDEN_IDENTITY_APP_ID">;

function check(env: ServerEnv, envVar: SecretKey): IntegrationCheck {
  return { envVar, present: env[envVar] !== undefined };
}

function stateOf(checks: IntegrationCheck[], mode: "all" | "any"): IntegrationState {
  const present = checks.filter((c) => c.present).length;
  if (present === 0) return "not_configured";
  if (mode === "any" || present === checks.length) return "configured";
  return "partial";
}

export function getIntegrationStatuses(env: ServerEnv): IntegrationStatus[] {
  const identity = [
    check(env, "EDEN_IDENTITY_BASE_URL"),
    check(env, "PLANNER_PUBLIC_URL"),
    check(env, "PLANNER_SESSION_SECRET"),
  ];
  const database = [check(env, "PLANNER_DATABASE_PATH")];
  const trello = [
    check(env, "TRELLO_API_KEY"),
    check(env, "TRELLO_API_TOKEN"),
    check(env, "TRELLO_BOARD_ID"),
  ];
  // AI providers are independent and optional: any one is enough.
  const ai = [check(env, "OPENAI_API_KEY"), check(env, "ANTHROPIC_API_KEY")];

  return [
    { id: "identity", name: "E:DEN Identity (SSO)", state: stateOf(identity, "all"), required: true, checks: identity },
    { id: "database", name: "Planner database (SQLite)", state: stateOf(database, "all"), required: true, checks: database },
    { id: "trello", name: "Trello", state: stateOf(trello, "all"), required: false, checks: trello },
    { id: "ai", name: "AI providers", state: stateOf(ai, "any"), required: false, checks: ai },
  ];
}

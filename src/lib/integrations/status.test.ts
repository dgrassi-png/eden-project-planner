import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/config/env.schema";

import { getIntegrationStatuses } from "./status";

describe("getIntegrationStatuses", () => {
  it("reports everything as not configured on an empty environment", () => {
    const statuses = getIntegrationStatuses(parseServerEnv({}));
    expect(statuses.map((s) => [s.id, s.state])).toEqual([
      ["identity", "not_configured"],
      ["database", "not_configured"],
      ["trello", "not_configured"],
      ["ai", "not_configured"],
    ]);
  });

  it("distinguishes partial configuration", () => {
    const statuses = getIntegrationStatuses(parseServerEnv({ TRELLO_API_KEY: "k" }));
    expect(statuses.find((s) => s.id === "trello")?.state).toBe("partial");
  });

  it("treats a single AI provider as configured", () => {
    const statuses = getIntegrationStatuses(parseServerEnv({ ANTHROPIC_API_KEY: "k" }));
    expect(statuses.find((s) => s.id === "ai")?.state).toBe("configured");
  });

  it("never includes secret values in its output", () => {
    const secret = "tok_very_secret_value";
    const env = parseServerEnv({
      PLANNER_DATABASE_PATH: "/var/lib/eden/secret-location/planner.sqlite3",
      PLANNER_SESSION_SECRET: `${secret}${secret}`,
      EDEN_IDENTITY_BASE_URL: "https://auth.example.test",
      TRELLO_API_KEY: secret,
      TRELLO_API_TOKEN: secret,
      TRELLO_BOARD_ID: secret,
      OPENAI_API_KEY: secret,
    });
    const serialized = JSON.stringify(getIntegrationStatuses(env));
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("secret-location");
    expect(serialized).not.toContain("auth.example.test");
  });
});

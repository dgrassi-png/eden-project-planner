import { describe, expect, it } from "vitest";

import { EnvValidationError, parseServerEnv } from "./env.schema";

describe("parseServerEnv", () => {
  it("accepts an empty environment (all integrations optional)", () => {
    const env = parseServerEnv({});
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(env.TRELLO_API_TOKEN).toBeUndefined();
  });

  it("treats empty strings as unset, like .env.example", () => {
    const env = parseServerEnv({ TRELLO_API_KEY: "", NEXT_PUBLIC_SUPABASE_URL: "  " });
    expect(env.TRELLO_API_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
  });

  it("requires AI approval by default", () => {
    expect(parseServerEnv({}).AI_MUTATIONS_REQUIRE_APPROVAL).toBe(true);
    expect(parseServerEnv({ AI_MUTATIONS_REQUIRE_APPROVAL: "" }).AI_MUTATIONS_REQUIRE_APPROVAL).toBe(true);
  });

  it("only disables approval with the literal 'false'", () => {
    expect(parseServerEnv({ AI_MUTATIONS_REQUIRE_APPROVAL: "false" }).AI_MUTATIONS_REQUIRE_APPROVAL).toBe(false);
    expect(() => parseServerEnv({ AI_MUTATIONS_REQUIRE_APPROVAL: "no" })).toThrow(EnvValidationError);
  });

  it("rejects malformed URLs and reports only variable names", () => {
    try {
      parseServerEnv({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url", SUPABASE_SERVICE_ROLE_KEY: "super-secret" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).invalidKeys).toEqual(["NEXT_PUBLIC_SUPABASE_URL"]);
      expect((error as Error).message).not.toContain("not-a-url");
    }
  });
});

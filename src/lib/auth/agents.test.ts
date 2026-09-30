import { describe, expect, it } from "vitest";

import { hashAgentToken, isAgentPath, parseAgentTokens, verifyAgentToken } from "./agents";

const token = "t".repeat(43);
const configured = parseAgentTokens(`CLAUDE:${hashAgentToken(token).toString("hex")}`);

describe("agent tokens", () => {
  it("accepts only a configured token and names the agent", () => {
    expect(verifyAgentToken(`Bearer ${token}`, configured)).toEqual({ kind: "agent", agent: "CLAUDE" });
    expect(verifyAgentToken(`Bearer ${"x".repeat(43)}`, configured)).toBeNull();
    expect(verifyAgentToken(token, configured)).toBeNull();
    expect(verifyAgentToken(`Bearer ${token}`, [])).toBeNull();
  });

  it("rejects malformed configuration instead of ignoring it", () => {
    expect(() => parseAgentTokens("CLAUDE:plaintext")).toThrow(/NAME:<sha256 hex>/);
    expect(() => parseAgentTokens(`ROOT:${"0".repeat(64)}`)).toThrow();
  });

  it("limits agents to the context and proposal endpoints", () => {
    const id = "3f5dbd36-567f-4ec6-8103-944ec9af21b2";
    expect(isAgentPath(`/api/projects/${id}/ai-context`)).toBe(true);
    expect(isAgentPath(`/api/change-proposals/${id}`)).toBe(true);
    expect(isAgentPath(`/api/change-proposals/${id}/apply`)).toBe(false);
    expect(isAgentPath(`/api/tasks/${id}`)).toBe(false);
  });
});

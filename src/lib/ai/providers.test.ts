import { describe, expect, it } from "vitest";

import { PROPOSAL_FORMAT, PROPOSAL_RULES, type AiContext } from "@/domain/proposals/context";

import { draftProposal, proposalJsonSchema, ProviderError } from "./providers";

const context = { rules: PROPOSAL_RULES, proposalFormat: PROPOSAL_FORMAT, tasks: [] } as unknown as AiContext;
const payload = { summary: "Delay", changes: [{ op: "update_task", task: "SC-001", set: { status: "WAITING_BLOCKED" } }] };

function fakeFetch(response: unknown, status = 200, seen: { url?: string; body?: Record<string, unknown>; headers?: Record<string, string> } = {}) {
  return (async (url: string, init: RequestInit) => {
    seen.url = url;
    seen.body = JSON.parse(String(init.body));
    seen.headers = init.headers as Record<string, string>;
    return new Response(JSON.stringify(response), { status });
  }) as unknown as typeof fetch;
}

describe("draftProposal", () => {
  it("asks Claude for a forced tool call and validates its input", async () => {
    const seen: Parameters<typeof fakeFetch>[2] = {};
    const result = await draftProposal({
      provider: "anthropic",
      apiKey: "k",
      model: "claude-opus-5-5",
      context,
      instruction: "Supplier delay",
      fetchImpl: fakeFetch({ content: [{ type: "tool_use", name: "submit_proposal", input: payload }] }, 200, seen),
    });
    expect(result).toEqual(payload);
    expect(seen.url).toBe("https://api.anthropic.com/v1/messages");
    expect(seen.headers?.["x-api-key"]).toBe("k");
    expect(seen.body?.tool_choice).toEqual({ type: "tool", name: "submit_proposal" });
  });

  it("parses the OpenAI JSON answer", async () => {
    const result = await draftProposal({
      provider: "openai",
      apiKey: "k",
      model: "configured-model",
      context,
      instruction: "x",
      fetchImpl: fakeFetch({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    });
    expect(result.changes).toHaveLength(1);
  });

  it("rejects output outside the schema and reports provider failures readably", async () => {
    const bad = { content: [{ type: "tool_use", name: "submit_proposal", input: { changes: [{ op: "delete_task", task: "SC-001" }] } }] };
    await expect(draftProposal({ provider: "anthropic", apiKey: "k", model: "m", context, instruction: "x", fetchImpl: fakeFetch(bad) })).rejects.toBeInstanceOf(ProviderError);
    await expect(draftProposal({ provider: "openai", apiKey: "k", model: "m", context, instruction: "x", fetchImpl: fakeFetch({}, 401) })).rejects.toThrow(/rejected the API key/);
  });

  it("publishes a JSON schema for the tool", () => {
    expect(proposalJsonSchema()).toMatchObject({ type: "object", required: ["changes"] });
  });
});

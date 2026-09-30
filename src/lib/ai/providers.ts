/**
 * Optional server-side drafting of a proposal by an AI provider. The planner
 * works without it: agents can also submit proposals directly with their API
 * token, and people can paste one. Output is untrusted and goes through the
 * same proposal schema and human review as any other proposal.
 */
import { z } from "zod";

import type { AiContext } from "@/domain/proposals/context";
import { proposalPayloadSchema, type ProposalPayload } from "@/domain/proposals/schema";

export type ProviderId = "anthropic" | "openai";

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

const TIMEOUT_MS = 90_000;

const SYSTEM = (context: AiContext) =>
  [
    "You help plan E:DEN projects. You never change the plan: you draft a structured change proposal that a person reviews.",
    ...context.rules.map((rule) => `- ${rule}`),
    "Only propose what the instruction asks for. If information is missing, leave the field out.",
    "Current project context (JSON):",
    JSON.stringify({ ...context, proposalFormat: undefined }),
  ].join("\n");

export function proposalJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(proposalPayloadSchema, { unrepresentable: "any" }) as Record<string, unknown>;
}

function parsePayload(value: unknown): ProposalPayload {
  const parsed = proposalPayloadSchema.safeParse(value);
  if (!parsed.success) throw new ProviderError("The AI returned a proposal that does not match the schema");
  return parsed.data;
}

async function post(fetchImpl: typeof fetch, url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
  } catch {
    throw new ProviderError("The AI provider could not be reached");
  }
  if (response.status === 401 || response.status === 403) throw new ProviderError("The AI provider rejected the API key");
  if (response.status === 429) throw new ProviderError("The AI provider rate limit was reached; try again later");
  if (!response.ok) throw new ProviderError(`The AI provider failed (HTTP ${response.status})`);
  try {
    return await response.json();
  } catch {
    throw new ProviderError("The AI provider returned an invalid response");
  }
}

const anthropicResponse = z.object({
  content: z.array(z.object({ type: z.string(), name: z.string().optional(), input: z.unknown().optional() })),
});

const openaiResponse = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

export async function draftProposal(options: {
  provider: ProviderId;
  apiKey: string;
  model: string;
  context: AiContext;
  instruction: string;
  fetchImpl?: typeof fetch;
}): Promise<ProposalPayload> {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (options.provider === "anthropic") {
    const json = await post(
      fetchImpl,
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": options.apiKey, "anthropic-version": "2023-06-01" },
      {
        model: options.model,
        max_tokens: 4_096,
        system: SYSTEM(options.context),
        tools: [
          {
            name: "submit_proposal",
            description: "Submit the structured change proposal for human review.",
            input_schema: proposalJsonSchema(),
          },
        ],
        tool_choice: { type: "tool", name: "submit_proposal" },
        messages: [{ role: "user", content: options.instruction }],
      },
    );
    const parsed = anthropicResponse.safeParse(json);
    const tool = parsed.success ? parsed.data.content.find((c) => c.type === "tool_use" && c.name === "submit_proposal") : undefined;
    if (!tool) throw new ProviderError("The AI did not return a proposal");
    return parsePayload(tool.input);
  }

  const json = await post(
    fetchImpl,
    "https://api.openai.com/v1/chat/completions",
    { authorization: `Bearer ${options.apiKey}` },
    {
      model: options.model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${SYSTEM(options.context)}\nAnswer with one JSON object matching this JSON Schema:\n${JSON.stringify(proposalJsonSchema())}`,
        },
        { role: "user", content: options.instruction },
      ],
    },
  );
  const parsed = openaiResponse.safeParse(json);
  const content = parsed.success ? parsed.data.choices[0]?.message.content : null;
  if (!content) throw new ProviderError("The AI did not return a proposal");
  let payload: unknown;
  try {
    payload = JSON.parse(content);
  } catch {
    throw new ProviderError("The AI returned invalid JSON");
  }
  return parsePayload(payload);
}

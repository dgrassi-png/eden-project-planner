import { createHash, timingSafeEqual } from "node:crypto";

/**
 * API tokens for AI agents (ChatGPT, Claude) and the Personal Assistant.
 *
 * The server stores only SHA-256 hashes (`PLANNER_AGENT_TOKENS`, e.g.
 * `CLAUDE:<hex>,CHATGPT:<hex>,ASSISTANT:<hex>`); tokens are generated with
 * `node scripts/agent-token.mjs <NAME>`. Agents can read the AI context and
 * submit or read proposals. They can never apply a proposal or change the
 * plan. ASSISTANT is read-only.
 */

export const AGENT_NAMES = ["CLAUDE", "CHATGPT", "ASSISTANT"] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

export interface AgentPrincipal {
  kind: "agent";
  agent: AgentName;
}

const ENTRY = /^(CLAUDE|CHATGPT|ASSISTANT):([0-9a-f]{64})$/;

export function parseAgentTokens(value: string | undefined): { agent: AgentName; hash: Buffer }[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = ENTRY.exec(entry);
      if (!match) throw new Error("PLANNER_AGENT_TOKENS entries must look like NAME:<sha256 hex>");
      return { agent: match[1] as AgentName, hash: Buffer.from(match[2] as string, "hex") };
    });
}

export const hashAgentToken = (token: string) => createHash("sha256").update(token, "utf8").digest();

/** Resolves `Authorization: Bearer <token>` against the configured hashes (constant-time compare). */
export function verifyAgentToken(authorization: string | null, configured: { agent: AgentName; hash: Buffer }[]): AgentPrincipal | null {
  const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(authorization ?? "");
  if (!match || configured.length === 0) return null;
  const digest = hashAgentToken(match[1] as string);
  let found: AgentName | null = null;
  for (const entry of configured) {
    if (timingSafeEqual(digest, entry.hash)) found = entry.agent;
  }
  return found ? { kind: "agent", agent: found } : null;
}

/** API paths an agent token may call (method-level checks happen in the route). */
export const AGENT_PATHS = [
  /^\/api\/projects$/,
  /^\/api\/projects\/[0-9a-f-]{36}\/ai-context$/,
  /^\/api\/projects\/[0-9a-f-]{36}\/change-proposals$/,
  /^\/api\/projects\/[0-9a-f-]{36}\/planning-constraints$/,
  /^\/api\/change-proposals\/[0-9a-f-]{36}$/,
];

export const isAgentPath = (pathname: string) => AGENT_PATHS.some((pattern) => pattern.test(pathname));

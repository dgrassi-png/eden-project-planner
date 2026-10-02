#!/usr/bin/env node
// Generates an API token for an AI agent or the Personal Assistant.
//
//   node scripts/agent-token.mjs CLAUDE
//
// Prints the token once (give it to the agent's secret store) and the
// PLANNER_AGENT_TOKENS entry (only the SHA-256 hash) for /etc/eden/planner-<env>.env.
import { createHash, randomBytes } from "node:crypto";

const name = process.argv[2];
if (!["CLAUDE", "CHATGPT", "ASSISTANT"].includes(name ?? "")) {
  console.error("usage: agent-token.mjs CLAUDE|CHATGPT|ASSISTANT");
  process.exit(1);
}
const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token, "utf8").digest("hex");
console.log(`token (show once, store as the agent's secret): ${token}`);
console.log(`env entry (append to PLANNER_AGENT_TOKENS, comma-separated): ${name}:${hash}`);

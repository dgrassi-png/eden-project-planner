import { PLANNING_TIME_ZONE } from "@/config/app";
import { getServerEnv } from "@/config/env.server";
import { todayInTimeZone } from "@/domain/timeline/dates";
import { apiRoute, parseId, readBody } from "@/lib/api/http";
import { draftProposalSchema } from "@/lib/api/schemas";
import { draftProposal, ProviderError } from "@/lib/ai/providers";
import { getProposalService } from "@/lib/ai/server";
import { PlanningError } from "@/lib/planning/errors";

/**
 * Asks Claude or ChatGPT (server-side key) to draft a proposal for an
 * instruction. The draft is stored as a PENDING proposal for review; nothing
 * is applied. 503 when the provider is not configured.
 */
export const POST = apiRoute<{ id: string }>(async ({ request, params, principal }) => {
  const projectId = parseId(params.id, "Project");
  const { provider, instruction } = await readBody(request, draftProposalSchema);
  const env = getServerEnv();
  const apiKey = provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  const model = provider === "anthropic" ? env.ANTHROPIC_MODEL : env.OPENAI_MODEL;
  if (!apiKey || !model) {
    throw new PlanningError("unavailable", provider === "anthropic" ? "ANTHROPIC_API_KEY is not configured" : "OPENAI_API_KEY and OPENAI_MODEL are not configured");
  }
  const service = getProposalService({ kind: "user", principal });
  const context = await service.context(projectId, todayInTimeZone(PLANNING_TIME_ZONE));
  try {
    const payload = await draftProposal({ provider, apiKey, model, context, instruction });
    return await service.submit(
      projectId,
      { source: provider === "anthropic" ? "CLAUDE" : "CHATGPT", reason: instruction, payload },
      principal.edenUserId,
    );
  } catch (error) {
    if (error instanceof ProviderError) throw new PlanningError("unavailable", error.message);
    throw error;
  }
}, 201);

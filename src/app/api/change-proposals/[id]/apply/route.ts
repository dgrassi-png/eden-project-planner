import { apiRoute, parseId, readBody } from "@/lib/api/http";
import { applyProposalSchema } from "@/lib/api/schemas";
import { getProposalService } from "@/lib/ai/server";

/**
 * Applies a reviewed proposal (people only, never agent tokens). The body
 * carries the fingerprint of the reviewed diff; 409 PROPOSAL_CHANGED if the
 * plan changed since the review.
 */
export const POST = apiRoute<{ id: string }>(async ({ request, params, principal }) => {
  const { fingerprint } = await readBody(request, applyProposalSchema);
  return getProposalService({ kind: "user", principal }).apply(parseId(params.id, "Proposal"), principal.edenUserId, fingerprint);
});

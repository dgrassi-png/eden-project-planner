import { apiRoute, parseId, readBody } from "@/lib/api/http";
import { rejectProposalSchema } from "@/lib/api/schemas";
import { getProposalService } from "@/lib/ai/server";

export const POST = apiRoute<{ id: string }>(async ({ request, params, principal }) => {
  const { note } = await readBody(request, rejectProposalSchema);
  return getProposalService({ kind: "user", principal }).reject(parseId(params.id, "Proposal"), principal.edenUserId, note ?? null);
});

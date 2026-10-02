import { callerRoute, parseId } from "@/lib/api/http";
import { getProposalService } from "@/lib/ai/server";

/** Proposal with its BEFORE → PROPOSED diff and dependency impact against the current plan. */
export const GET = callerRoute<{ id: string }>(({ params, caller }) => getProposalService(caller).review(parseId(params.id, "Proposal")), {
  agents: ["CLAUDE", "CHATGPT"],
});

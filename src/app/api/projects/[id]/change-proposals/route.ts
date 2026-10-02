import { callerRoute, parseId, readBody } from "@/lib/api/http";
import { submitProposalSchema } from "@/lib/api/schemas";
import { callerId, getProposalService } from "@/lib/ai/server";
import { PlanningError } from "@/lib/planning/errors";

const STATUSES = ["PENDING", "APPLIED", "REJECTED"] as const;

export const GET = callerRoute<{ id: string }>(
  ({ request, params, caller }) => {
    const status = new URL(request.url).searchParams.get("status");
    const filter = STATUSES.find((s) => s === status);
    return getProposalService(caller).list(parseId(params.id, "Project"), filter);
  },
  { agents: ["CLAUDE", "CHATGPT"] },
);

/** Submits a proposal. It changes nothing until a person applies it. */
export const POST = callerRoute<{ id: string }>(
  async ({ request, params, caller }) => {
    const body = await readBody(request, submitProposalSchema);
    const source = caller.kind === "agent" ? caller.agent : (body.source ?? "USER");
    if (caller.kind === "agent" && body.source && body.source !== caller.agent) {
      throw PlanningError.validation([{ code: "SOURCE_MISMATCH", message: `This token belongs to ${caller.agent}` }]);
    }
    if (source === "ASSISTANT") throw new PlanningError("validation", "The Personal Assistant is read-only");
    return getProposalService(caller).submit(
      parseId(params.id, "Project"),
      { source, reason: body.reason, payload: body.payload },
      callerId(caller),
    );
  },
  { agents: ["CLAUDE", "CHATGPT"] },
  201,
);

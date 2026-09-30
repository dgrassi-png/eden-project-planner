import { PLANNING_TIME_ZONE } from "@/config/app";
import { todayInTimeZone } from "@/domain/timeline/dates";
import { callerRoute, parseId } from "@/lib/api/http";
import { getProposalService } from "@/lib/ai/server";

/** Structured project context for AI assistants (codes and names, no ids of people, no emails). */
export const GET = callerRoute<{ id: string }>(
  ({ params, caller }) => getProposalService(caller).context(parseId(params.id, "Project"), todayInTimeZone(PLANNING_TIME_ZONE)),
  { agents: ["CLAUDE", "CHATGPT", "ASSISTANT"] },
);

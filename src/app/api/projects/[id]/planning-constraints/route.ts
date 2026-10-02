import { actorOfCaller, callerRoute, parseId } from "@/lib/api/http";
import { getPlanningService } from "@/lib/planning/server";

/**
 * Planning constraints for the Personal Assistant (owner, duration, deadline,
 * priority, geography, splittable, dependencies, status). `?owner=<name>` filters.
 */
export const GET = callerRoute<{ id: string }>(
  ({ request, params, caller }) => {
    const owner = new URL(request.url).searchParams.get("owner") ?? undefined;
    return getPlanningService(actorOfCaller(caller)).planningConstraints(parseId(params.id, "Project"), owner?.slice(0, 120));
  },
  { agents: ["ASSISTANT", "CLAUDE", "CHATGPT"] },
);

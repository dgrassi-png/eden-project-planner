import { actorOfCaller, callerRoute, planningRoute, readBody } from "@/lib/api/http";
import { createProjectSchema } from "@/lib/api/schemas";
import { getPlanningService } from "@/lib/planning/server";

/** Projects (agents may list them to find the project id). */
export const GET = callerRoute(({ caller }) => getPlanningService(actorOfCaller(caller)).listProjects(), {
  agents: ["CLAUDE", "CHATGPT", "ASSISTANT"],
});

export const POST = planningRoute(
  async ({ request, service }) => service.createProject(await readBody(request, createProjectSchema)),
  201,
);

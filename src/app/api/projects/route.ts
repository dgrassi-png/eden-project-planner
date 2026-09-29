import { planningRoute, readBody } from "@/lib/api/http";
import { createProjectSchema } from "@/lib/api/schemas";

export const GET = planningRoute(({ service }) => service.listProjects());

export const POST = planningRoute(
  async ({ request, service }) => service.createProject(await readBody(request, createProjectSchema)),
  201,
);

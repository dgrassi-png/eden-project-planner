import { parseId, planningRoute, readBody } from "@/lib/api/http";
import { createTaskSchema } from "@/lib/api/schemas";

export const GET = planningRoute<{ id: string }>(({ params, service }) => service.listTasks(parseId(params.id, "Project")));

export const POST = planningRoute<{ id: string }>(
  async ({ request, params, service }) =>
    service.createTask(parseId(params.id, "Project"), await readBody(request, createTaskSchema)),
  201,
);

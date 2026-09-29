import { parseId, planningRoute, readTaskPatch } from "@/lib/api/http";
import { IMMUTABLE_TASK_FIELDS, updateTaskSchema } from "@/lib/api/schemas";

export const GET = planningRoute<{ id: string }>(({ params, service }) => service.getTask(parseId(params.id, "Task")));

export const PATCH = planningRoute<{ id: string }>(async ({ request, params, service }) => {
  const { expectedUpdatedAt, ...patch } = await readTaskPatch(request, updateTaskSchema, IMMUTABLE_TASK_FIELDS);
  return service.updateTask(parseId(params.id, "Task"), patch, expectedUpdatedAt);
});

export const DELETE = planningRoute<{ id: string }>(async ({ params, service }) => {
  await service.deleteTask(parseId(params.id, "Task"));
});

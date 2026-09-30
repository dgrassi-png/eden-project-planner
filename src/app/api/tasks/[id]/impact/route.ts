import { parseId, planningRoute, readTaskPatch } from "@/lib/api/http";
import { IMMUTABLE_TASK_FIELDS, taskImpactSchema } from "@/lib/api/schemas";

/** Dependency impact of a proposed task change (conflicts created/resolved, cascade plan). Saves nothing. */
export const POST = planningRoute<{ id: string }>(async ({ request, params, service }) =>
  service.previewTaskUpdate(parseId(params.id, "Task"), await readTaskPatch(request, taskImpactSchema, IMMUTABLE_TASK_FIELDS)),
);

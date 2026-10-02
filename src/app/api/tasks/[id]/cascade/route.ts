import { parseId, planningRoute, readBody } from "@/lib/api/http";
import { cascadeConfirmationSchema } from "@/lib/api/schemas";

/** Cascade plan that would resolve the conflicts downstream of the task (forward only; DONE tasks never move). */
export const GET = planningRoute<{ id: string }>(({ params, service }) => service.previewCascade(parseId(params.id, "Task")));

/** Applies the reviewed cascade. Refused (409 CASCADE_CHANGED) if the plan differs from the confirmed moves. */
export const POST = planningRoute<{ id: string }>(async ({ request, params, service }) =>
  service.applyCascade(parseId(params.id, "Task"), await readBody(request, cascadeConfirmationSchema)),
);

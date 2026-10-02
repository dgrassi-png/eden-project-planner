import { parseId, planningRoute, readBody } from "@/lib/api/http";
import { updateWorkstreamSchema } from "@/lib/api/schemas";

export const PATCH = planningRoute<{ id: string }>(async ({ request, params, service }) =>
  service.updateWorkstream(parseId(params.id, "Workstream"), await readBody(request, updateWorkstreamSchema)),
);

export const DELETE = planningRoute<{ id: string }>(async ({ params, service }) => {
  await service.deleteWorkstream(parseId(params.id, "Workstream"));
});

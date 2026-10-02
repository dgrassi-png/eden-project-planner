import { parseId, planningRoute, readBody } from "@/lib/api/http";
import { updateDependencySchema } from "@/lib/api/schemas";

export const PATCH = planningRoute<{ id: string }>(async ({ request, params, service }) =>
  service.updateDependency(parseId(params.id, "Dependency"), await readBody(request, updateDependencySchema)),
);

export const DELETE = planningRoute<{ id: string }>(async ({ params, service }) => {
  await service.deleteDependency(parseId(params.id, "Dependency"));
});

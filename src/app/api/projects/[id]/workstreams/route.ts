import { parseId, planningRoute, readBody } from "@/lib/api/http";
import { createWorkstreamSchema } from "@/lib/api/schemas";

export const GET = planningRoute<{ id: string }>(({ params, service }) =>
  service.listWorkstreams(parseId(params.id, "Project")),
);

export const POST = planningRoute<{ id: string }>(
  async ({ request, params, service }) =>
    service.createWorkstream(parseId(params.id, "Project"), await readBody(request, createWorkstreamSchema)),
  201,
);

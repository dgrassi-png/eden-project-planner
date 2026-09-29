import { parseId, planningRoute, readBody } from "@/lib/api/http";
import { createMemberSchema } from "@/lib/api/schemas";

export const GET = planningRoute<{ id: string }>(({ params, service }) => service.listMembers(parseId(params.id, "Project")));

export const POST = planningRoute<{ id: string }>(
  async ({ request, params, service }) =>
    service.createMember(parseId(params.id, "Project"), await readBody(request, createMemberSchema)),
  201,
);

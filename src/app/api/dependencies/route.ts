import { planningRoute, readBody } from "@/lib/api/http";
import { createDependencySchema } from "@/lib/api/schemas";

/** Finish-to-Start dependency: successor starts after predecessor finish + lag working days. */
export const POST = planningRoute(
  async ({ request, service }) => service.createDependency(await readBody(request, createDependencySchema)),
  201,
);

import { parseId, planningRoute } from "@/lib/api/http";

/** Finish-to-Start checks of every dependency (ok / violated / unknown / inactive). */
export const GET = planningRoute<{ id: string }>(({ params, service }) => service.scheduleChecks(parseId(params.id, "Project")));

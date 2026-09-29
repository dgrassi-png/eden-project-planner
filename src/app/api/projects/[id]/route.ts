import { parseId, planningRoute } from "@/lib/api/http";

/** Full planning snapshot: project, workstreams, members, tasks, dependencies. */
export const GET = planningRoute<{ id: string }>(({ params, service }) => service.getSnapshot(parseId(params.id, "Project")));

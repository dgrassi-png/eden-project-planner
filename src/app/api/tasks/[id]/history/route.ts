import { parseId, planningRoute } from "@/lib/api/http";

/** Recent changes of one task (audit events), newest first. */
export const GET = planningRoute<{ id: string }>(({ params, service }) => service.taskHistory(parseId(params.id, "Task")));

import { parseId, planningRoute } from "@/lib/api/http";

/** Project change history (audit events), newest first. `?since=<ISO>&limit=<n>` */
export const GET = planningRoute<{ id: string }>(({ request, params, service }) => {
  const query = new URL(request.url).searchParams;
  const since = query.get("since");
  const limit = Number(query.get("limit") ?? 200);
  return service.history(parseId(params.id, "Project"), {
    since: since && /^\d{4}-\d{2}-\d{2}/.test(since) ? since : undefined,
    limit: Number.isInteger(limit) && limit > 0 ? limit : 200,
  });
});

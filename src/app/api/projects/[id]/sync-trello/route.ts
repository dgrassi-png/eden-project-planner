import { apiRoute, parseId, readBody } from "@/lib/api/http";
import { syncConfirmationSchema } from "@/lib/api/schemas";
import { getTrelloService } from "@/lib/trello/server";

/**
 * Runs the confirmed project sync (Planner → Trello only). The body repeats
 * the dry-run items; the server refuses with 409 SYNC_PLAN_CHANGED if the plan differs.
 */
export const POST = apiRoute<{ id: string }>(async ({ request, params, principal }) =>
  getTrelloService(principal, "sync").sync(parseId(params.id, "Project"), await readBody(request, syncConfirmationSchema)),
);

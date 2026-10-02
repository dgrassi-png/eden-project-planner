import { z } from "zod";

import { apiRoute, parseId, readBody } from "@/lib/api/http";
import { syncConfirmationSchema } from "@/lib/api/schemas";
import { actorFor } from "@/lib/auth/session";
import { getPlanningService } from "@/lib/planning/server";
import { getTrelloService } from "@/lib/trello/server";

const bodySchema = z.union([z.strictObject({ dryRun: z.literal(true) }), z.strictObject({ confirm: syncConfirmationSchema })]);

/** Single-task sync: `{ dryRun: true }` previews, `{ confirm }` runs the previewed plan. */
export const POST = apiRoute<{ id: string }>(async ({ request, params, principal }) => {
  const task = await getPlanningService(actorFor(principal)).getTask(parseId(params.id, "Task"));
  const body = await readBody(request, bodySchema);
  const trello = getTrelloService(principal, "sync");
  return "dryRun" in body ? trello.preview(task.projectId, [task.id]) : trello.sync(task.projectId, body.confirm, [task.id]);
});

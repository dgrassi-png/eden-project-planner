import { apiRoute, parseId } from "@/lib/api/http";
import { getTrelloService } from "@/lib/trello/server";

/** Forgets the task's card link (the card is left untouched in Trello). */
export const DELETE = apiRoute<{ id: string }>(async ({ params, principal }) => {
  await getTrelloService(principal, "sync").unlink(parseId(params.id, "Task"));
});

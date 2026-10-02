import { apiRoute, parseId, readBody } from "@/lib/api/http";
import { memberTrelloSchema } from "@/lib/api/schemas";
import { getTrelloService } from "@/lib/trello/server";

/** Maps a planner member to a member of the Trello board (null clears it). */
export const PUT = apiRoute<{ id: string }>(async ({ request, params, principal }) => {
  const { trelloMemberId } = await readBody(request, memberTrelloSchema);
  return getTrelloService(principal, "settings").setMemberTrelloId(parseId(params.id, "Member"), trelloMemberId);
});

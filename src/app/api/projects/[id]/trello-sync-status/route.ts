import { apiRoute, parseId } from "@/lib/api/http";
import { getTrelloService } from "@/lib/trello/server";

/** Dry-run of a project sync: per task create / update / unchanged / error / skip. Writes nothing. */
export const GET = apiRoute<{ id: string }>(({ params, principal }) =>
  getTrelloService(principal, "sync").preview(parseId(params.id, "Project")),
);

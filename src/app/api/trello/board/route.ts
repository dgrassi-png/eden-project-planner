import { apiRoute } from "@/lib/api/http";
import { getTrelloService } from "@/lib/trello/server";

/** Lists, labels and members of the configured board, read live from Trello (for the mapping screen). */
export const GET = apiRoute(({ principal }) => getTrelloService(principal, "settings").discoverBoard());

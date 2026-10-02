import { apiRoute, parseId, readBody } from "@/lib/api/http";
import { trelloSettingsSchema } from "@/lib/api/schemas";
import { getTrelloService } from "@/lib/trello/server";

export const GET = apiRoute<{ id: string }>(async ({ params, principal }) => ({
  settings: await getTrelloService(principal, "settings").getSettings(parseId(params.id, "Project")),
}));

/** Saves the status→list, workstream→label and subtask mappings (validated against the live board). */
export const PUT = apiRoute<{ id: string }>(async ({ request, params, principal }) =>
  getTrelloService(principal, "settings").saveSettings(parseId(params.id, "Project"), await readBody(request, trelloSettingsSchema)),
);

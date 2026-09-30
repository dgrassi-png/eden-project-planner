/**
 * Minimal Trello REST client (server-side only: it holds the API key and
 * token). Credentials go in the Authorization header, never in URLs, so they
 * cannot leak through logs. Every response is untrusted and validated with
 * zod before use. Errors carry readable messages without Trello's raw body.
 */
import { z } from "zod";

export const TRELLO_API_BASE_URL = "https://api.trello.com/1";
const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class TrelloError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TrelloError";
  }
}

const trelloId = z.string().regex(/^[0-9a-fA-F]{24}$/);

const boardSchema = z.object({ id: trelloId, name: z.string(), url: z.string(), closed: z.boolean().optional() });
const listSchema = z.object({ id: trelloId, name: z.string(), closed: z.boolean().optional() });
const labelSchema = z.object({ id: trelloId, name: z.string().nullable().optional(), color: z.string().nullable().optional() });
const memberSchema = z.object({ id: trelloId, fullName: z.string().nullable().optional(), username: z.string() });
const checkItemSchema = z.object({ id: trelloId, name: z.string(), state: z.enum(["complete", "incomplete"]) });
const checklistSchema = z.object({ id: trelloId, name: z.string(), checkItems: z.array(checkItemSchema).default([]) });
const cardSchema = z.object({
  id: trelloId,
  url: z.string(),
  desc: z.string().default(""),
  closed: z.boolean().default(false),
  idBoard: trelloId,
  checklists: z.array(checklistSchema).default([]),
});
const createdSchema = z.object({ id: trelloId, url: z.string().optional() });

export type TrelloList = z.infer<typeof listSchema>;
export type TrelloLabel = z.infer<typeof labelSchema>;
export type TrelloMember = z.infer<typeof memberSchema>;
export type TrelloCard = z.infer<typeof cardSchema>;
export type TrelloChecklist = z.infer<typeof checklistSchema>;

export interface TrelloBoard {
  id: string;
  name: string;
  url: string;
  lists: TrelloList[];
  labels: TrelloLabel[];
  members: TrelloMember[];
}

export interface CardFields {
  name: string;
  desc: string;
  due: string | null;
  dueComplete: boolean;
  idList: string;
  idMembers: string[];
  idLabels: string[];
}

/** Operations the sync needs. Implemented over HTTP here and by a fake in tests. */
export interface TrelloApi {
  getBoard(boardRef: string): Promise<TrelloBoard>;
  /** All cards of the board, archived included, with their checklists. */
  listBoardCards(boardId: string): Promise<TrelloCard[]>;
  createCard(fields: CardFields): Promise<{ id: string; url: string }>;
  updateCard(cardId: string, fields: CardFields): Promise<{ id: string; url: string }>;
  createChecklist(cardId: string, name: string): Promise<{ id: string }>;
  addCheckItem(checklistId: string, name: string, complete: boolean): Promise<void>;
  updateCheckItem(cardId: string, checkItemId: string, name: string, complete: boolean): Promise<void>;
  deleteCheckItem(checklistId: string, checkItemId: string): Promise<void>;
}

function describeStatus(status: number): string {
  if (status === 401) return "Trello rejected the credentials (check TRELLO_API_KEY / TRELLO_API_TOKEN)";
  if (status === 403) return "The Trello token has no access to this board";
  if (status === 404) return "Trello object not found";
  if (status === 429) return "Trello rate limit reached; try again in a few seconds";
  if (status >= 500) return `Trello is unavailable (HTTP ${status})`;
  return `Trello request failed (HTTP ${status})`;
}

export function createTrelloClient(options: {
  apiKey: string;
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): TrelloApi {
  const base = (options.baseUrl ?? TRELLO_API_BASE_URL).replace(/\/$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  const authorization = `OAuth oauth_consumer_key="${options.apiKey}", oauth_token="${options.token}"`;

  async function call<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, schema: z.ZodType<T>, body?: unknown, attempt = 0): Promise<T> {
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers: {
          authorization,
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error",
      });
    } catch {
      throw new TrelloError(0, "Trello could not be reached (network error or timeout)");
    }
    if (response.status === 429 && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      return call(method, path, schema, body, 1);
    }
    if (!response.ok) throw new TrelloError(response.status, describeStatus(response.status));
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new TrelloError(502, "Trello response is too large");
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new TrelloError(502, "Trello returned an invalid response");
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new TrelloError(502, "Trello returned an unexpected response");
    return parsed.data;
  }

  const encode = encodeURIComponent;
  const cardBody = (fields: CardFields) => ({
    name: fields.name,
    desc: fields.desc,
    due: fields.due,
    dueComplete: fields.dueComplete,
    idList: fields.idList,
    idMembers: fields.idMembers.join(","),
    idLabels: fields.idLabels.join(","),
  });
  const anything = z.unknown();

  return {
    async getBoard(boardRef) {
      const board = await call("GET", `/boards/${encode(boardRef)}?fields=id,name,url,closed`, boardSchema);
      const [lists, labels, members] = await Promise.all([
        call("GET", `/boards/${board.id}/lists?filter=open&fields=id,name,closed`, z.array(listSchema)),
        call("GET", `/boards/${board.id}/labels?fields=id,name,color&limit=1000`, z.array(labelSchema)),
        call("GET", `/boards/${board.id}/members?fields=id,fullName,username`, z.array(memberSchema)),
      ]);
      return { id: board.id, name: board.name, url: board.url, lists, labels, members };
    },
    listBoardCards: (boardId) =>
      call(
        "GET",
        `/boards/${encode(boardId)}/cards/all?fields=id,url,desc,closed,idBoard&checklists=all&checklist_fields=id,name`,
        z.array(cardSchema),
      ),
    async createCard(fields) {
      const card = await call("POST", "/cards", createdSchema, cardBody(fields));
      return { id: card.id, url: card.url ?? "" };
    },
    async updateCard(cardId, fields) {
      const card = await call("PUT", `/cards/${encode(cardId)}`, createdSchema, cardBody(fields));
      return { id: card.id, url: card.url ?? "" };
    },
    createChecklist: (cardId, name) => call("POST", `/cards/${encode(cardId)}/checklists`, createdSchema, { name }),
    async addCheckItem(checklistId, name, complete) {
      await call("POST", `/checklists/${encode(checklistId)}/checkItems`, anything, { name, checked: complete });
    },
    async updateCheckItem(cardId, checkItemId, name, complete) {
      await call("PUT", `/cards/${encode(cardId)}/checkItem/${encode(checkItemId)}`, anything, {
        name,
        state: complete ? "complete" : "incomplete",
      });
    },
    async deleteCheckItem(checklistId, checkItemId) {
      await call("DELETE", `/checklists/${encode(checklistId)}/checkItems/${encode(checkItemId)}`, anything);
    },
  };
}

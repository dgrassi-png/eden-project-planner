import type { CardFields, TrelloApi, TrelloBoard, TrelloCard } from "./client";

/** In-memory Trello board for tests and local demos. Not used in production. */
export function createFakeTrello(board: Omit<TrelloBoard, "url"> & { url?: string }) {
  const cards = new Map<string, TrelloCard & { fields: CardFields }>();
  let counter = 0;
  const nextId = () => (++counter).toString(16).padStart(24, "0");
  const calls: string[] = [];
  const fullBoard: TrelloBoard = { url: `https://trello.com/b/${board.id}`, ...board };

  const api: TrelloApi = {
    async getBoard() {
      calls.push("getBoard");
      return fullBoard;
    },
    async listBoardCards() {
      calls.push("listBoardCards");
      return [...cards.values()].map((c) => structuredClone({ ...c, fields: undefined }) as TrelloCard);
    },
    async createCard(fields) {
      calls.push("createCard");
      const id = nextId();
      cards.set(id, { id, url: `https://trello.com/c/${id}`, desc: fields.desc, closed: false, idBoard: board.id, checklists: [], fields });
      return { id, url: `https://trello.com/c/${id}` };
    },
    async updateCard(cardId, fields) {
      calls.push("updateCard");
      const card = cards.get(cardId);
      if (!card) throw new Error("not found");
      Object.assign(card, { desc: fields.desc, fields });
      return { id: cardId, url: card.url };
    },
    async createChecklist(cardId, name) {
      calls.push("createChecklist");
      const id = nextId();
      cards.get(cardId)?.checklists.push({ id, name, checkItems: [] });
      return { id };
    },
    async addCheckItem(checklistId, name, complete) {
      calls.push("addCheckItem");
      for (const card of cards.values())
        card.checklists.find((c) => c.id === checklistId)?.checkItems.push({ id: nextId(), name, state: complete ? "complete" : "incomplete" });
    },
    async updateCheckItem(cardId, checkItemId, name, complete) {
      calls.push("updateCheckItem");
      for (const checklist of cards.get(cardId)?.checklists ?? []) {
        const item = checklist.checkItems.find((i) => i.id === checkItemId);
        if (item) Object.assign(item, { name, state: complete ? "complete" : "incomplete" });
      }
    },
    async deleteCheckItem(checklistId, checkItemId) {
      calls.push("deleteCheckItem");
      for (const card of cards.values()) {
        const checklist = card.checklists.find((c) => c.id === checklistId);
        if (checklist) checklist.checkItems = checklist.checkItems.filter((i) => i.id !== checkItemId);
      }
    },
  };
  return { api, cards, calls };
}

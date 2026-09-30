import { createHash } from "node:crypto";

import type { TaskStatus } from "@/domain/planning/constants";
import {
  cardFingerprintSource,
  planSync,
  plannerIdMarker,
  SUBTASK_CHECKLIST_NAME,
  validateSettings,
  type CardContent,
  type MappingContext,
  type SubtaskMode,
  type SyncAction,
  type SyncPlan,
  type TrelloSettings,
} from "@/domain/trello/mapping";
import { PlanningError } from "@/lib/planning/errors";
import type { PlanningStore } from "@/lib/planning/store";

import { TrelloError, type TrelloApi, type TrelloBoard, type TrelloCard } from "./client";

export const fingerprint = (content: CardContent): string =>
  createHash("sha256").update(cardFingerprintSource(content)).digest("hex");

/** What the user confirmed after the dry-run; the server re-plans and refuses if it differs. */
export interface SyncConfirmation {
  items: { taskId: string; action: SyncAction }[];
}

export interface SyncResult {
  taskId: string;
  edenCode: string;
  action: SyncAction;
  ok: boolean;
  message: string | null;
  cardUrl: string | null;
}

export interface SettingsInput {
  subtaskMode: SubtaskMode;
  statusLists: Partial<Record<TaskStatus, string>>;
  workstreamLabels: Record<string, string>;
}

const CODE_PREFIX = /^\[([A-Z][A-Z0-9]{1,9}-\d{3,}(?:\.\d+)?)\]/;

function notConfigured(): PlanningError {
  return new PlanningError("unavailable", "Trello is not configured (TRELLO_API_KEY, TRELLO_API_TOKEN, TRELLO_BOARD_ID)");
}

function fromTrello(error: unknown): PlanningError {
  if (error instanceof TrelloError) return new PlanningError(error.status === 401 || error.status === 403 ? "unavailable" : "internal", error.message);
  if (error instanceof PlanningError) return error;
  return new PlanningError("internal", "Trello request failed");
}

const message = (error: unknown) =>
  error instanceof TrelloError || error instanceof PlanningError ? error.message : "Unexpected error while syncing";

/**
 * Planner -> Trello sync. One-way: Trello is never read back into the plan,
 * except to find cards the planner created (by the EDEN_PLANNER_ID marker)
 * so that a retry never creates a duplicate.
 */
export class TrelloSyncService {
  constructor(
    private readonly store: PlanningStore,
    private readonly api: TrelloApi | null,
    /** Board configured for this deployment (TRELLO_BOARD_ID: id or short link). */
    private readonly boardRef: string | null,
  ) {}

  private requireApi(): { api: TrelloApi; boardRef: string } {
    if (!this.api || !this.boardRef) throw notConfigured();
    return { api: this.api, boardRef: this.boardRef };
  }

  get configured(): boolean {
    return this.api !== null && this.boardRef !== null;
  }

  /** Lists, labels and members of the configured board, read live from Trello. */
  async discoverBoard(): Promise<TrelloBoard> {
    const { api, boardRef } = this.requireApi();
    try {
      return await api.getBoard(boardRef);
    } catch (error) {
      throw fromTrello(error);
    }
  }

  getSettings(projectId: string): Promise<TrelloSettings | null> {
    return this.store.getTrelloSettings(projectId);
  }

  async saveSettings(projectId: string, input: SettingsInput): Promise<TrelloSettings> {
    if (!(await this.store.getProject(projectId))) throw PlanningError.notFound("Project");
    const board = await this.discoverBoard();
    const workstreams = await this.store.listWorkstreams(projectId);
    const clean = <T extends Record<string, string | undefined>>(map: T) =>
      Object.fromEntries(Object.entries(map).filter(([, v]) => typeof v === "string" && v.length > 0)) as Record<string, string>;
    const statusLists = clean(input.statusLists);
    const workstreamLabels = clean(input.workstreamLabels);
    const problems = validateSettings(
      { statusLists, workstreamLabels, subtaskMode: input.subtaskMode },
      { listIds: board.lists.map((l) => l.id), labelIds: board.labels.map((l) => l.id) },
      workstreams.map((w) => w.id),
    );
    if (problems.length) throw PlanningError.validation(problems.map((m) => ({ code: "TRELLO_MAPPING", message: m })));
    return this.store.saveTrelloSettings({
      projectId,
      boardId: board.id,
      boardName: board.name,
      boardUrl: board.url,
      subtaskMode: input.subtaskMode,
      statusLists,
      workstreamLabels,
    });
  }

  /** Maps a project member to a Trello member of the board (or clears it). */
  async setMemberTrelloId(memberId: string, trelloMemberId: string | null) {
    const member = await this.store.getMember(memberId);
    if (!member) throw PlanningError.notFound("Member");
    if (trelloMemberId !== null) {
      const board = await this.discoverBoard();
      if (!board.members.some((m) => m.id === trelloMemberId)) {
        throw PlanningError.validation([{ code: "TRELLO_MAPPING", message: "That person is not a member of the Trello board" }]);
      }
    }
    return this.store.updateMember(memberId, { trelloMemberId });
  }

  private async context(projectId: string): Promise<MappingContext> {
    const settings = await this.store.getTrelloSettings(projectId);
    if (!settings) {
      throw new PlanningError("unavailable", "Trello mapping is not set up for this project (Settings → Trello)");
    }
    const [workstreams, members, tasks, dependencies] = await Promise.all([
      this.store.listWorkstreams(projectId),
      this.store.listMembers(projectId),
      this.store.listTasks(projectId),
      this.store.listDependencies(projectId),
    ]);
    return { settings, workstreams, members, tasks, dependencies };
  }

  /** Dry-run: what a sync would do. Writes nothing, calls nothing on Trello. */
  async preview(projectId: string, taskIds?: string[]): Promise<SyncPlan> {
    return planSync(await this.context(projectId), fingerprint, taskIds);
  }

  /** Runs the confirmed plan. Items are independent: one failure does not stop the others. */
  async sync(projectId: string, confirmation: SyncConfirmation, taskIds?: string[]): Promise<SyncResult[]> {
    const { api } = this.requireApi();
    const ctx = await this.context(projectId);
    const plan = planSync(ctx, fingerprint, taskIds);
    const key = (items: { taskId: string; action: string }[]) =>
      items.map((i) => `${i.taskId}:${i.action}`).sort().join(",");
    if (key(plan.items) !== key(confirmation.items)) {
      throw PlanningError.conflict("The plan changed since the preview; review the sync again", [
        { code: "SYNC_PLAN_CHANGED", message: "The plan changed since the preview" },
      ]);
    }

    const work = plan.items.filter((item) => item.action === "create" || item.action === "update");
    let boardCards: TrelloCard[] = [];
    if (work.length) {
      try {
        boardCards = await api.listBoardCards(ctx.settings.boardId);
      } catch (error) {
        throw fromTrello(error);
      }
    }
    const byId = new Map(boardCards.map((c) => [c.id, c]));

    const results: SyncResult[] = [];
    for (const item of plan.items) {
      const base = { taskId: item.taskId, edenCode: item.edenCode, action: item.action };
      if (item.action === "skip" || item.action === "error") {
        if (item.action === "error") {
          await this.store.recordTrelloSync(item.taskId, { trelloSyncStatus: "SYNC_ERROR", trelloLastError: item.reason });
        }
        results.push({ ...base, ok: item.action === "skip", message: item.reason, cardUrl: null });
        continue;
      }
      if (item.action === "unchanged") {
        await this.store.recordTrelloSync(item.taskId, { trelloSyncStatus: "SYNCED", trelloLastError: null });
        results.push({ ...base, ok: true, message: null, cardUrl: null });
        continue;
      }
      const content = item.content as CardContent;
      try {
        let card: TrelloCard | undefined;
        if (item.trelloCardId) {
          card = byId.get(item.trelloCardId);
          if (!card) {
            throw new PlanningError(
              "conflict",
              "The linked card is no longer on the board (deleted or moved). Unlink it in the task panel to create a new one.",
            );
          }
        } else {
          // Idempotency: a card created by an earlier, interrupted run is adopted, not duplicated.
          card = boardCards.find((c) => c.desc.includes(plannerIdMarker(item.taskId)));
        }
        const fields = {
          name: content.name,
          desc: content.desc,
          due: content.due,
          dueComplete: content.dueComplete,
          idList: content.idList,
          idMembers: content.idMembers,
          idLabels: content.idLabels,
        };
        const written = card ? await api.updateCard(card.id, fields) : await api.createCard(fields);
        const url = written.url || card?.url || null;
        // Record the link immediately, so a later failure cannot lose it.
        await this.store.recordTrelloSync(item.taskId, {
          trelloSyncStatus: "SYNC_PENDING",
          trelloLastError: null,
          trelloCardId: written.id,
          trelloCardUrl: url,
        });
        if (content.checklist) await this.syncChecklist(api, written.id, card, content.checklist);
        await this.store.recordTrelloSync(item.taskId, {
          trelloSyncStatus: "SYNCED",
          trelloLastError: null,
          trelloSyncedHash: fingerprint(content),
          trelloSyncedAt: new Date().toISOString(),
        });
        results.push({ ...base, ok: true, message: card && !item.trelloCardId ? "Existing card found and linked" : null, cardUrl: url });
      } catch (error) {
        const text = message(error);
        await this.store.recordTrelloSync(item.taskId, { trelloSyncStatus: "SYNC_ERROR", trelloLastError: text.slice(0, 1000) });
        results.push({ ...base, ok: false, message: text, cardUrl: null });
      }
    }
    return results;
  }

  /**
   * Reconciles the subtask checklist by E:DEN code: adds missing items,
   * updates changed ones and removes items for subtasks that no longer exist.
   * Items without an E:DEN code prefix (added by people in Trello) are kept.
   */
  private async syncChecklist(api: TrelloApi, cardId: string, card: TrelloCard | undefined, items: NonNullable<CardContent["checklist"]>) {
    const existing = card?.checklists.find((c) => c.name === SUBTASK_CHECKLIST_NAME);
    if (!existing && items.length === 0) return;
    const checklistId = existing?.id ?? (await api.createChecklist(cardId, SUBTASK_CHECKLIST_NAME)).id;
    const current = new Map(
      (existing?.checkItems ?? []).flatMap((item) => {
        const code = CODE_PREFIX.exec(item.name)?.[1];
        return code ? [[code, item] as const] : [];
      }),
    );
    for (const wanted of items) {
      const found = current.get(wanted.code);
      if (!found) await api.addCheckItem(checklistId, wanted.name, wanted.complete);
      else if (found.name !== wanted.name || (found.state === "complete") !== wanted.complete) {
        await api.updateCheckItem(cardId, found.id, wanted.name, wanted.complete);
      }
      current.delete(wanted.code);
    }
    for (const stale of current.values()) await api.deleteCheckItem(checklistId, stale.id);
  }

  /** Forgets the card link (the card itself is left untouched in Trello). */
  async unlink(taskId: string): Promise<void> {
    const task = await this.store.getTask(taskId);
    if (!task) throw PlanningError.notFound("Task");
    await this.store.recordTrelloSync(taskId, {
      trelloSyncStatus: "NOT_SYNCED",
      trelloLastError: null,
      trelloCardId: null,
      trelloCardUrl: null,
      trelloSyncedHash: null,
      trelloSyncedAt: null,
    });
  }
}

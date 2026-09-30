import { GEOGRAPHY_LABELS, TASK_STATUSES, type TaskStatus } from "../planning/constants";
import type { Member, Task, TaskDependency, Workstream } from "../planning/types";

/**
 * Planner -> Trello mapping (pure). The planner is authoritative: a card is a
 * projection of a task, rebuilt from planning data on every sync. Trello IDs
 * come from the saved settings, which are discovered from the Trello API and
 * never guessed.
 */

export const SUBTASK_MODES = ["CHECKLIST", "CARD"] as const;
export type SubtaskMode = (typeof SUBTASK_MODES)[number];

export interface TrelloSettings {
  projectId: string;
  boardId: string;
  boardName: string | null;
  boardUrl: string | null;
  subtaskMode: SubtaskMode;
  /** Planner status -> Trello list id. */
  statusLists: Partial<Record<TaskStatus, string>>;
  /** Workstream id -> Trello label id. */
  workstreamLabels: Record<string, string>;
  updatedAt: string;
}

/** Checklist that mirrors subtasks on the parent card (CHECKLIST mode). */
export const SUBTASK_CHECKLIST_NAME = "E:DEN subtasks";

export const plannerIdMarker = (taskId: string) => `EDEN_PLANNER_ID:${taskId}`;
export const edenCodeMarker = (edenCode: string) => `EDEN_CODE:${edenCode}`;

/** Trello card description limit is 16384 characters. */
const DESCRIPTION_MAX = 16_000;

export interface CardContent {
  name: string;
  desc: string;
  /** ISO datetime, or null to clear the due date. */
  due: string | null;
  dueComplete: boolean;
  idList: string;
  idMembers: string[];
  idLabels: string[];
  /** Subtask checklist items (CHECKLIST mode only), keyed by E:DEN code. */
  checklist: { code: string; name: string; complete: boolean }[] | null;
}

export interface MappingContext {
  settings: TrelloSettings;
  workstreams: Pick<Workstream, "id" | "code" | "name">[];
  members: Pick<Member, "id" | "displayName" | "trelloMemberId">[];
  tasks: Task[];
  dependencies: Pick<TaskDependency, "predecessorTaskId" | "successorTaskId" | "lagDays">[];
}

export interface CardBuild {
  content: CardContent | null;
  /** Blocking problems: the card cannot be written. */
  errors: string[];
  /** The card can be written, but part of the mapping is missing. */
  warnings: string[];
}

/**
 * Trello due dates are datetimes. A planned finish (date only) is sent as
 * 12:00 UTC so it shows on the same calendar day in every European time zone.
 */
export function dueFromFinish(finish: string | null): string | null {
  return finish === null ? null : `${finish}T12:00:00.000Z`;
}

export const cardTitle = (task: Pick<Task, "edenCode" | "title">) => `[${task.edenCode}] ${task.title}`;

function summary(task: Task, ctx: MappingContext): string {
  const workstream = ctx.workstreams.find((w) => w.id === task.workstreamId);
  const owner = ctx.members.find((m) => m.id === task.ownerMemberId);
  const codeOf = (id: string) => ctx.tasks.find((t) => t.id === id)?.edenCode ?? "?";
  const predecessors = ctx.dependencies
    .filter((d) => d.successorTaskId === task.id)
    .map((d) => `${codeOf(d.predecessorTaskId)}${d.lagDays ? ` +${d.lagDays}wd` : ""}`)
    .sort();
  const planned = task.isMilestone
    ? `Milestone: ${task.plannedStart ?? "TBD"}`
    : `Planned: ${task.plannedStart ?? "TBD"} → ${task.plannedFinish ?? "TBD"} (${task.plannedDurationDays === null ? "duration TBD" : `${task.plannedDurationDays} working days`})`;
  const lines = [
    `Workstream: ${workstream ? `${workstream.code} · ${workstream.name}` : "—"}`,
    `Owner: ${owner?.displayName ?? "TBD"}`,
    planned,
    task.deadline ? `Deadline: ${task.deadline}` : null,
    `Priority: ${task.priority ?? "TBD"} · Location: ${task.geography ? GEOGRAPHY_LABELS[task.geography] : "TBD"}`,
    predecessors.length ? `Depends on: ${predecessors.join(", ")}` : null,
    task.blocker ? `Blocker: ${task.blocker}` : null,
    task.waitingFor ? `Waiting for: ${task.waitingFor}` : null,
  ].filter((line): line is string => line !== null);
  const footer = [
    "---",
    "Planned in E:DEN Planner. Change planning data (dates, owner, status) in the Planner: edits here are overwritten.",
    edenCodeMarker(task.edenCode),
    plannerIdMarker(task.id),
  ].join("\n");
  const body = task.description ? `\n\n${task.description}` : "";
  const head = lines.join("\n");
  const room = DESCRIPTION_MAX - head.length - footer.length - 4;
  const trimmedBody = body.length > room ? `${body.slice(0, Math.max(0, room - 1))}…` : body;
  return `${head}${trimmedBody}\n\n${footer}`;
}

/** Builds the card for one task. */
export function buildCard(task: Task, ctx: MappingContext): CardBuild {
  const errors: string[] = [];
  const warnings: string[] = [];
  const idList = ctx.settings.statusLists[task.status];
  if (!idList) errors.push(`No Trello list is mapped for status ${task.status}`);

  const idMembers: string[] = [];
  if (task.ownerMemberId) {
    const owner = ctx.members.find((m) => m.id === task.ownerMemberId);
    if (owner?.trelloMemberId) idMembers.push(owner.trelloMemberId);
    else warnings.push(`Owner ${owner?.displayName ?? "?"} has no Trello member mapped`);
  }

  const idLabels: string[] = [];
  const label = ctx.settings.workstreamLabels[task.workstreamId];
  if (label) idLabels.push(label);
  else warnings.push("Workstream has no Trello label mapped");

  let checklist: CardContent["checklist"] = null;
  if (ctx.settings.subtaskMode === "CHECKLIST" && task.parentTaskId === null) {
    checklist = ctx.tasks
      .filter((t) => t.parentTaskId === task.id && t.status !== "CANCELLED")
      .sort((a, b) => a.edenCode.localeCompare(b.edenCode, "en", { numeric: true }))
      .map((t) => ({ code: t.edenCode, name: cardTitle(t), complete: t.status === "DONE" }));
  }

  if (errors.length || !idList) return { content: null, errors, warnings };
  return {
    content: {
      name: cardTitle(task),
      desc: summary(task, ctx),
      due: dueFromFinish(task.plannedFinish),
      dueComplete: task.status === "DONE",
      idList,
      idMembers,
      idLabels,
      checklist,
    },
    errors,
    warnings,
  };
}

/** Stable serialisation of card content (hashed by the server to detect changes). */
export function cardFingerprintSource(content: CardContent): string {
  return JSON.stringify([
    content.name,
    content.desc,
    content.due,
    content.dueComplete,
    content.idList,
    [...content.idMembers].sort(),
    [...content.idLabels].sort(),
    content.checklist,
  ]);
}

export type SyncAction = "create" | "update" | "unchanged" | "error" | "skip";

export interface SyncItem {
  taskId: string;
  edenCode: string;
  title: string;
  action: SyncAction;
  /** Why the task is skipped or in error. */
  reason: string | null;
  warnings: string[];
  content: CardContent | null;
  trelloCardId: string | null;
}

export interface SyncPlan {
  items: SyncItem[];
  counts: Record<SyncAction, number>;
}

/** Tasks that get their own card under the configured subtask mode. */
export function syncableTasks(tasks: Task[], mode: SubtaskMode): Task[] {
  return tasks.filter((t) => mode === "CARD" || t.parentTaskId === null);
}

/**
 * Dry-run plan. `fingerprint` hashes card content (injected so the domain
 * stays free of crypto). `taskIds` limits the plan (single-task sync).
 */
export function planSync(ctx: MappingContext, fingerprint: (content: CardContent) => string, taskIds?: string[]): SyncPlan {
  const wanted = taskIds ? new Set(taskIds) : null;
  const items: SyncItem[] = [];
  for (const task of syncableTasks(ctx.tasks, ctx.settings.subtaskMode)) {
    if (wanted && !wanted.has(task.id)) continue;
    const base = { taskId: task.id, edenCode: task.edenCode, title: task.title, trelloCardId: task.trelloCardId };
    if (task.status === "CANCELLED" && !task.trelloCardId) {
      items.push({ ...base, action: "skip", reason: "Cancelled and never sent to Trello", warnings: [], content: null });
      continue;
    }
    const build = buildCard(task, ctx);
    if (!build.content) {
      items.push({ ...base, action: "error", reason: build.errors.join("; "), warnings: build.warnings, content: null });
      continue;
    }
    const action: SyncAction = !task.trelloCardId
      ? "create"
      : task.trelloSyncStatus !== "SYNC_ERROR" && task.trelloSyncedHash === fingerprint(build.content)
        ? "unchanged"
        : "update";
    items.push({ ...base, action, reason: null, warnings: build.warnings, content: build.content });
  }
  items.sort((a, b) => a.edenCode.localeCompare(b.edenCode, "en", { numeric: true }));
  const counts = { create: 0, update: 0, unchanged: 0, error: 0, skip: 0 } satisfies Record<SyncAction, number>;
  for (const item of items) counts[item.action] += 1;
  return { items, counts };
}

/** Validates settings from the UI against what Trello reported for the board. */
export function validateSettings(
  input: Pick<TrelloSettings, "statusLists" | "workstreamLabels" | "subtaskMode">,
  board: { listIds: string[]; labelIds: string[] },
  workstreamIds: string[],
): string[] {
  const problems: string[] = [];
  for (const [status, listId] of Object.entries(input.statusLists)) {
    if (!(TASK_STATUSES as readonly string[]).includes(status)) problems.push(`Unknown status ${status}`);
    else if (listId && !board.listIds.includes(listId)) problems.push(`List for ${status} is not an open list of the board`);
  }
  for (const [workstreamId, labelId] of Object.entries(input.workstreamLabels)) {
    if (!workstreamIds.includes(workstreamId)) problems.push("Unknown workstream in label mapping");
    else if (labelId && !board.labelIds.includes(labelId)) problems.push("Label is not a label of the board");
  }
  if (!(SUBTASK_MODES as readonly string[]).includes(input.subtaskMode)) problems.push("Unknown subtask mode");
  return problems;
}

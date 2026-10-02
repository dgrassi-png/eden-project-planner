import { scheduleState } from "../planning/calendar";
import type { DependencyCheck } from "../planning/scheduling";
import type { AuditEvent, ChangeProposal, PlanningSnapshot } from "../planning/types";

/**
 * Structured, provider-neutral project context for AI assistants (and the
 * Personal Assistant). Everything is referenced by E:DEN code and person
 * name; unknown values are null, never guessed. No secrets, no emails.
 */
export interface AiContext {
  schema: "eden-planner/ai-context@1";
  generatedAt: string;
  today: string;
  project: { id: string; name: string; slug: string };
  rules: string[];
  workstreams: { code: string; name: string }[];
  people: { name: string; active: boolean; trelloLinked: boolean }[];
  tasks: {
    code: string;
    title: string;
    description: string | null;
    workstream: string | null;
    parent: string | null;
    owner: string | null;
    status: string;
    priority: string | null;
    geography: string | null;
    milestone: boolean;
    plannedStart: string | null;
    plannedDurationDays: number | null;
    plannedFinish: string | null;
    deadline: string | null;
    scheduleState: string;
    progressPercent: number | null;
    blocker: string | null;
    waitingFor: string | null;
    splittable: boolean | null;
    notes: string | null;
    predecessors: { code: string; lagDays: number; state: string; conflictDays: number }[];
    trello: { status: string; cardUrl: string | null };
  }[];
  dependencyViolations: { predecessor: string; successor: string; conflictDays: number; earliestStart: string | null }[];
  pendingProposals: { id: string; source: string; reason: string | null; createdAt: string }[];
  recentChanges: { at: string; actor: string; action: string; entity: string; code: string | null; fields: string[] }[];
  proposalFormat: string;
}

export const PROPOSAL_RULES = [
  "You are advisory: you may analyse and propose, never write. A person reviews and applies every proposal.",
  "Reference tasks by E:DEN code (e.g. TEC-001); codes are permanent and cannot be changed.",
  "Never invent dates, durations, owners or progress: leave them out (unknown) unless the user gave them.",
  "Working days are Monday–Friday; a task start must be a working day; the start day counts as day 1; milestones have zero duration.",
  "Planned finish is derived from start + duration. A plannedFinish in a proposal is translated into a duration.",
  "Dependencies are finish-to-start with an optional lag in working days; moving a task never moves its successors automatically.",
  "Trello is updated separately by the planner (Planner → Trello only); do not propose Trello changes.",
];

export const PROPOSAL_FORMAT = `POST /api/projects/{projectId}/change-proposals
{ "source": "CLAUDE" | "CHATGPT", "reason": "why", "payload": { "summary": "...", "changes": [
  { "op": "update_task", "task": "SC-001", "set": { "plannedFinish": "2026-10-17", "status": "WAITING_BLOCKED", "blocker": "Supplier delay" } },
  { "op": "create_task", "task": { "edenCode": "PROD-003", "title": "...", "workstream": "PROD" } },
  { "op": "add_dependency", "predecessor": "SC-001", "successor": "PROD-003", "lagDays": 0 },
  { "op": "update_dependency", "predecessor": "...", "successor": "...", "lagDays": 2 },
  { "op": "remove_dependency", "predecessor": "...", "successor": "..." } ] } }
Settable fields: title, description, owner (person name), plannedStart, plannedDurationDays, plannedFinish, status, priority, geography, isMilestone, progressPercent, deadline, blocker, waitingFor, notes, splittable, workstream (code).`;

export function buildAiContext(input: {
  snapshot: PlanningSnapshot;
  checks: DependencyCheck[];
  proposals: ChangeProposal[];
  audit: AuditEvent[];
  today: string;
  now: string;
}): AiContext {
  const { snapshot, checks } = input;
  const codeById = new Map(snapshot.tasks.map((t) => [t.id, t.edenCode]));
  const memberName = new Map(snapshot.members.map((m) => [m.id, m.displayName]));
  const wsCode = new Map(snapshot.workstreams.map((w) => [w.id, w.code]));
  const checksBySuccessor = new Map<string, DependencyCheck[]>();
  for (const check of checks) checksBySuccessor.set(check.successorTaskId, [...(checksBySuccessor.get(check.successorTaskId) ?? []), check]);

  const tasks = [...snapshot.tasks]
    .sort((a, b) => a.edenCode.localeCompare(b.edenCode, "en", { numeric: true }))
    .map((t) => ({
      code: t.edenCode,
      title: t.title,
      description: t.description,
      workstream: wsCode.get(t.workstreamId) ?? null,
      parent: t.parentTaskId ? (codeById.get(t.parentTaskId) ?? null) : null,
      owner: t.ownerMemberId ? (memberName.get(t.ownerMemberId) ?? null) : null,
      status: t.status,
      priority: t.priority,
      geography: t.geography,
      milestone: t.isMilestone,
      plannedStart: t.plannedStart,
      plannedDurationDays: t.plannedDurationDays,
      plannedFinish: t.plannedFinish,
      deadline: t.deadline,
      scheduleState: scheduleState(t),
      progressPercent: t.progressPercent,
      blocker: t.blocker,
      waitingFor: t.waitingFor,
      splittable: t.splittable,
      notes: t.notes,
      predecessors: (checksBySuccessor.get(t.id) ?? []).map((c) => ({
        code: c.predecessorCode,
        lagDays: c.lagDays,
        state: c.state,
        conflictDays: c.conflictDays,
      })),
      trello: { status: t.trelloSyncStatus, cardUrl: t.trelloCardUrl },
    }));

  const recentChanges = input.audit.map((event) => {
    const row = (event.after ?? event.before ?? {}) as Record<string, unknown>;
    const fields = event.metadata?.changed_fields;
    return {
      at: event.createdAt,
      actor: event.actorType === "USER" ? `USER ${event.actorId ?? "?"}` : event.actorType,
      action: event.action,
      entity: event.entityType,
      code: typeof row.eden_code === "string" ? row.eden_code : null,
      fields: Array.isArray(fields) ? fields.map(String) : [],
    };
  });

  return {
    schema: "eden-planner/ai-context@1",
    generatedAt: input.now,
    today: input.today,
    project: { id: snapshot.project.id, name: snapshot.project.name, slug: snapshot.project.slug },
    rules: PROPOSAL_RULES,
    workstreams: [...snapshot.workstreams].sort((a, b) => a.sortOrder - b.sortOrder).map((w) => ({ code: w.code, name: w.name })),
    people: snapshot.members.map((m) => ({ name: m.displayName, active: m.active, trelloLinked: m.trelloMemberId !== null })),
    tasks,
    dependencyViolations: checks
      .filter((c) => c.state === "violated")
      .map((c) => ({ predecessor: c.predecessorCode, successor: c.successorCode, conflictDays: c.conflictDays, earliestStart: c.earliestStart })),
    pendingProposals: input.proposals
      .filter((p) => p.status === "PENDING")
      .map((p) => ({ id: p.id, source: p.source, reason: p.reason, createdAt: p.createdAt })),
    recentChanges,
    proposalFormat: PROPOSAL_FORMAT,
  };
}

import type { AuditEvent } from "./types";

/** Human-readable audit lines ("Marco changed TEC-001 duration"), shared by the history page and the task panel. */

const ENTITY: Record<string, string> = {
  projects: "project",
  workstreams: "workstream",
  members: "person",
  tasks: "task",
  task_dependencies: "dependency",
  change_proposals: "proposal",
  trello_settings: "Trello mapping",
};

const FIELD: Record<string, string> = {
  planned_start: "start",
  planned_duration_days: "duration",
  planned_finish: "finish",
  owner_member_id: "owner",
  workstream_id: "workstream",
  progress_percent: "progress",
  is_milestone: "milestone",
  waiting_for: "waiting for",
  lag_days: "lag",
  trello_sync_status: "Trello status",
  trello_card_id: "Trello card",
  trello_card_url: "Trello link",
  trello_synced_hash: "Trello content",
  trello_synced_at: "Trello sync time",
  trello_last_error: "Trello error",
  trello_member_id: "Trello member",
  display_name: "name",
  sort_order: "order",
};

const SHOWN_VALUES = new Set(["status", "priority", "geography", "planned_start", "planned_duration_days", "planned_finish", "deadline", "lag_days", "title"]);

export function describeAuditEvent(event: AuditEvent): { actor: string; summary: string; details: string[]; via: string | null } {
  const row = (event.after ?? event.before ?? {}) as Record<string, unknown>;
  const name =
    typeof row.eden_code === "string"
      ? row.eden_code
      : typeof row.code === "string"
        ? row.code
        : typeof row.display_name === "string"
          ? row.display_name
          : typeof row.name === "string"
            ? row.name
            : "";
  const entity = ENTITY[event.entityType] ?? event.entityType;
  const verb = { CREATE: "created", UPDATE: "changed", DELETE: "deleted" }[event.action];
  const metadata = event.metadata ?? {};
  const changed = Array.isArray(metadata.changed_fields) ? metadata.changed_fields.map(String) : [];
  const details = changed.map((field) => {
    const label = FIELD[field] ?? field.replaceAll("_", " ");
    if (!SHOWN_VALUES.has(field)) return label;
    const show = (value: unknown) => (value === null || value === undefined ? "TBD" : String(value));
    return `${label}: ${show(event.before?.[field])} → ${show(event.after?.[field])}`;
  });
  let via: string | null = null;
  if (typeof metadata.cascade_from === "string") via = `cascade from ${metadata.cascade_from}`;
  else if (typeof metadata.proposal_id === "string") via = `proposal (${String(metadata.proposal_source ?? "?")})`;
  else if (event.actorType === "TRELLO_SYNC") via = "Trello sync";
  if (event.entityType === "task_dependencies") {
    details.unshift(`lag ${String(row.lag_days ?? 0)} wd`);
  }
  if (event.entityType === "change_proposals" && typeof row.status === "string") details.unshift(String(row.status));
  const actor = event.actorType === "USER" ? (event.actorId ?? "USER") : `${event.actorType}${event.actorId ? ` (${event.actorId})` : ""}`;
  return { actor, summary: `${verb} ${entity} ${name}`.trim(), details, via };
}

"use client";

import { formatGeography, formatStatus, TBD } from "./format";
import { SidePanel } from "./SidePanel";
import type { TaskRow } from "./types";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 py-1 text-xs">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={value === null ? "text-neutral-400" : "text-neutral-900"}>{value ?? TBD}</dd>
    </div>
  );
}

/** Read-only task details, used for scaffold rows while Supabase is not configured. */
export function TaskDrawer({ task, onClose }: { task: TaskRow; onClose: () => void }) {
  return (
    <SidePanel eyebrow={`${task.edenCode}${task.isMilestone ? " · Milestone" : ""}`} title={task.title} onClose={onClose}>
      <dl>
        <Field label="Workstream" value={task.workstreamName} />
        <Field label="Parent" value={task.parentCode ?? "—"} />
        <Field label="Owner" value={task.ownerName} />
        <Field label="Planned start" value={task.plannedStart} />
        <Field label="Duration" value={task.plannedDurationDays === null ? null : `${task.plannedDurationDays} working days`} />
        <Field label="Planned finish" value={task.plannedFinish} />
        <Field label="Status" value={formatStatus(task)} />
        <Field label="Priority" value={task.priority ?? "—"} />
        <Field label="Geography" value={formatGeography(task)} />
      </dl>
      <p className="rounded bg-neutral-50 px-2 py-1.5 text-[11px] text-neutral-500">
        Scaffold row. Configure Supabase to edit real planning data.
      </p>
    </SidePanel>
  );
}

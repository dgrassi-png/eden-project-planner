"use client";

import { useEffect } from "react";

import { formatGeography, formatStatus, TBD } from "./format";
import type { TaskRow } from "./types";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 py-1 text-xs">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={value === null ? "text-neutral-400" : "text-neutral-900"}>{value ?? TBD}</dd>
    </div>
  );
}

/**
 * Task detail drawer. Read-only during bootstrap; editing (with validation and
 * dependency impact warnings) arrives with the planning domain and Gantt phases.
 */
export function TaskDrawer({ task, onClose }: { task: TaskRow; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <aside
      aria-label={`Task ${task.edenCode}`}
      className="flex w-[360px] shrink-0 flex-col border-l border-neutral-200 bg-white"
    >
      <div className="flex items-start justify-between gap-2 border-b border-neutral-200 px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-neutral-500">
            {task.edenCode}
            {task.isMilestone ? " · Milestone" : ""}
          </p>
          <h2 className="truncate text-sm font-semibold text-neutral-900">{task.title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close task details"
          className="rounded px-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <section>
          <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Planning</h3>
          <dl>
            <Field label="Workstream" value={task.workstreamName} />
            <Field label="Parent" value={task.parentCode ?? "—"} />
            <Field label="Owner" value={task.ownerName} />
            <Field label="Planned start" value={task.plannedStart} />
            <Field
              label="Duration"
              value={task.isMilestone ? "0d (milestone)" : task.plannedDurationDays === null ? null : `${task.plannedDurationDays} working days`}
            />
            <Field label="Planned finish" value={task.plannedFinish} />
            <Field label="Status" value={formatStatus(task)} />
            <Field label="Priority" value={task.priority ?? "—"} />
            <Field label="Geography" value={formatGeography(task)} />
            <Field label="Progress" value={task.progressPercent === null ? "—" : `${task.progressPercent}%`} />
          </dl>
        </section>

        <section className="mt-4">
          <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Dependencies</h3>
          <p className="text-xs text-neutral-500">
            {task.predecessorCodes.length ? `After: ${task.predecessorCodes.join(", ")}` : "No predecessors."}
          </p>
        </section>

        <section className="mt-4">
          <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Trello</h3>
          <dl>
            <Field label="Sync status" value={task.trelloSyncStatus ?? "Not linked"} />
            <Field label="Card" value={task.trelloCardUrl ?? "—"} />
          </dl>
        </section>

        <p className="mt-6 rounded bg-neutral-50 px-2 py-1.5 text-[11px] text-neutral-500">
          Read-only preview. Editing is enabled once tasks are stored in Supabase.
        </p>
      </div>
    </aside>
  );
}

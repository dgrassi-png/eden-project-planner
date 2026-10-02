"use client";

import { useState } from "react";

import type { TaskRow } from "./types";

/** Tasks without a planned start. They have no bar until someone schedules them. */
export function UnscheduledTray({
  tasks,
  editable,
  onSelect,
}: {
  tasks: TaskRow[];
  editable: boolean;
  onSelect: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  if (!tasks.length) return null;
  return (
    <section aria-label="Unscheduled tasks" className="border-t border-neutral-200 bg-neutral-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-100"
      >
        <span aria-hidden>{open ? "▾" : "▸"}</span>
        Unscheduled ({tasks.length})
        <span className="font-normal text-neutral-500">
          {editable ? "· no planned start yet. Double-click a task's timeline row, or set the start in the task panel" : ""}
        </span>
      </button>
      {open ? (
        <ul className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto px-4 pb-2">
          {tasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onSelect(task.id)}
                className="rounded border border-dashed border-neutral-300 bg-white px-1.5 py-0.5 text-[11px] text-neutral-700 hover:border-neutral-500"
              >
                <span className="font-mono text-neutral-500">{task.edenCode}</span> {task.title}
                {task.plannedDurationDays !== null && !task.isMilestone ? (
                  <span className="text-neutral-400"> · {task.plannedDurationDays} wd</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

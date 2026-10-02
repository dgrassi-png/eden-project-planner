"use client";

import { useState } from "react";

import { Button, FormError, inputBaseClass, PanelSection } from "@/components/ui/form";
import { apiRequest } from "@/components/ui/apiClient";
import { useMutation } from "@/components/ui/useMutation";

import type { DatabasePlannerData, TaskRow } from "./types";

/** Finish-to-Start predecessors of a task (add / remove), plus read-only successors. */
export function DependencyEditor({ task, data }: { task: TaskRow; data: DatabasePlannerData }) {
  const [predecessorId, setPredecessorId] = useState("");
  const [lag, setLag] = useState("0");
  const mutation = useMutation();

  const existing = new Set(task.predecessors.map((p) => p.taskId));
  const candidates = data.rows.filter(
    (row): row is TaskRow =>
      row.kind === "task" &&
      row.id !== task.id &&
      !existing.has(row.id) &&
      row.id !== task.parentTaskId &&
      row.parentTaskId !== task.id,
  );

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!predecessorId) return;
    const lagDays = /^\d+$/.test(lag.trim()) ? Number(lag.trim()) : Number.NaN;
    if (Number.isNaN(lagDays)) return;
    const ok = await mutation.run(() =>
      apiRequest("POST", "/api/dependencies", { predecessorTaskId: predecessorId, successorTaskId: task.id, lagDays }),
    );
    if (ok) {
      setPredecessorId("");
      setLag("0");
    }
  }

  return (
    <PanelSection title="Dependencies (finish-to-start)">
      {task.predecessors.length ? (
        <ul className="space-y-1">
          {task.predecessors.map((p) => (
            <li key={p.dependencyId} className="flex items-center justify-between gap-2 text-xs">
              <span>
                After <span className="font-mono">{p.edenCode}</span>
                {p.lagDays ? <span className="text-neutral-500"> + {p.lagDays} wd lag</span> : null}
              </span>
              <button
                type="button"
                className="text-[11px] text-red-700 hover:underline disabled:text-neutral-400"
                disabled={mutation.busy}
                onClick={() => mutation.run(() => apiRequest("DELETE", `/api/dependencies/${p.dependencyId}`))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-neutral-500">No predecessors.</p>
      )}

      <form onSubmit={add} className="flex items-center gap-1.5">
        <select
          aria-label="Predecessor task"
          className={`${inputBaseClass} min-w-0 flex-1`}
          value={predecessorId}
          onChange={(e) => setPredecessorId(e.target.value)}
        >
          <option value="">Add predecessor…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.edenCode} · {c.title}
            </option>
          ))}
        </select>
        <input
          aria-label="Lag in working days"
          title="Lag (working days)"
          inputMode="numeric"
          className={`${inputBaseClass} w-12 text-right`}
          value={lag}
          onChange={(e) => setLag(e.target.value)}
        />
        <Button type="submit" disabled={!predecessorId || mutation.busy}>
          Add
        </Button>
      </form>
      <FormError message={mutation.error?.message ?? null} issues={mutation.error?.issues} />

      {task.successors.length ? (
        <p className="text-xs text-neutral-500">
          Successors: <span className="font-mono">{task.successors.map((s) => s.edenCode).join(", ")}</span>
        </p>
      ) : null}
    </PanelSection>
  );
}

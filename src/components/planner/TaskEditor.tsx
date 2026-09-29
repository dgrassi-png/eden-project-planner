"use client";

import { useState } from "react";

import { Button, FormError, FormField, inputClass, PanelSection } from "@/components/ui/form";
import { apiRequest } from "@/components/ui/apiClient";
import { useMutation } from "@/components/ui/useMutation";
import { computePlannedFinish } from "@/domain/planning/calendar";
import {
  GEOGRAPHIES,
  GEOGRAPHY_LABELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type Geography,
  type TaskPriority,
  type TaskStatus,
} from "@/domain/planning/constants";

import { DependencyEditor } from "./DependencyEditor";
import { SidePanel } from "./SidePanel";
import type { DatabasePlannerData, TaskRow } from "./types";

const WHOLE_NUMBER = /^\d+$/;

function parseOptionalInt(value: string): number | null | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return WHOLE_NUMBER.test(trimmed) ? Number(trimmed) : "invalid";
}

function finishPreview(start: string, duration: number | null | "invalid", isMilestone: boolean): string {
  if (duration === "invalid") return "—";
  try {
    return computePlannedFinish({ plannedStart: start || null, plannedDurationDays: duration, isMilestone }) ?? "TBD";
  } catch {
    return "Start must be a working day";
  }
}

/** Editable task details. The E:DEN code is shown but can never be edited. */
export function TaskEditor({
  task,
  data,
  onClose,
  onAddSubtask,
}: {
  task: TaskRow;
  data: DatabasePlannerData;
  onClose: () => void;
  onAddSubtask: (parentTaskId: string) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [workstreamId, setWorkstreamId] = useState(task.workstreamId ?? "");
  const [ownerMemberId, setOwnerMemberId] = useState(task.ownerMemberId ?? "");
  const [plannedStart, setPlannedStart] = useState(task.plannedStart ?? "");
  const [duration, setDuration] = useState(task.isMilestone || task.plannedDurationDays === null ? "" : String(task.plannedDurationDays));
  const [status, setStatus] = useState<TaskStatus>(task.status ?? "BACKLOG");
  const [priority, setPriority] = useState(task.priority ?? "");
  const [geography, setGeography] = useState(task.geography ?? "");
  const [isMilestone, setIsMilestone] = useState(task.isMilestone);
  const [progress, setProgress] = useState(task.progressPercent === null ? "" : String(task.progressPercent));
  const [localError, setLocalError] = useState<string | null>(null);
  const save = useMutation();
  const remove = useMutation();

  const parsedDuration = isMilestone ? 0 : parseOptionalInt(duration);
  const parsedProgress = parseOptionalInt(progress);

  function buildPatch(): Record<string, unknown> | null {
    if (parsedDuration === "invalid") return setLocalError("Duration must be a whole number of working days"), null;
    if (parsedProgress === "invalid") return setLocalError("Progress must be a whole number from 0 to 100"), null;
    const next: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || null,
      workstreamId: workstreamId || null,
      ownerMemberId: ownerMemberId || null,
      plannedStart: plannedStart || null,
      plannedDurationDays: parsedDuration,
      status,
      priority: (priority || null) as TaskPriority | null,
      geography: (geography || null) as Geography | null,
      isMilestone,
      progressPercent: parsedProgress,
    };
    const current: Record<string, unknown> = {
      title: task.title,
      description: task.description,
      workstreamId: task.workstreamId,
      ownerMemberId: task.ownerMemberId,
      plannedStart: task.plannedStart,
      plannedDurationDays: task.plannedDurationDays,
      status: task.status,
      priority: task.priority,
      geography: task.geography,
      isMilestone: task.isMilestone,
      progressPercent: task.progressPercent,
    };
    return Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== current[key]));
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setLocalError(null);
    const patch = buildPatch();
    if (!patch || !Object.keys(patch).length) return;
    await save.run(() => apiRequest("PATCH", `/api/tasks/${task.id}`, { ...patch, expectedUpdatedAt: task.updatedAt }));
  }

  async function onDelete() {
    if (!window.confirm(`Delete ${task.edenCode} "${task.title}"? This cannot be undone.`)) return;
    await remove.run(() => apiRequest("DELETE", `/api/tasks/${task.id}`), onClose);
  }

  return (
    <SidePanel
      eyebrow={
        <>
          {task.edenCode}
          {task.parentCode ? ` · subtask of ${task.parentCode}` : ""}
        </>
      }
      title={task.title}
      onClose={onClose}
    >
      <form onSubmit={onSave} className="space-y-3">
        <FormField label="Title">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
        </FormField>
        <FormField label="Description">
          <textarea className={`${inputClass} min-h-16`} value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>

        <div className="grid grid-cols-2 gap-2">
          <FormField label="Workstream" hint={task.parentTaskId ? "Follows the parent task" : undefined}>
            <select
              className={inputClass}
              value={workstreamId}
              onChange={(e) => setWorkstreamId(e.target.value)}
              disabled={task.parentTaskId !== null}
            >
              {data.workstreams.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Owner">
            <select className={inputClass} value={ownerMemberId} onChange={(e) => setOwnerMemberId(e.target.value)}>
              <option value="">TBD</option>
              {data.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <label className="flex items-center gap-2 text-xs text-neutral-700">
          <input
            type="checkbox"
            checked={isMilestone}
            disabled={task.hasSubtasks}
            onChange={(e) => setIsMilestone(e.target.checked)}
          />
          Milestone (zero duration)
          {task.hasSubtasks ? <span className="text-[11px] text-neutral-400">— not possible with subtasks</span> : null}
        </label>

        <div className="grid grid-cols-3 gap-2">
          <FormField label={isMilestone ? "Date" : "Planned start"} hint={isMilestone ? undefined : "Mon–Fri"}>
            <input type="date" className={inputClass} value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} />
          </FormField>
          <FormField label="Duration (wd)">
            <input
              inputMode="numeric"
              className={inputClass}
              value={isMilestone ? "0" : duration}
              onChange={(e) => setDuration(e.target.value)}
              disabled={isMilestone}
              placeholder="TBD"
            />
          </FormField>
          <FormField label="Planned finish" hint="Derived">
            <div className="py-1 text-xs tabular-nums text-neutral-700">{finishPreview(plannedStart, parsedDuration, isMilestone)}</div>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <FormField label="Status">
            <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Priority">
            <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">TBD</option>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Geography">
            <select className={inputClass} value={geography} onChange={(e) => setGeography(e.target.value)}>
              <option value="">TBD</option>
              {GEOGRAPHIES.map((g) => (
                <option key={g} value={g}>
                  {GEOGRAPHY_LABELS[g]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Progress %">
            <input inputMode="numeric" className={inputClass} value={progress} onChange={(e) => setProgress(e.target.value)} placeholder="Not tracked" />
          </FormField>
        </div>

        <FormError message={localError ?? save.error?.message ?? null} issues={localError ? [] : save.error?.issues} />
        <div className="flex items-center gap-2">
          <Button tone="primary" type="submit" disabled={save.busy}>
            {save.busy ? "Saving…" : "Save"}
          </Button>
          {task.parentTaskId === null && !task.isMilestone ? (
            <Button onClick={() => onAddSubtask(task.id)}>+ Subtask</Button>
          ) : null}
        </div>
      </form>

      <DependencyEditor task={task} data={data} />

      <PanelSection title="Trello">
        <p className="text-xs text-neutral-500">
          {task.trelloCardUrl ? task.trelloCardUrl : "Not linked"} · sync arrives in a later phase
        </p>
      </PanelSection>

      <div className="border-t border-neutral-100 pt-3">
        <FormError message={remove.error?.message ?? null} issues={remove.error?.issues} />
        <Button tone="danger" onClick={onDelete} disabled={remove.busy || task.hasSubtasks} className="mt-2">
          Delete task
        </Button>
        {task.hasSubtasks ? <p className="mt-1 text-[11px] text-neutral-400">Delete its subtasks first.</p> : null}
      </div>
    </SidePanel>
  );
}

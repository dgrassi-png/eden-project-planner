"use client";

import { useState } from "react";

import { Button, FormError, FormField, inputClass } from "@/components/ui/form";
import { apiRequest } from "@/components/ui/apiClient";
import { useMutation } from "@/components/ui/useMutation";
import { suggestNextSubtaskCode, suggestNextTaskCode } from "@/domain/planning/edenCode";

import { SidePanel } from "./SidePanel";
import type { DatabasePlannerData, TaskRow } from "./types";

/**
 * Creates a task or subtask. Only identity fields are asked for; planning
 * values stay TBD until someone validates them in the task editor.
 */
export function NewTaskPanel({
  data,
  initialParentTaskId,
  onClose,
  onCreated,
}: {
  data: DatabasePlannerData;
  initialParentTaskId: string | null;
  onClose: () => void;
  onCreated: (taskId: string) => void;
}) {
  const parents = data.rows.filter((r): r is TaskRow => r.kind === "task" && r.depth === 0 && !r.isMilestone);
  const [parentTaskId, setParentTaskId] = useState(initialParentTaskId ?? "");
  const [workstreamId, setWorkstreamId] = useState(data.workstreams[0]?.id ?? "");
  const [codeOverride, setCodeOverride] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [isMilestone, setIsMilestone] = useState(false);
  const mutation = useMutation();

  const parent = parents.find((p) => p.id === parentTaskId) ?? null;
  const prefix = data.workstreams.find((w) => w.id === workstreamId)?.code ?? "";
  const suggestion = parent
    ? suggestNextSubtaskCode(parent.edenCode, data.edenCodes)
    : prefix
      ? suggestNextTaskCode(prefix, data.edenCodes)
      : "";
  const edenCode = codeOverride ?? suggestion;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await mutation.run<{ id: string }>(
      () =>
        apiRequest("POST", `/api/projects/${data.project.id}/tasks`, {
          edenCode,
          title,
          isMilestone,
          ...(parent ? { parentTaskId: parent.id } : { workstreamId }),
        }),
      (task) => onCreated(task.id),
    );
  }

  return (
    <SidePanel title={parent ? `New subtask of ${parent.edenCode}` : "New task"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <FormField label="Parent task" hint="Leave empty for a top-level task">
          <select
            className={inputClass}
            value={parentTaskId}
            onChange={(e) => {
              setParentTaskId(e.target.value);
              setCodeOverride(null);
            }}
          >
            <option value="">—</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.edenCode} · {p.title}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Workstream">
          <select
            className={inputClass}
            value={parent ? (parent.workstreamId ?? "") : workstreamId}
            disabled={parent !== null}
            onChange={(e) => {
              setWorkstreamId(e.target.value);
              setCodeOverride(null);
            }}
          >
            {data.workstreams.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="E:DEN code" hint="Permanent: it cannot be changed after creation. Suggested from existing codes.">
          <input
            className={`${inputClass} font-mono uppercase`}
            value={edenCode}
            onChange={(e) => setCodeOverride(e.target.value.toUpperCase())}
            placeholder={parent ? `${parent.edenCode}.1` : "TEC-001"}
            required
          />
        </FormField>

        <FormField label="Title">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
        </FormField>

        <label className="flex items-center gap-2 text-xs text-neutral-700">
          <input type="checkbox" checked={isMilestone} onChange={(e) => setIsMilestone(e.target.checked)} />
          Milestone
        </label>

        <p className="text-[11px] text-neutral-500">
          Owner, dates, duration, priority and geography start as TBD. Set them once they are validated.
        </p>

        <FormError message={mutation.error?.message ?? null} issues={mutation.error?.issues} />
        <Button tone="primary" type="submit" disabled={mutation.busy || !edenCode || !title.trim()}>
          {mutation.busy ? "Creating…" : "Create"}
        </Button>
      </form>
    </SidePanel>
  );
}

"use client";

import { useEffect, useState } from "react";

import { Button, FormError, FormField, inputClass, PanelSection } from "@/components/ui/form";
import { apiRequest } from "@/components/ui/apiClient";
import { useMutation } from "@/components/ui/useMutation";
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from "@/domain/planning/constants";
import type { SubtaskMode, TrelloSettings } from "@/domain/trello/mapping";

interface Board {
  id: string;
  name: string;
  url: string;
  lists: { id: string; name: string }[];
  labels: { id: string; name?: string | null; color?: string | null }[];
  members: { id: string; fullName?: string | null; username: string }[];
}

type Option = { id: string; label: string };

export function TrelloSettingsForm({
  projectId,
  settings,
  workstreams,
  members,
}: {
  projectId: string;
  settings: TrelloSettings | null;
  workstreams: Option[];
  members: (Option & { trelloMemberId: string | null })[];
}) {
  const [board, setBoard] = useState<Board | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [subtaskMode, setSubtaskMode] = useState<SubtaskMode>(settings?.subtaskMode ?? "CHECKLIST");
  const [statusLists, setStatusLists] = useState<Partial<Record<TaskStatus, string>>>(settings?.statusLists ?? {});
  const [labels, setLabels] = useState<Record<string, string>>(settings?.workstreamLabels ?? {});
  const save = useMutation();
  const memberSave = useMutation();

  useEffect(() => {
    let cancelled = false;
    void apiRequest<Board>("GET", "/api/trello/board").then((result) => {
      if (cancelled) return;
      if (result.ok) setBoard(result.data);
      else setBoardError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (boardError) return <FormError message={`Could not read the Trello board: ${boardError}`} />;
  if (!board) return <p className="text-xs text-neutral-500">Reading the board from Trello…</p>;

  const labelName = (l: Board["labels"][number]) => l.name || `(${l.color ?? "no colour"})`;

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-xs text-neutral-600">
        Board: <a className="text-blue-700 hover:underline" href={board.url} target="_blank" rel="noreferrer">{board.name}</a> ·{" "}
        {board.lists.length} open lists, {board.labels.length} labels, {board.members.length} members (read live from Trello).
      </p>

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save.run(() => apiRequest("PUT", `/api/projects/${projectId}/trello-settings`, { subtaskMode, statusLists, workstreamLabels: labels }));
        }}
      >
        <PanelSection title="Status → list">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TASK_STATUSES.map((status) => (
              <FormField key={status} label={TASK_STATUS_LABELS[status]}>
                <select
                  className={inputClass}
                  value={statusLists[status] ?? ""}
                  onChange={(e) => setStatusLists({ ...statusLists, [status]: e.target.value })}
                >
                  <option value="">Not mapped (cannot sync)</option>
                  {board.lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </FormField>
            ))}
          </div>
        </PanelSection>

        <PanelSection title="Workstream → label">
          <div className="grid grid-cols-2 gap-2">
            {workstreams.map((w) => (
              <FormField key={w.id} label={w.label}>
                <select className={inputClass} value={labels[w.id] ?? ""} onChange={(e) => setLabels({ ...labels, [w.id]: e.target.value })}>
                  <option value="">No label</option>
                  {board.labels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {labelName(l)}
                    </option>
                  ))}
                </select>
              </FormField>
            ))}
            {workstreams.length === 0 ? <p className="text-xs text-neutral-500">No workstreams yet.</p> : null}
          </div>
        </PanelSection>

        <PanelSection title="Subtasks">
          <div className="flex gap-4 text-xs text-neutral-700">
            {(["CHECKLIST", "CARD"] as const).map((mode) => (
              <label key={mode} className="flex items-center gap-1.5">
                <input type="radio" name="subtaskMode" checked={subtaskMode === mode} onChange={() => setSubtaskMode(mode)} />
                {mode === "CHECKLIST" ? "Checklist items on the parent card" : "A card per subtask"}
              </label>
            ))}
          </div>
        </PanelSection>

        <FormError message={save.error?.message ?? null} issues={save.error?.issues} />
        <Button tone="primary" type="submit" disabled={save.busy}>
          {save.busy ? "Saving…" : settings ? "Save mapping" : "Connect board and save mapping"}
        </Button>
        {settings ? <p className="text-[11px] text-neutral-400">Last saved {settings.updatedAt}</p> : null}
      </form>

      <PanelSection title="People → Trello members">
        <table className="w-full text-xs">
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-neutral-100">
                <td className="py-1 pr-3 text-neutral-900">{m.label}</td>
                <td className="py-1">
                  <select
                    aria-label={`Trello member for ${m.label}`}
                    className={inputClass}
                    defaultValue={m.trelloMemberId ?? ""}
                    disabled={memberSave.busy}
                    onChange={(e) =>
                      void memberSave.run(() => apiRequest("PUT", `/api/members/${m.id}/trello`, { trelloMemberId: e.target.value || null }))
                    }
                  >
                    <option value="">Not mapped</option>
                    {board.members.map((tm) => (
                      <option key={tm.id} value={tm.id}>
                        {tm.fullName ? `${tm.fullName} (@${tm.username})` : `@${tm.username}`}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 ? <p className="text-xs text-neutral-500">No people yet (Team page).</p> : null}
        <FormError message={memberSave.error?.message ?? null} issues={memberSave.error?.issues} />
      </PanelSection>
    </div>
  );
}

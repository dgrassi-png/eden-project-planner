"use client";

import { useState } from "react";

import { Button, FormError, PanelSection } from "@/components/ui/form";
import { apiRequest } from "@/components/ui/apiClient";
import { useMutation } from "@/components/ui/useMutation";
import type { CascadePlan } from "@/domain/planning/scheduling";

import type { TaskRow } from "../types";

import { ImpactDialog } from "./ImpactDialog";
import { cascadeConfirmation } from "./types";

/**
 * Violated Finish-to-Start constraints around a task. Conflicts stay until
 * someone edits a task or explicitly cascades the successors.
 */
export function ConflictSection({ task }: { task: TaskRow }) {
  const incoming = task.predecessors.filter((p) => p.state === "violated");
  const outgoing = task.successors.filter((s) => s.state === "violated");
  const [plan, setPlan] = useState<CascadePlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const apply = useMutation();

  if (!incoming.length && !outgoing.length) return null;

  async function review() {
    setLoadError(null);
    const result = await apiRequest<CascadePlan>("GET", `/api/tasks/${task.id}/cascade`);
    if (result.ok) setPlan(result.data);
    else setLoadError(result.message);
  }

  return (
    <PanelSection title="Dependency conflicts">
      <ul className="space-y-1 text-xs text-red-800">
        {incoming.map((p) => (
          <li key={p.dependencyId}>
            ⚠ Starts {p.conflictDays} day(s) too early for <span className="font-mono">{p.edenCode}</span> (earliest {p.earliestStart})
          </li>
        ))}
        {outgoing.map((s) => (
          <li key={s.dependencyId}>
            ⚠ <span className="font-mono">{s.edenCode}</span> starts {s.conflictDays} day(s) before this task allows
          </li>
        ))}
      </ul>
      {outgoing.length ? (
        <Button onClick={() => void review()}>Review cascade of successors…</Button>
      ) : (
        <p className="text-[11px] text-neutral-500">Move this task, or cascade from its predecessor.</p>
      )}
      <FormError message={loadError} />
      {plan ? (
        <ImpactDialog
          title={`Cascade successors of ${task.edenCode}`}
          messages={[]}
          plan={plan}
          busy={apply.busy}
          error={apply.error}
          onCascade={() =>
            void apply.run(() => apiRequest("POST", `/api/tasks/${task.id}/cascade`, cascadeConfirmation(plan)), () => setPlan(null))
          }
          onCancel={() => setPlan(null)}
        />
      ) : null}
    </PanelSection>
  );
}

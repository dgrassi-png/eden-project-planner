"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { apiRequest, type ApiResult } from "@/components/ui/apiClient";
import type { Issue } from "@/domain/result";

import { ImpactDialog } from "./ImpactDialog";
import { cascadeConfirmation, type ImpactPreview } from "./types";

interface Pending {
  taskId: string;
  patch: Record<string, unknown>;
  expectedUpdatedAt: string | null;
  preview: ImpactPreview;
  resolve: (result: ApiResult<unknown>) => void;
}

/**
 * Saves a task change after checking its dependency impact. Without new
 * conflicts it saves directly. Otherwise it opens the impact dialog and waits
 * for an explicit choice: keep the conflict, cascade, or cancel.
 */
export function useImpactCheckedSave() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; issues: Issue[] } | null>(null);

  const patchTask = (taskId: string, body: Record<string, unknown>) => apiRequest("PATCH", `/api/tasks/${taskId}`, body);

  /** Resolves when the change was saved, cancelled (ok: false, message "cancelled") or failed. */
  async function save(taskId: string, patch: Record<string, unknown>, expectedUpdatedAt: string | null): Promise<ApiResult<unknown>> {
    const impact = await apiRequest<ImpactPreview>("POST", `/api/tasks/${taskId}/impact`, patch);
    if (!impact.ok) return impact;
    const body = { ...patch, ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}) };
    if (impact.data.created.length === 0) return patchTask(taskId, body);
    setError(null);
    return new Promise((resolve) => setPending({ taskId, patch: body, expectedUpdatedAt, preview: impact.data, resolve }));
  }

  async function finish(body: Record<string, unknown>) {
    if (!pending) return;
    setBusy(true);
    const result = await patchTask(pending.taskId, body);
    setBusy(false);
    if (!result.ok) {
      setError({ message: result.message, issues: result.issues });
      return;
    }
    pending.resolve(result);
    setPending(null);
    startTransition(() => router.refresh());
  }

  function cancel() {
    pending?.resolve({ ok: false, message: "cancelled", issues: [] });
    setPending(null);
  }

  const dialog: ReactNode = pending ? (
    <ImpactDialog
      title={`Dependency impact of changing ${pending.preview.edenCode}`}
      messages={pending.preview.messages}
      plan={pending.preview.cascade}
      busy={busy}
      error={error}
      keepLabel="Save and keep conflict"
      onKeep={() => void finish(pending.patch)}
      onCascade={() => void finish({ ...pending.patch, cascade: cascadeConfirmation(pending.preview.cascade) })}
      onCancel={cancel}
    />
  ) : null;

  return { save, dialog };
}

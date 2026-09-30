"use client";

import { useEffect, useRef } from "react";

import { Button, FormError } from "@/components/ui/form";
import type { Issue } from "@/domain/result";
import type { CascadePlan } from "@/domain/planning/scheduling";

/**
 * Dependency impact review. Nothing moves until the user picks an action:
 * keep the conflict (save only this change) or explicitly cascade the listed
 * successors. DONE / CANCELLED tasks are listed as blocked and never moved.
 */
export function ImpactDialog({
  title,
  messages,
  plan,
  busy,
  error,
  keepLabel,
  onKeep,
  onCascade,
  onCancel,
}: {
  title: string;
  messages: string[];
  plan: CascadePlan;
  busy: boolean;
  error: { message: string; issues: Issue[] } | null;
  /** Omit when there is no change of its own to keep (resolving existing conflicts). */
  keepLabel?: string;
  onKeep?: () => void;
  onCascade: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-neutral-900/30 p-4 pt-24">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="impact-title"
        tabIndex={-1}
        className="w-full max-w-xl space-y-3 rounded border border-neutral-300 bg-white p-4 shadow-lg outline-none"
      >
        <h2 id="impact-title" className="text-sm font-semibold text-neutral-900">
          {title}
        </h2>
        {messages.length ? (
          <ul className="space-y-1 text-xs text-red-800">
            {messages.map((m) => (
              <li key={m}>⚠ {m}</li>
            ))}
          </ul>
        ) : null}

        {plan.moves.length ? (
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Cascade would move</p>
            <table className="w-full text-xs">
              <thead className="text-left text-[11px] text-neutral-500">
                <tr>
                  <th className="py-0.5 font-medium">Task</th>
                  <th className="font-medium">From</th>
                  <th className="font-medium">To</th>
                  <th className="text-right font-medium">Shift</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {plan.moves.map((m) => (
                  <tr key={m.taskId} className="border-t border-neutral-100">
                    <td className="py-0.5 font-mono">{m.edenCode}</td>
                    <td>
                      {m.fromStart} → {m.fromFinish ?? "TBD"}
                    </td>
                    <td>
                      {m.toStart} → {m.toFinish ?? "TBD"}
                    </td>
                    <td className="text-right">+{m.shiftDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-neutral-500">No task can be moved automatically.</p>
        )}

        {plan.blocked.length ? (
          <p className="rounded bg-neutral-50 px-2 py-1.5 text-[11px] text-neutral-600">
            Not moved (completed history is protected):{" "}
            {plan.blocked.map((b) => `${b.edenCode} (${b.status}, ${b.conflictDays}-day conflict)`).join(", ")}
          </p>
        ) : null}

        <FormError message={error?.message ?? null} issues={error?.issues} />
        <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-100 pt-3">
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          {onKeep ? (
            <Button onClick={onKeep} disabled={busy}>
              {keepLabel ?? "Keep conflict"}
            </Button>
          ) : null}
          <Button tone="primary" onClick={onCascade} disabled={busy || plan.moves.length === 0}>
            {busy ? "Saving…" : `Cascade ${plan.moves.length} task${plan.moves.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

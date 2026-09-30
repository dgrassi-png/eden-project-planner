"use client";

import { useEffect, useState } from "react";

import { PanelSection } from "@/components/ui/form";
import { apiRequest } from "@/components/ui/apiClient";
import { describeAuditEvent } from "@/domain/planning/auditText";
import type { AuditEvent } from "@/domain/planning/types";

/** Recent changes of a task, from the audit log. */
export function TaskHistory({ taskId, version }: { taskId: string; version: string | null }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<AuditEvent[]>("GET", `/api/tasks/${taskId}/history`).then((result) => {
      if (cancelled) return;
      if (result.ok) setEvents(result.data);
      else setError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId, version]);

  return (
    <PanelSection title="History">
      {error ? <p className="text-[11px] text-red-700">{error}</p> : null}
      {!events && !error ? <p className="text-[11px] text-neutral-400">Loading…</p> : null}
      {events?.length === 0 ? <p className="text-[11px] text-neutral-400">No changes recorded.</p> : null}
      <ul className="space-y-1">
        {events?.slice(0, 15).map((event) => {
          const text = describeAuditEvent(event);
          return (
            <li key={event.id} className="text-[11px] leading-snug text-neutral-600">
              <span className="tabular-nums text-neutral-400">{event.createdAt.slice(0, 16).replace("T", " ")}</span>{" "}
              <span className="font-mono">{text.actor}</span> {text.summary.replace(/^(\w+) task .*$/, "$1")}
              {text.details.length ? `: ${text.details.join(", ")}` : ""}
              {text.via ? <span className="text-neutral-400"> ({text.via})</span> : null}
            </li>
          );
        })}
      </ul>
    </PanelSection>
  );
}

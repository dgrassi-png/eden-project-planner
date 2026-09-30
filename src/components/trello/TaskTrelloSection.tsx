"use client";

import { useState } from "react";

import { PanelSection, Button, FormError } from "@/components/ui/form";
import { apiRequest } from "@/components/ui/apiClient";
import { Badge } from "@/components/ui/Badge";
import { useMutation } from "@/components/ui/useMutation";
import type { TrelloSyncState } from "@/domain/planning/constants";

import { SyncPreview } from "./SyncPreview";

const STATE_LABEL: Record<TrelloSyncState, string> = {
  NOT_SYNCED: "Not synced",
  SYNC_PENDING: "Sync in progress",
  SYNCED: "Synced",
  SYNC_ERROR: "Sync error",
  OUT_OF_SYNC: "Changed since last sync",
};

export function TaskTrelloSection({
  taskId,
  isSubtask,
  cardUrl,
  state,
  lastError,
}: {
  taskId: string;
  isSubtask: boolean;
  cardUrl: string | null;
  state: TrelloSyncState | null;
  lastError: string | null;
}) {
  const [previewing, setPreviewing] = useState(false);
  const unlink = useMutation();
  return (
    <PanelSection title="Trello">
      <div className="flex items-center gap-2 text-xs">
        <Badge tone={state === "SYNCED" ? "green" : state === "SYNC_ERROR" ? "red" : state === "OUT_OF_SYNC" ? "amber" : "neutral"}>
          {state ? STATE_LABEL[state] : "—"}
        </Badge>
        {cardUrl ? (
          <a href={cardUrl} target="_blank" rel="noreferrer" className="truncate text-blue-700 hover:underline">
            Open card
          </a>
        ) : null}
      </div>
      {lastError ? <p className="text-[11px] text-red-700">{lastError}</p> : null}
      {previewing ? (
        <SyncPreview
          previewUrl={`/api/tasks/${taskId}/sync-trello`}
          previewMethod="POST"
          syncUrl={`/api/tasks/${taskId}/sync-trello`}
          wrapConfirm={(confirm) => ({ confirm })}
        />
      ) : (
        <div className="flex gap-2">
          <Button onClick={() => setPreviewing(true)}>{isSubtask ? "Preview sync" : "Preview sync of this task"}</Button>
          {cardUrl ? (
            <Button
              tone="danger"
              disabled={unlink.busy}
              onClick={() => {
                if (window.confirm("Forget the link to this card? The card stays in Trello; the next sync will re-link it by its EDEN_PLANNER_ID or create a new one if it was deleted.")) {
                  void unlink.run(() => apiRequest("DELETE", `/api/tasks/${taskId}/trello-link`));
                }
              }}
            >
              Unlink
            </Button>
          ) : null}
        </div>
      )}
      <FormError message={unlink.error?.message ?? null} />
    </PanelSection>
  );
}

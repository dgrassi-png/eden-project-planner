"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { Button, FormError } from "@/components/ui/form";
import { apiRequest } from "@/components/ui/apiClient";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { SyncAction, SyncPlan } from "@/domain/trello/mapping";
import type { Issue } from "@/domain/result";

interface SyncResult {
  taskId: string;
  edenCode: string;
  action: SyncAction;
  ok: boolean;
  message: string | null;
  cardUrl: string | null;
}

const ACTION_TONE: Record<SyncAction, BadgeTone> = {
  create: "blue",
  update: "amber",
  unchanged: "neutral",
  error: "red",
  skip: "neutral",
};

const ACTION_LABEL: Record<SyncAction, string> = {
  create: "will be created",
  update: "will be updated",
  unchanged: "unchanged",
  error: "mapping error",
  skip: "skipped",
};

/**
 * Dry-run first, then an explicit "Confirm sync". The confirmation repeats
 * the previewed plan; the server refuses if it no longer matches.
 */
export function SyncPreview({ previewUrl, syncUrl, previewMethod = "GET", wrapConfirm = (c) => c }: {
  previewUrl: string;
  syncUrl: string;
  previewMethod?: "GET" | "POST";
  wrapConfirm?: (confirm: { items: { taskId: string; action: SyncAction }[] }) => unknown;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [plan, setPlan] = useState<SyncPlan | null>(null);
  const [results, setResults] = useState<SyncResult[] | null>(null);
  const [error, setError] = useState<{ message: string; issues: Issue[] } | null>(null);
  const [busy, setBusy] = useState(true);

  const fetchPlan = useCallback(
    () => apiRequest<SyncPlan>(previewMethod, previewUrl, previewMethod === "POST" ? { dryRun: true } : undefined),
    [previewMethod, previewUrl],
  );

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchPlan>>) => {
    setBusy(false);
    if (result.ok) setPlan(result.data);
    else setError({ message: result.message, issues: result.issues });
  }, []);

  async function load() {
    setBusy(true);
    setError(null);
    apply(await fetchPlan());
  }

  useEffect(() => {
    let cancelled = false;
    void fetchPlan().then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchPlan, apply]);

  async function confirm() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    const items = plan.items.map((i) => ({ taskId: i.taskId, action: i.action }));
    const result = await apiRequest<SyncResult[]>("POST", syncUrl, wrapConfirm({ items }));
    setBusy(false);
    if (!result.ok) {
      setError({ message: result.message, issues: result.issues });
      return;
    }
    setResults(result.data);
    setPlan(null);
    startTransition(() => router.refresh());
  }

  if (results) {
    const failed = results.filter((r) => !r.ok);
    return (
      <div className="space-y-2 text-xs">
        <p role="status" className={failed.length ? "text-red-800" : "text-emerald-800"}>
          Sync finished: {results.filter((r) => r.ok && (r.action === "create" || r.action === "update")).length} written,{" "}
          {failed.length} failed.
        </p>
        <ul className="space-y-1">
          {results
            .filter((r) => r.action !== "unchanged" && r.action !== "skip")
            .map((r) => (
              <li key={r.taskId}>
                <span className="font-mono">{r.edenCode}</span> {r.ok ? "✓" : "✗"} {r.message ?? ""}{" "}
                {r.cardUrl ? (
                  <a href={r.cardUrl} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                    card
                  </a>
                ) : null}
              </li>
            ))}
        </ul>
        <Button onClick={() => { setResults(null); void load(); }}>Preview again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-xs">
      <FormError message={error?.message ?? null} issues={error?.issues} />
      {!plan ? (
        busy ? <p className="text-neutral-500">Preparing the dry-run…</p> : null
      ) : (
        <>
          <p className="tabular-nums text-neutral-800" data-testid="sync-counts">
            {plan.counts.unchanged} unchanged · {plan.counts.update} will be updated · {plan.counts.create} will be created ·{" "}
            {plan.counts.error} mapping error{plan.counts.error === 1 ? "" : "s"}
            {plan.counts.skip ? ` · ${plan.counts.skip} skipped` : ""}
          </p>
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
            {plan.items.map((item) => (
              <li key={item.taskId} className="border-t border-neutral-100 pt-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono">{item.edenCode}</span>
                  <span className="truncate text-neutral-700">{item.title}</span>
                  <span className="ml-auto">
                    <Badge tone={ACTION_TONE[item.action]}>{ACTION_LABEL[item.action]}</Badge>
                  </span>
                </div>
                {item.reason ? <p className="text-[11px] text-red-700">{item.reason}</p> : null}
                {item.warnings.map((w) => (
                  <p key={w} className="text-[11px] text-amber-800">
                    {w}
                  </p>
                ))}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button tone="primary" onClick={() => void confirm()} disabled={busy || plan.counts.create + plan.counts.update + plan.counts.error === 0}>
              {busy ? "Syncing…" : "Confirm sync"}
            </Button>
            <Button onClick={() => void load()} disabled={busy}>
              Refresh preview
            </Button>
          </div>
          <p className="text-[11px] text-neutral-400">Planner → Trello only. Cards are matched by EDEN_PLANNER_ID, never duplicated.</p>
        </>
      )}
    </div>
  );
}

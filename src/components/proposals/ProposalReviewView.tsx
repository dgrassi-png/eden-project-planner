"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, FormError, inputClass, PanelSection } from "@/components/ui/form";
import { apiRequest } from "@/components/ui/apiClient";
import { Badge } from "@/components/ui/Badge";
import { useMutation } from "@/components/ui/useMutation";
import type { ChangeProposal } from "@/domain/planning/types";
import type { DependencyCheck } from "@/domain/planning/scheduling";
import type { EntityDiff, ProposalIssue } from "@/domain/proposals/simulate";

interface Review {
  proposal: ChangeProposal;
  preview: { valid: boolean; issues: ProposalIssue[]; diffs: EntityDiff[]; newViolations: DependencyCheck[]; resolvedViolations: DependencyCheck[] } | null;
  fingerprint: string | null;
  payloadIssues: string[];
}

const KIND_LABEL: Record<EntityDiff["kind"], string> = {
  "task-create": "New task",
  "task-update": "Task change",
  "dependency-add": "New dependency",
  "dependency-update": "Dependency change",
  "dependency-remove": "Dependency removed",
};

export function ProposalReviewView({ review }: { review: Review }) {
  const router = useRouter();
  const { proposal, preview } = review;
  const [note, setNote] = useState("");
  const apply = useMutation();
  const reject = useMutation();
  const pending = proposal.status === "PENDING";

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={proposal.status === "APPLIED" ? "green" : proposal.status === "REJECTED" ? "neutral" : "amber"}>{proposal.status}</Badge>
        {proposal.reason ? <span className="text-neutral-700">Reason: {proposal.reason}</span> : null}
        {!pending ? (
          <span className="text-neutral-500">
            Reviewed by {proposal.reviewedBy} at {proposal.reviewedAt?.slice(0, 16).replace("T", " ")}
            {proposal.reviewNote ? ` · “${proposal.reviewNote}”` : ""}
          </span>
        ) : null}
      </div>

      {!pending ? (
        <p className="text-xs text-neutral-500">This proposal is closed. Its changes (if applied) are in the project history.</p>
      ) : review.payloadIssues.length ? (
        <FormError message="The proposal payload is not valid" issues={review.payloadIssues.map((m) => ({ code: "PROPOSAL_SCHEMA", message: m }))} />
      ) : preview ? (
        <>
          {preview.issues.length ? (
            <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
              <p className="font-semibold">This proposal cannot be applied to the current plan:</p>
              <ul className="mt-1 list-disc pl-4">
                {preview.issues.map((i) => (
                  <li key={`${i.change}-${i.code}-${i.message}`}>
                    Change {i.change}: {i.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <PanelSection title="Before → proposed">
            {preview.diffs.length === 0 ? <p className="text-xs text-neutral-500">No effective change.</p> : null}
            {preview.diffs.map((diff) => (
              <div key={`${diff.kind}-${diff.label}`} className="rounded border border-neutral-200 bg-white">
                <p className="border-b border-neutral-100 px-3 py-1.5 text-xs">
                  <span className="text-neutral-500">{KIND_LABEL[diff.kind]}</span> <span className="font-mono font-semibold">{diff.label}</span>
                </p>
                <table className="w-full text-xs">
                  <thead className="text-left text-[11px] text-neutral-500">
                    <tr>
                      <th className="px-3 py-1 font-medium">Field</th>
                      <th className="px-3 py-1 font-medium">Before</th>
                      <th className="px-3 py-1 font-medium">Proposed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.fields.map((f) => (
                      <tr key={f.field} className="border-t border-neutral-100 align-top">
                        <td className="px-3 py-1 text-neutral-600">{f.field}</td>
                        <td className="whitespace-pre-wrap px-3 py-1 text-neutral-500 line-through decoration-neutral-300">{f.before}</td>
                        <td className="whitespace-pre-wrap px-3 py-1 font-medium text-neutral-900">{f.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </PanelSection>

          <PanelSection title="Dependency impact">
            {preview.newViolations.length === 0 && preview.resolvedViolations.length === 0 ? (
              <p className="text-xs text-neutral-500">No dependency conflict is created or resolved.</p>
            ) : null}
            <ul className="space-y-1 text-xs">
              {preview.newViolations.map((v) => (
                <li key={v.dependencyId} className="text-red-800">
                  ⚠ Creates a {v.conflictDays}-day conflict: {v.successorCode} would start before {v.predecessorCode} allows (earliest {v.earliestStart}).
                  Successors are not moved; cascade explicitly in the planner if wanted.
                </li>
              ))}
              {preview.resolvedViolations.map((v) => (
                <li key={v.dependencyId} className="text-emerald-800">
                  ✓ Resolves the conflict {v.predecessorCode} → {v.successorCode}.
                </li>
              ))}
            </ul>
          </PanelSection>

          <div className="space-y-2 border-t border-neutral-200 pt-4">
            <FormError message={apply.error?.message ?? reject.error?.message ?? null} issues={apply.error?.issues ?? reject.error?.issues} />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                tone="primary"
                disabled={!preview.valid || apply.busy || !review.fingerprint}
                onClick={() =>
                  void apply.run(() => apiRequest("POST", `/api/change-proposals/${proposal.id}/apply`, { fingerprint: review.fingerprint }), () =>
                    router.refresh(),
                  )
                }
              >
                {apply.busy ? "Applying…" : "Apply"}
              </Button>
              <input
                aria-label="Rejection note"
                className={`${inputClass} max-w-sm`}
                placeholder="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
              />
              <Button
                tone="danger"
                disabled={reject.busy}
                onClick={() => void reject.run(() => apiRequest("POST", `/api/change-proposals/${proposal.id}/reject`, { note: note || null }))}
              >
                Reject
              </Button>
            </div>
            <p className="text-[11px] text-neutral-400">
              Apply writes every change and this decision in one step, recorded in the audit log under your name. Trello is not
              touched: sync it separately.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}

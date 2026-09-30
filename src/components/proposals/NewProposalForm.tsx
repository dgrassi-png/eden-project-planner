"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, FormError, FormField, inputClass, PanelSection } from "@/components/ui/form";
import { apiRequest } from "@/components/ui/apiClient";
import { useMutation } from "@/components/ui/useMutation";

const EXAMPLE = `{
  "summary": "Supplier delay on the BOM",
  "changes": [
    { "op": "update_task", "task": "SC-001", "set": { "plannedFinish": "2026-10-17", "blocker": "Supplier delivery moved" } }
  ]
}`;

/** Paste a proposal (e.g. from a ChatGPT or Claude chat), or ask a configured provider to draft one. */
export function NewProposalForm({ projectId, providers }: { projectId: string; providers: { id: "anthropic" | "openai"; label: string }[] }) {
  const router = useRouter();
  const [json, setJson] = useState("");
  const [source, setSource] = useState<"USER" | "CLAUDE" | "CHATGPT">("USER");
  const [reason, setReason] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [provider, setProvider] = useState(providers[0]?.id ?? "anthropic");
  const submit = useMutation();
  const draft = useMutation();
  const open = (data: unknown) => router.push(`/proposals/${(data as { id: string }).id}`);

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
      <PanelSection title="Submit a proposal (JSON)">
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            setParseError(null);
            let payload: unknown;
            try {
              payload = JSON.parse(json);
            } catch {
              setParseError("Not valid JSON");
              return;
            }
            void submit.run(() => apiRequest("POST", `/api/projects/${projectId}/change-proposals`, { source, reason: reason || null, payload }), open);
          }}
        >
          <textarea
            aria-label="Proposal JSON"
            className={`${inputClass} min-h-40 font-mono`}
            placeholder={EXAMPLE}
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Produced by">
              <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
                <option value="USER">Me</option>
                <option value="CLAUDE">Claude (pasted)</option>
                <option value="CHATGPT">ChatGPT (pasted)</option>
              </select>
            </FormField>
            <FormField label="Reason">
              <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
            </FormField>
          </div>
          <FormError message={parseError ?? submit.error?.message ?? null} issues={submit.error?.issues} />
          <Button type="submit" disabled={!json.trim() || submit.busy}>
            {submit.busy ? "Submitting…" : "Submit for review"}
          </Button>
        </form>
      </PanelSection>

      <PanelSection title="Draft with AI">
        {providers.length === 0 ? (
          <p className="text-xs text-neutral-500">
            No AI provider is configured on this server (optional). Agents can still submit proposals with their API token, and
            proposals can be pasted on the left.
          </p>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void draft.run(() => apiRequest("POST", `/api/projects/${projectId}/ai-draft`, { provider, instruction }), open);
            }}
          >
            <textarea
              aria-label="Instruction"
              className={`${inputClass} min-h-24`}
              placeholder="e.g. We received a two-week supplier delay on SC-001. Propose the plan changes."
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              maxLength={4000}
            />
            <div className="flex items-center gap-2">
              <select aria-label="Provider" className={`${inputClass} w-40`} value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={instruction.trim().length < 3 || draft.busy}>
                {draft.busy ? "Drafting…" : "Draft proposal"}
              </Button>
            </div>
            <FormError message={draft.error?.message ?? null} issues={draft.error?.issues} />
            <p className="text-[11px] text-neutral-400">The draft is stored as a pending proposal. Nothing is applied.</p>
          </form>
        )}
      </PanelSection>
    </div>
  );
}

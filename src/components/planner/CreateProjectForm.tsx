"use client";

import { useState } from "react";

import { Button, FormError, FormField, inputClass } from "@/components/ui/form";
import { apiRequest } from "@/components/ui/apiClient";
import { useMutation } from "@/components/ui/useMutation";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Shown when the planner database has no project yet. */
export function CreateProjectForm() {
  const [name, setName] = useState("");
  const [slugOverride, setSlugOverride] = useState<string | null>(null);
  const mutation = useMutation();
  const seed = useMutation();
  const slug = slugOverride ?? slugify(name);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await mutation.run(() => apiRequest("POST", "/api/projects", { name, slug }));
  }

  return (
    <div className="flex flex-wrap items-start gap-4 p-4">
      <div className="max-w-sm space-y-3 rounded border border-neutral-200 bg-white p-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Start from the E:DEN macro structure</h2>
          <p className="text-xs text-neutral-500">
            Creates the E:DEN project with its 10 workstreams and 16 macro tasks (GOV-001 … ROAD-001, with CERT-003 and EIMA-003
            as milestones). Only codes and titles: dates, durations, owners and dependencies stay TBD until the team validates them.
          </p>
        </div>
        <FormError message={seed.error?.message ?? null} issues={seed.error?.issues} />
        <Button tone="primary" disabled={seed.busy} onClick={() => void seed.run(() => apiRequest("POST", "/api/projects/seed-eden"))}>
          {seed.busy ? "Creating…" : "Create E:DEN master plan"}
        </Button>
      </div>
      <form onSubmit={submit} className="max-w-sm space-y-3 rounded border border-neutral-200 bg-white p-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Or create an empty project</h2>
          <p className="text-xs text-neutral-500">The planning database is ready, but no project exists yet.</p>
        </div>
        <FormField label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="E:DEN" required />
        </FormField>
        <FormField label="Slug" hint="Lowercase identifier used in URLs">
          <input className={`${inputClass} font-mono`} value={slug} onChange={(e) => setSlugOverride(e.target.value)} required />
        </FormField>
        <FormError message={mutation.error?.message ?? null} issues={mutation.error?.issues} />
        <Button type="submit" disabled={mutation.busy || !name.trim() || !slug}>
          Create empty project
        </Button>
      </form>
    </div>
  );
}

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

/** Shown when Supabase is configured but no project exists yet. */
export function CreateProjectForm() {
  const [name, setName] = useState("");
  const [slugOverride, setSlugOverride] = useState<string | null>(null);
  const mutation = useMutation();
  const slug = slugOverride ?? slugify(name);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await mutation.run(() => apiRequest("POST", "/api/projects", { name, slug }));
  }

  return (
    <div className="p-4">
      <form onSubmit={submit} className="max-w-sm space-y-3 rounded border border-neutral-200 bg-white p-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Create the planning project</h2>
          <p className="text-xs text-neutral-500">Supabase is connected, but no project exists yet.</p>
        </div>
        <FormField label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="E:DEN" required />
        </FormField>
        <FormField label="Slug" hint="Lowercase identifier used in URLs">
          <input className={`${inputClass} font-mono`} value={slug} onChange={(e) => setSlugOverride(e.target.value)} required />
        </FormField>
        <FormError message={mutation.error?.message ?? null} issues={mutation.error?.issues} />
        <Button tone="primary" type="submit" disabled={mutation.busy || !name.trim() || !slug}>
          Create project
        </Button>
      </form>
    </div>
  );
}

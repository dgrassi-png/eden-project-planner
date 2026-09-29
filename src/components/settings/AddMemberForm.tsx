"use client";

import { useState } from "react";

import { Button, FormError, inputBaseClass } from "@/components/ui/form";
import { apiRequest } from "@/components/ui/apiClient";
import { useMutation } from "@/components/ui/useMutation";

export function AddMemberForm({ projectId }: { projectId: string }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const mutation = useMutation();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const ok = await mutation.run(() =>
      apiRequest("POST", `/api/projects/${projectId}/members`, { displayName, email: email.trim() || null }),
    );
    if (ok) {
      setDisplayName("");
      setEmail("");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Name"
          className={`${inputBaseClass} w-56`}
          placeholder="Name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
        <input
          aria-label="Email"
          type="email"
          className={`${inputBaseClass} w-64`}
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button tone="primary" type="submit" disabled={mutation.busy || !displayName.trim()}>
          Add member
        </Button>
      </div>
      <FormError message={mutation.error?.message ?? null} issues={mutation.error?.issues} />
    </form>
  );
}

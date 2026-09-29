"use client";

import { useState } from "react";

import { Button, FormError, FormField, inputClass } from "@/components/ui/form";
import { apiRequest } from "@/components/ui/apiClient";
import { useMutation } from "@/components/ui/useMutation";

import { SidePanel } from "./SidePanel";
import type { DatabasePlannerData, WorkstreamRow } from "./types";

export function NewWorkstreamPanel({ data, onClose }: { data: DatabasePlannerData; onClose: () => void }) {
  const nextOrder =
    Math.max(0, ...data.rows.filter((r): r is WorkstreamRow => r.kind === "workstream").map((w) => w.sortOrder)) + 1;
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState(String(nextOrder));
  const mutation = useMutation();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await mutation.run(
      () =>
        apiRequest("POST", `/api/projects/${data.project.id}/workstreams`, {
          code,
          name,
          sortOrder: Number.parseInt(sortOrder, 10) || 0,
        }),
      onClose,
    );
  }

  return (
    <SidePanel title="New workstream" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <FormField label="Code" hint="Permanent, 2–10 uppercase letters/digits (e.g. TEC, CERT)">
          <input className={`${inputClass} font-mono uppercase`} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required />
        </FormField>
        <FormField label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </FormField>
        <FormField label="Order">
          <input inputMode="numeric" className={inputClass} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </FormField>
        <FormError message={mutation.error?.message ?? null} issues={mutation.error?.issues} />
        <Button tone="primary" type="submit" disabled={mutation.busy}>
          Create
        </Button>
      </form>
    </SidePanel>
  );
}

export function WorkstreamPanel({ workstream, onClose }: { workstream: WorkstreamRow; onClose: () => void }) {
  const [name, setName] = useState(workstream.name);
  const [sortOrder, setSortOrder] = useState(String(workstream.sortOrder));
  const save = useMutation();
  const remove = useMutation();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await save.run(() =>
      apiRequest("PATCH", `/api/workstreams/${workstream.id}`, { name, sortOrder: Number.parseInt(sortOrder, 10) || 0 }),
    );
  }

  async function onDelete() {
    if (!window.confirm(`Delete workstream ${workstream.code}?`)) return;
    await remove.run(() => apiRequest("DELETE", `/api/workstreams/${workstream.id}`), onClose);
  }

  return (
    <SidePanel eyebrow={workstream.code} title={workstream.name} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <FormField label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </FormField>
        <FormField label="Order">
          <input inputMode="numeric" className={inputClass} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </FormField>
        <FormError message={save.error?.message ?? null} issues={save.error?.issues} />
        <Button tone="primary" type="submit" disabled={save.busy}>
          Save
        </Button>
      </form>
      <div className="border-t border-neutral-100 pt-3">
        <FormError message={remove.error?.message ?? null} issues={remove.error?.issues} />
        <Button tone="danger" onClick={onDelete} disabled={remove.busy || workstream.taskCount > 0} className="mt-2">
          Delete workstream
        </Button>
        {workstream.taskCount > 0 ? <p className="mt-1 text-[11px] text-neutral-400">Only empty workstreams can be deleted.</p> : null}
      </div>
    </SidePanel>
  );
}

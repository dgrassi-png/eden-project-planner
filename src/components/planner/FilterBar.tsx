"use client";

import { inputBaseClass } from "@/components/ui/form";
import {
  GEOGRAPHIES,
  GEOGRAPHY_LABELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from "@/domain/planning/constants";

import { hasFilters, NO_FILTERS, type PlannerFilters } from "./filters";
import type { Option } from "./types";

const select = `${inputBaseClass} py-0.5`;

export function FilterBar({
  filters,
  onChange,
  members,
  workstreams,
  shown,
  total,
}: {
  filters: PlannerFilters;
  onChange: (next: PlannerFilters) => void;
  members: Option[];
  workstreams: Option[];
  shown: number;
  total: number;
}) {
  const set = <K extends keyof PlannerFilters>(key: K, value: PlannerFilters[K]) => onChange({ ...filters, [key]: value });
  const check = (key: "milestonesOnly" | "blockedOnly" | "conflictsOnly", label: string) => (
    <label className="flex items-center gap-1 text-xs text-neutral-700">
      <input type="checkbox" checked={filters[key]} onChange={(e) => set(key, e.target.checked)} />
      {label}
    </label>
  );
  return (
    <div role="search" className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-1.5">
      <input
        type="search"
        aria-label="Search tasks"
        placeholder="Search code, title, description"
        className={`${inputBaseClass} w-56 py-0.5`}
        value={filters.search}
        onChange={(e) => set("search", e.target.value)}
      />
      <select aria-label="Owner" className={select} value={filters.owner} onChange={(e) => set("owner", e.target.value)}>
        <option value="">Any owner</option>
        <option value="none">Owner TBD</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <select aria-label="Workstream" className={select} value={filters.workstream} onChange={(e) => set("workstream", e.target.value)}>
        <option value="">Any workstream</option>
        {workstreams.map((w) => (
          <option key={w.id} value={w.id}>
            {w.label}
          </option>
        ))}
      </select>
      <select aria-label="Status" className={select} value={filters.status} onChange={(e) => set("status", e.target.value as PlannerFilters["status"])}>
        <option value="">Any status</option>
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {TASK_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <select aria-label="Priority" className={select} value={filters.priority} onChange={(e) => set("priority", e.target.value as PlannerFilters["priority"])}>
        <option value="">Any priority</option>
        <option value="none">Priority TBD</option>
        {TASK_PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select aria-label="Geography" className={select} value={filters.geography} onChange={(e) => set("geography", e.target.value as PlannerFilters["geography"])}>
        <option value="">Any location</option>
        <option value="none">Location TBD</option>
        {GEOGRAPHIES.map((g) => (
          <option key={g} value={g}>
            {GEOGRAPHY_LABELS[g]}
          </option>
        ))}
      </select>
      <select aria-label="Schedule" className={select} value={filters.schedule} onChange={(e) => set("schedule", e.target.value as PlannerFilters["schedule"])}>
        <option value="">Scheduled or not</option>
        <option value="scheduled">Scheduled</option>
        <option value="partial">Start only (duration TBD)</option>
        <option value="unscheduled">Unscheduled</option>
      </select>
      {check("milestonesOnly", "Milestones")}
      {check("blockedOnly", "Blocked")}
      {check("conflictsOnly", "Conflicts")}
      {hasFilters(filters) ? (
        <>
          <button type="button" className="text-xs text-blue-700 hover:underline" onClick={() => onChange(NO_FILTERS)}>
            Clear
          </button>
          <span className="ml-auto text-xs tabular-nums text-neutral-500">
            {shown} of {total} tasks
          </span>
        </>
      ) : null}
    </div>
  );
}

"use client";

import { ZOOM_LEVELS, type ZoomLevel } from "@/domain/timeline/scale";

const ZOOM_LABELS: Record<ZoomLevel, string> = { week: "Week", month: "Month", quarter: "Quarter" };

export function PlannerToolbar({
  zoom,
  onZoomChange,
  onScrollToToday,
  unscheduledCount,
  onNewTask,
  onNewWorkstream,
  onSyncPreview,
  canCreateTask,
}: {
  zoom: ZoomLevel;
  onZoomChange: (zoom: ZoomLevel) => void;
  onScrollToToday: () => void;
  unscheduledCount: number;
  /** Undefined when editing is unavailable (read-only data). */
  onNewTask?: () => void;
  onNewWorkstream?: () => void;
  onSyncPreview?: () => void;
  canCreateTask: boolean;
}) {
  const editable = onNewTask !== undefined;
  const disabledHint = "Editing is not available for this data";
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-4 py-1.5">
      <div role="group" aria-label="Timeline zoom" className="flex rounded border border-neutral-300 p-0.5">
        {ZOOM_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            aria-pressed={zoom === level}
            onClick={() => onZoomChange(level)}
            className={[
              "rounded-sm px-2.5 py-0.5 text-xs",
              zoom === level ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100",
            ].join(" ")}
          >
            {ZOOM_LABELS[level]}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onScrollToToday}
        className="rounded border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
      >
        Today
      </button>

      <span className="mx-1 h-4 w-px bg-neutral-200" aria-hidden />

      <button
        type="button"
        onClick={onNewTask}
        disabled={!editable || !canCreateTask}
        title={!editable ? disabledHint : !canCreateTask ? "Create a workstream first" : undefined}
        className="rounded border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:border-neutral-200 disabled:text-neutral-400 disabled:hover:bg-transparent"
      >
        + Task
      </button>
      <button
        type="button"
        onClick={onNewWorkstream}
        disabled={!editable}
        title={!editable ? disabledHint : undefined}
        className="rounded border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:border-neutral-200 disabled:text-neutral-400 disabled:hover:bg-transparent"
      >
        + Workstream
      </button>
      <button
        type="button"
        onClick={onSyncPreview}
        disabled={!onSyncPreview}
        title="Dry-run of the Planner → Trello sync, then confirm"
        className="rounded border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:border-neutral-200 disabled:text-neutral-400 disabled:hover:bg-transparent"
      >
        Trello sync…
      </button>

      <span className="ml-auto text-xs text-neutral-500">
        Unscheduled: <span className="font-medium text-neutral-800">{unscheduledCount}</span>
      </span>
    </div>
  );
}

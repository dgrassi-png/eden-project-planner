"use client";

import { ZOOM_LEVELS, type ZoomLevel } from "@/domain/timeline/scale";

const ZOOM_LABELS: Record<ZoomLevel, string> = { week: "Week", month: "Month", quarter: "Quarter" };

export function PlannerToolbar({
  zoom,
  onZoomChange,
  onScrollToToday,
  unscheduledCount,
}: {
  zoom: ZoomLevel;
  onZoomChange: (zoom: ZoomLevel) => void;
  onScrollToToday: () => void;
  unscheduledCount: number;
}) {
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
        disabled
        title="Task editing arrives with the planning domain (Phase 01)"
        className="rounded border border-neutral-200 px-2.5 py-1 text-xs text-neutral-400"
      >
        + Task
      </button>
      <button
        type="button"
        disabled
        title="Trello sync preview arrives in Phase 04"
        className="rounded border border-neutral-200 px-2.5 py-1 text-xs text-neutral-400"
      >
        Sync preview
      </button>

      <span className="ml-auto text-xs text-neutral-500">
        Unscheduled: <span className="font-medium text-neutral-800">{unscheduledCount}</span>
      </span>
    </div>
  );
}

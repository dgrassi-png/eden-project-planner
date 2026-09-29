"use client";

import type { BarGeometry } from "@/domain/timeline/gantt";

import { formatDuration } from "../format";
import type { TaskRow } from "../types";

import { BAR_HEIGHT_PX, MILESTONE_SIZE_PX, STATUS_BAR, SUBTASK_BAR_HEIGHT_PX } from "./barStyles";
import type { DragHandlers, DragMode } from "./useBarDrag";

function describe(row: TaskRow, dates: { plannedStart: string | null; plannedFinish: string | null }): string {
  if (row.isMilestone) return `${row.edenCode} ${row.title} · milestone ${dates.plannedStart ?? "TBD"}`;
  return `${row.edenCode} ${row.title} · ${dates.plannedStart ?? "TBD"} → ${dates.plannedFinish ?? "TBD"} (${formatDuration(row)})`;
}

/**
 * One task on the timeline: bar, milestone diamond or start marker.
 * Position comes from `geometry`, derived from the task's dates, never
 * from the pointer directly.
 */
export function GanttBar({
  row,
  geometry,
  dates,
  top,
  selected,
  pending,
  editable,
  locked,
  moveHandlers,
  resizeHandlers,
  dragging,
  onKeyDown,
}: {
  row: TaskRow;
  geometry: BarGeometry;
  dates: { plannedStart: string | null; plannedFinish: string | null };
  top: number;
  selected: boolean;
  pending: boolean;
  editable: boolean;
  locked: boolean;
  moveHandlers: DragHandlers;
  resizeHandlers: DragHandlers;
  dragging: DragMode | null;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  const label = describe(row, dates);
  const interactive = editable && !locked;
  const colors = STATUS_BAR[row.status ?? "BACKLOG"];
  const common = {
    role: "button" as const,
    tabIndex: 0,
    "aria-label": `${label}${interactive ? ". Arrow keys move, Shift+arrow changes duration." : ""}`,
    title: locked ? `${label}\nLocked on the timeline (${row.status}). Edit in the task panel.` : label,
    onKeyDown,
    ...moveHandlers,
  };
  const ring = selected ? "ring-2 ring-blue-500 ring-offset-1" : "";
  const state = `${pending ? "opacity-60" : ""} ${dragging ? "shadow-lg" : ""}`;
  const cursor = interactive ? (dragging === "move" ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer";

  if (geometry.kind === "milestone") {
    return (
      <div
        {...common}
        className={`pointer-events-auto absolute touch-none outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${cursor} ${state}`}
        style={{ left: geometry.center - MILESTONE_SIZE_PX / 2, top: top - MILESTONE_SIZE_PX / 2, width: MILESTONE_SIZE_PX, height: MILESTONE_SIZE_PX }}
      >
        <div className={`h-full w-full rotate-45 rounded-[2px] bg-violet-600 ${ring}`} />
        <BarLabel text={`${row.edenCode} ${row.title}`} left={MILESTONE_SIZE_PX + 4} />
      </div>
    );
  }

  const height = row.depth > 0 ? SUBTASK_BAR_HEIGHT_PX : BAR_HEIGHT_PX;

  if (geometry.kind === "start-only") {
    return (
      <div
        {...common}
        className={`pointer-events-auto absolute flex touch-none items-center outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${cursor} ${state}`}
        style={{ left: geometry.left, top: top - height / 2, height }}
      >
        <div className={`h-full w-1 rounded-sm ${colors.bar} ${ring}`} />
        <div className="h-px w-8 border-t border-dashed border-neutral-400" />
        <BarLabel text={`${row.edenCode} · duration TBD`} left={44} />
      </div>
    );
  }

  return (
    <div
      {...common}
      className={`pointer-events-auto absolute touch-none rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${colors.bar} ${ring} ${cursor} ${state} ${row.status === "CANCELLED" ? "bg-[repeating-linear-gradient(135deg,transparent_0_4px,rgba(255,255,255,.5)_4px_8px)]" : ""}`}
      style={{ left: geometry.left, top: top - height / 2, width: Math.max(geometry.width, 2), height }}
    >
      {row.progressPercent !== null ? (
        <div className={`h-full rounded-l-[3px] ${colors.progress}`} style={{ width: `${row.progressPercent}%` }} aria-hidden />
      ) : null}
      {interactive ? (
        <div
          {...resizeHandlers}
          className="absolute inset-y-0 -right-1 w-2.5 cursor-ew-resize rounded-r-[3px] hover:bg-black/20"
          aria-hidden
        />
      ) : null}
      <BarLabel text={`${row.edenCode} ${row.title}`} left={Math.max(geometry.width, 2) + 6} />
    </div>
  );
}

function BarLabel({ text, left }: { text: string; left: number }) {
  return (
    <span
      className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm bg-white/80 px-0.5 text-[11px] text-neutral-600"
      style={{ left }}
    >
      {text}
    </span>
  );
}

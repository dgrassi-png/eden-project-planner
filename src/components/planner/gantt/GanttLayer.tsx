"use client";

import { arrowAnchors, barGeometry, dependencyPath, movedStart, previewDates, resizedDuration, type GanttTaskDates } from "@/domain/timeline/gantt";
import type { TimelineAxis } from "@/domain/timeline/scale";

import { ROW_HEIGHT_PX } from "../layout";
import type { PlannerRow, TaskRow } from "../types";

import { isLockedOnTimeline, MILESTONE_SIZE_PX } from "./barStyles";
import { GanttBar } from "./GanttBar";
import { useBarDrag, type DragMode } from "./useBarDrag";

export interface DateChange {
  plannedStart?: string;
  plannedDurationDays?: number;
}

/**
 * Bars, milestones and dependency arrows for the visible rows. Absolutely
 * positioned over the timeline, aligned with the row order of the table.
 */
export function GanttLayer({
  rows,
  axis,
  editable,
  selectedId,
  pendingDates,
  onSelect,
  onChangeDates,
}: {
  rows: PlannerRow[];
  axis: TimelineAxis;
  editable: boolean;
  selectedId: string | null;
  /** Optimistic dates for tasks with a save in flight. */
  pendingDates: Map<string, GanttTaskDates>;
  onSelect: (taskId: string) => void;
  onChangeDates: (row: TaskRow, change: DateChange) => void;
}) {
  const tasks = rows.flatMap((row, index) => (row.kind === "task" ? [{ row, index }] : []));
  const byId = new Map(tasks.map((t) => [t.row.id, t]));

  function proposeChange(row: TaskRow, dates: GanttTaskDates, mode: DragMode, deltaDays: number): DateChange | null {
    if (mode === "move") {
      const plannedStart = movedStart(dates, deltaDays);
      return plannedStart ? { plannedStart } : null;
    }
    const plannedDurationDays = resizedDuration(dates, deltaDays);
    return plannedDurationDays ? { plannedDurationDays } : null;
  }

  const datesOf = (row: TaskRow): GanttTaskDates => pendingDates.get(row.id) ?? row;

  const { drag, bind } = useBarDrag({
    pxPerDay: axis.pxPerDay,
    onClick: onSelect,
    onCommit: (taskId, mode, deltaDays) => {
      const entry = byId.get(taskId);
      if (!entry) return;
      const change = proposeChange(entry.row, datesOf(entry.row), mode, deltaDays);
      if (change) onChangeDates(entry.row, change);
    },
  });

  // Effective dates per task, including the live drag preview.
  const effective = new Map<string, GanttTaskDates>();
  for (const { row } of tasks) {
    const base = datesOf(row);
    const change = drag?.taskId === row.id ? proposeChange(row, base, drag.mode, drag.deltaDays) : null;
    effective.set(row.id, change ? previewDates(base, change) : base);
  }

  const centerY = (index: number) => index * ROW_HEIGHT_PX + ROW_HEIGHT_PX / 2;
  const geometryOf = (id: string) => {
    const dates = effective.get(id);
    return dates ? barGeometry(dates, axis.start, axis.pxPerDay) : null;
  };

  const arrows = tasks.flatMap(({ row, index }) =>
    row.predecessors.flatMap((link) => {
      const predecessor = byId.get(link.taskId);
      if (!predecessor) return [];
      const from = arrowAnchors(geometryOf(predecessor.row.id), MILESTONE_SIZE_PX / 2);
      const to = arrowAnchors(geometryOf(row.id), MILESTONE_SIZE_PX / 2);
      if (!from || !to) return [];
      return [
        {
          key: link.dependencyId,
          d: dependencyPath({ x: from.end, y: centerY(predecessor.index) }, { x: to.start, y: centerY(index) }, ROW_HEIGHT_PX),
          highlighted: selectedId === row.id || selectedId === predecessor.row.id,
          violated: link.state === "violated",
          title: link.state === "violated"
            ? `${predecessor.row.edenCode} → ${row.edenCode}: ${link.conflictDays}-day conflict (earliest start ${link.earliestStart})`
            : `${predecessor.row.edenCode} → ${row.edenCode}${link.lagDays ? ` (+${link.lagDays} wd lag)` : ""}`,
        },
      ];
    }),
  );

  function onBarKeyDown(row: TaskRow, event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      onSelect(row.id);
      return;
    }
    if (!editable || isLockedOnTimeline(row.status) || pendingDates.has(row.id)) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    const dates = datesOf(row);
    let change: DateChange | null = null;
    if (event.shiftKey) {
      if (!row.isMilestone && dates.plannedDurationDays !== null) {
        const next = Math.max(1, dates.plannedDurationDays + step);
        if (next !== dates.plannedDurationDays) change = { plannedDurationDays: next };
      }
    } else {
      const plannedStart = movedStart(dates, step);
      if (plannedStart) change = { plannedStart };
    }
    if (change) onChangeDates(row, change);
  }

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-10"
      style={{ width: axis.totalWidthPx, height: rows.length * ROW_HEIGHT_PX }}
    >
      <svg className="absolute inset-0 overflow-visible" width={axis.totalWidthPx} height={rows.length * ROW_HEIGHT_PX} aria-hidden>
        <defs>
          <marker id="gantt-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 8 4 L 0 8 z" className="fill-neutral-500" />
          </marker>
          <marker id="gantt-arrow-active" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 8 4 L 0 8 z" className="fill-blue-600" />
          </marker>
          <marker id="gantt-arrow-violated" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 8 4 L 0 8 z" className="fill-red-600" />
          </marker>
        </defs>
        {arrows.map((arrow) => (
          <path
            key={arrow.key}
            d={arrow.d}
            fill="none"
            strokeWidth={arrow.highlighted || arrow.violated ? 1.5 : 1}
            strokeDasharray={arrow.violated ? "4 2" : undefined}
            className={arrow.violated ? "stroke-red-600" : arrow.highlighted ? "stroke-blue-600" : "stroke-neutral-400"}
            markerEnd={`url(#${arrow.violated ? "gantt-arrow-violated" : arrow.highlighted ? "gantt-arrow-active" : "gantt-arrow"})`}
            data-violated={arrow.violated || undefined}
          >
            <title>{arrow.title}</title>
          </path>
        ))}
      </svg>

      {tasks.map(({ row, index }) => {
        const dates = effective.get(row.id) ?? row;
        const geometry = barGeometry(dates, axis.start, axis.pxPerDay);
        if (!geometry) return null;
        const locked = isLockedOnTimeline(row.status);
        const enabled = editable && !locked && !pendingDates.has(row.id);
        return (
          <GanttBar
            key={row.id}
            row={row}
            geometry={geometry}
            dates={dates}
            top={centerY(index)}
            selected={row.id === selectedId}
            pending={pendingDates.has(row.id)}
            editable={editable}
            locked={locked}
            moveHandlers={bind(row.id, "move", enabled)}
            resizeHandlers={bind(row.id, "resize", enabled && !row.isMilestone)}
            dragging={drag?.taskId === row.id ? drag.mode : null}
            onKeyDown={(event) => onBarKeyDown(row, event)}
          />
        );
      })}

      {drag && drag.deltaDays !== 0 ? <DragTooltip row={byId.get(drag.taskId)?.row} dates={effective.get(drag.taskId)} axis={axis} index={byId.get(drag.taskId)?.index ?? 0} /> : null}
    </div>
  );
}

function DragTooltip({
  row,
  dates,
  axis,
  index,
}: {
  row: TaskRow | undefined;
  dates: GanttTaskDates | undefined;
  axis: TimelineAxis;
  index: number;
}) {
  if (!row || !dates) return null;
  const geometry = barGeometry(dates, axis.start, axis.pxPerDay);
  if (!geometry) return null;
  const left = geometry.kind === "milestone" ? geometry.center : geometry.left;
  const text = row.isMilestone
    ? `${row.edenCode} → ${dates.plannedStart}`
    : `${row.edenCode} → ${dates.plannedStart} – ${dates.plannedFinish ?? "TBD"}${dates.plannedDurationDays ? ` (${dates.plannedDurationDays} wd)` : ""}`;
  return (
    <div
      role="status"
      className="absolute z-20 whitespace-nowrap rounded bg-neutral-900 px-1.5 py-0.5 text-[11px] text-white shadow"
      style={{ left, top: index === 0 ? ROW_HEIGHT_PX : index * ROW_HEIGHT_PX - 18 }}
    >
      {text}
    </div>
  );
}

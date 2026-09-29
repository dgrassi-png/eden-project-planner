"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { IsoDate } from "@/domain/timeline/dates";
import { buildTimelineAxis, type ZoomLevel } from "@/domain/timeline/scale";

import { isUnscheduled } from "./format";
import { HEADER_HEIGHT_PX, ROW_HEIGHT_PX, TABLE_WIDTH_PX } from "./layout";
import { NewTaskPanel } from "./NewTaskPanel";
import { PlannerToolbar } from "./PlannerToolbar";
import { TaskDrawer } from "./TaskDrawer";
import { TaskEditor } from "./TaskEditor";
import { TableHeaderCells, TaskCells, WorkstreamCells } from "./TaskTableCells";
import { TimelineHeader } from "./TimelineHeader";
import { TimelineOverlay } from "./TimelineOverlay";
import type { PlannerData, TaskRow, WorkstreamRow } from "./types";
import { NewWorkstreamPanel, WorkstreamPanel } from "./WorkstreamPanels";

type Panel =
  | { kind: "task"; id: string }
  | { kind: "workstream"; id: string }
  | { kind: "new-task"; parentTaskId: string | null }
  | { kind: "new-workstream" }
  | null;

/**
 * Planner surface: task hierarchy on the left, date-driven timeline on the
 * right, sharing one scroll container so rows stay aligned. The left table is
 * sticky, so horizontal scrolling only moves the timeline.
 *
 * Task bars, dependency arrows and drag/resize are added in the Gantt phase;
 * they must position themselves through the same `TimelineAxis`.
 */
export function PlannerWorkspace({ data, today }: { data: PlannerData; today: IsoDate }) {
  const [zoom, setZoom] = useState<ZoomLevel>("month");
  const [panel, setPanel] = useState<Panel>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const editable = data.source === "database";

  const axis = useMemo(() => buildTimelineAxis({ today, zoom }), [today, zoom]);
  const tasks = useMemo(() => data.rows.filter((row): row is TaskRow => row.kind === "task"), [data.rows]);
  const unscheduledCount = tasks.filter(isUnscheduled).length;

  const selectedTask = panel?.kind === "task" ? (tasks.find((t) => t.id === panel.id) ?? null) : null;
  const selectedWorkstream =
    panel?.kind === "workstream"
      ? (data.rows.find((r): r is WorkstreamRow => r.kind === "workstream" && r.id === panel.id) ?? null)
      : null;
  const selectedId = panel?.kind === "task" || panel?.kind === "workstream" ? panel.id : null;

  const scrollToToday = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || axis.todayOffsetPx === null) return;
    const visibleTimeline = scroller.clientWidth - TABLE_WIDTH_PX;
    scroller.scrollLeft = Math.max(0, axis.todayOffsetPx - visibleTimeline / 3);
  }, [axis]);

  useLayoutEffect(scrollToToday, [scrollToToday]);

  const closePanel = useCallback(() => setPanel(null), []);

  const renderPanel = () => {
    if (!panel) return null;
    if (data.source === "scaffold") {
      return selectedTask ? <TaskDrawer task={selectedTask} onClose={closePanel} /> : null;
    }
    switch (panel.kind) {
      case "task":
        return selectedTask ? (
          <TaskEditor
            key={`${selectedTask.id}:${selectedTask.updatedAt}`}
            task={selectedTask}
            data={data}
            onClose={closePanel}
            onAddSubtask={(parentTaskId) => setPanel({ kind: "new-task", parentTaskId })}
          />
        ) : null;
      case "workstream":
        return selectedWorkstream ? (
          <WorkstreamPanel key={`${selectedWorkstream.id}:${selectedWorkstream.name}`} workstream={selectedWorkstream} onClose={closePanel} />
        ) : null;
      case "new-task":
        return (
          <NewTaskPanel
            key={panel.parentTaskId ?? "top"}
            data={data}
            initialParentTaskId={panel.parentTaskId}
            onClose={closePanel}
            onCreated={(id) => setPanel({ kind: "task", id })}
          />
        );
      case "new-workstream":
        return <NewWorkstreamPanel data={data} onClose={closePanel} />;
    }
  };

  const activate = (next: Panel) => (event: React.KeyboardEvent | React.MouseEvent) => {
    if ("key" in event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
    }
    setPanel(next);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PlannerToolbar
        zoom={zoom}
        onZoomChange={setZoom}
        onScrollToToday={scrollToToday}
        unscheduledCount={unscheduledCount}
        onNewTask={editable ? () => setPanel({ kind: "new-task", parentTaskId: null }) : undefined}
        onNewWorkstream={editable ? () => setPanel({ kind: "new-workstream" }) : undefined}
        canCreateTask={editable && data.workstreams.length > 0}
      />

      <div className="flex min-h-0 flex-1">
        <div ref={scrollerRef} className="relative min-w-0 flex-1 overflow-auto bg-white">
          <div className="relative flex min-h-full flex-col" style={{ width: TABLE_WIDTH_PX + axis.totalWidthPx }}>
            {/* Sticky header: column titles + time axis */}
            <div className="sticky top-0 z-30 flex" style={{ height: HEADER_HEIGHT_PX }}>
              <div className="sticky left-0 z-10 shrink-0" style={{ width: TABLE_WIDTH_PX }}>
                <TableHeaderCells />
              </div>
              <TimelineHeader axis={axis} />
            </div>

            {/* Gridlines + today marker behind the rows */}
            <div className="absolute bottom-0" style={{ top: HEADER_HEIGHT_PX, left: TABLE_WIDTH_PX }}>
              <TimelineOverlay axis={axis} />
            </div>

            {data.rows.map((row) => {
              const selected = row.id === selectedId;
              const workstream = row.kind === "workstream";
              const interactive = !workstream || editable;
              const target: Panel = workstream ? { kind: "workstream", id: row.id } : { kind: "task", id: row.id };
              return (
                <div
                  key={row.id}
                  role={interactive ? "button" : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  aria-pressed={interactive ? selected : undefined}
                  onClick={interactive ? activate(target) : undefined}
                  onKeyDown={interactive ? activate(target) : undefined}
                  className={`group relative flex outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${interactive ? "cursor-pointer" : ""}`}
                  style={{ height: ROW_HEIGHT_PX }}
                >
                  <div className="sticky left-0 z-20 shrink-0" style={{ width: TABLE_WIDTH_PX }}>
                    {row.kind === "workstream" ? <WorkstreamCells row={row} /> : <TaskCells row={row} selected={selected} />}
                  </div>
                  <div
                    className={
                      workstream
                        ? "border-b border-neutral-200 bg-neutral-100/60"
                        : `border-b border-neutral-100 ${selected ? "bg-blue-50/50" : "group-hover:bg-neutral-50/70"}`
                    }
                    style={{ width: axis.totalWidthPx }}
                  />
                </div>
              );
            })}

            {/* Fills the remaining height so the sticky table column stays opaque below the last row */}
            <div className="flex flex-1">
              <div
                className="sticky left-0 z-20 shrink-0 border-r border-neutral-200 bg-white p-4 text-xs text-neutral-500"
                style={{ width: TABLE_WIDTH_PX }}
              >
                {data.rows.length === 0
                  ? "No workstreams yet. Create one to start adding tasks."
                  : tasks.length === 0
                    ? "No tasks yet."
                    : null}
              </div>
            </div>
          </div>
        </div>

        {renderPanel()}
      </div>
    </div>
  );
}

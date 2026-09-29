"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { IsoDate } from "@/domain/timeline/dates";
import { buildTimelineAxis, type ZoomLevel } from "@/domain/timeline/scale";

import { isUnscheduled } from "./format";
import { HEADER_HEIGHT_PX, ROW_HEIGHT_PX, TABLE_WIDTH_PX } from "./layout";
import { PlannerToolbar } from "./PlannerToolbar";
import { TaskDrawer } from "./TaskDrawer";
import { TableHeaderCells, TaskCells, WorkstreamCells } from "./TaskTableCells";
import { TimelineHeader } from "./TimelineHeader";
import { TimelineOverlay } from "./TimelineOverlay";
import type { PlannerData, TaskRow } from "./types";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const axis = useMemo(() => buildTimelineAxis({ today, zoom }), [today, zoom]);
  const tasks = useMemo(() => data.rows.filter((row): row is TaskRow => row.kind === "task"), [data.rows]);
  const selectedTask = tasks.find((task) => task.id === selectedId) ?? null;
  const unscheduledCount = tasks.filter(isUnscheduled).length;

  const scrollToToday = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || axis.todayOffsetPx === null) return;
    const visibleTimeline = scroller.clientWidth - TABLE_WIDTH_PX;
    scroller.scrollLeft = Math.max(0, axis.todayOffsetPx - visibleTimeline / 3);
  }, [axis]);

  useLayoutEffect(scrollToToday, [scrollToToday]);

  const closeDrawer = useCallback(() => setSelectedId(null), []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PlannerToolbar
        zoom={zoom}
        onZoomChange={setZoom}
        onScrollToToday={scrollToToday}
        unscheduledCount={unscheduledCount}
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

            {data.rows.map((row) =>
              row.kind === "workstream" ? (
                <div key={row.id} className="relative flex" style={{ height: ROW_HEIGHT_PX }}>
                  <div className="sticky left-0 z-20 shrink-0" style={{ width: TABLE_WIDTH_PX }}>
                    <WorkstreamCells row={row} />
                  </div>
                  <div className="border-b border-neutral-200 bg-neutral-100/60" style={{ width: axis.totalWidthPx }} />
                </div>
              ) : (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={row.id === selectedId}
                  onClick={() => setSelectedId(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(row.id);
                    }
                  }}
                  className="group relative flex cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                  style={{ height: ROW_HEIGHT_PX }}
                >
                  <div className="sticky left-0 z-20 shrink-0" style={{ width: TABLE_WIDTH_PX }}>
                    <TaskCells row={row} selected={row.id === selectedId} />
                  </div>
                  <div
                    className={`border-b border-neutral-100 ${row.id === selectedId ? "bg-blue-50/50" : "group-hover:bg-neutral-50/70"}`}
                    style={{ width: axis.totalWidthPx }}
                  />
                </div>
              ),
            )}

            {/* Fills the remaining height so the sticky table column stays opaque below the last row */}
            <div className="flex flex-1">
              <div
                className="sticky left-0 z-20 shrink-0 border-r border-neutral-200 bg-white p-4 text-xs text-neutral-500"
                style={{ width: TABLE_WIDTH_PX }}
              >
                {tasks.length === 0 ? "No tasks yet." : null}
              </div>
            </div>
          </div>
        </div>

        {selectedTask ? <TaskDrawer task={selectedTask} onClose={closeDrawer} /> : null}
      </div>
    </div>
  );
}

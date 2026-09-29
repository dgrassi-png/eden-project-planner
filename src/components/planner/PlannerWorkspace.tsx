"use client";

import { useRouter } from "next/navigation";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";

import { apiRequest } from "@/components/ui/apiClient";
import { nextWorkingDayOnOrAfter } from "@/domain/planning/calendar";
import { addDays, diffDays, type IsoDate } from "@/domain/timeline/dates";
import { previewDates, type GanttTaskDates } from "@/domain/timeline/gantt";
import { buildTimelineAxis, rangeForDates, type ZoomLevel } from "@/domain/timeline/scale";

import { isUnscheduled } from "./format";
import { GanttLayer, type DateChange } from "./gantt/GanttLayer";
import { HEADER_HEIGHT_PX, ROW_HEIGHT_PX, TABLE_WIDTH_PX } from "./layout";
import { NewTaskPanel } from "./NewTaskPanel";
import { NoticeBar, type Notice } from "./NoticeBar";
import { PlannerToolbar } from "./PlannerToolbar";
import { TaskDrawer } from "./TaskDrawer";
import { TaskEditor } from "./TaskEditor";
import { TableHeaderCells, TaskCells, WorkstreamCells } from "./TaskTableCells";
import { TimelineHeader } from "./TimelineHeader";
import { TimelineOverlay } from "./TimelineOverlay";
import type { PlannerData, TaskRow, WorkstreamRow } from "./types";
import { UnscheduledTray } from "./UnscheduledTray";
import { visibleRows, workstreamSpans } from "./visibleRows";
import { NewWorkstreamPanel, WorkstreamPanel } from "./WorkstreamPanels";

type Panel =
  | { kind: "task"; id: string }
  | { kind: "workstream"; id: string }
  | { kind: "new-task"; parentTaskId: string | null }
  | { kind: "new-workstream" }
  | null;

interface PendingSave {
  /** `updatedAt` of the row when the save started; the preview is shown until fresh data arrives. */
  baseUpdatedAt: string | null;
  dates: GanttTaskDates;
}

function describeChange(row: TaskRow, dates: GanttTaskDates): string {
  if (row.isMilestone) return `${row.edenCode} moved to ${dates.plannedStart}.`;
  return `${row.edenCode} now ${dates.plannedStart} → ${dates.plannedFinish ?? "TBD"}${
    dates.plannedDurationDays !== null ? ` (${dates.plannedDurationDays} working days)` : ""
  }. Successors were not moved.`;
}

/**
 * Planner surface: task hierarchy on the left, interactive Gantt on the right,
 * sharing one scroll container so rows stay aligned.
 *
 * The database is authoritative: dragging proposes a change, the API
 * validates and stores it, then the page re-reads planning data. Moving a task
 * never moves other tasks.
 */
export function PlannerWorkspace({ data, today }: { data: PlannerData; today: IsoDate }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [zoom, setZoom] = useState<ZoomLevel>("month");
  const [panel, setPanel] = useState<Panel>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<ReadonlyMap<string, PendingSave>>(new Map());
  const [notice, setNotice] = useState<Notice | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const editable = data.source === "database";

  const tasks = useMemo(() => data.rows.filter((row): row is TaskRow => row.kind === "task"), [data.rows]);
  const datesKey = tasks.flatMap((t) => [t.plannedStart, t.plannedFinish]).filter((d): d is string => d !== null).join(",");
  const axis = useMemo(() => {
    const dates = datesKey ? datesKey.split(",") : [];
    return buildTimelineAxis({ today, zoom, range: rangeForDates(today, zoom, dates) });
  }, [today, zoom, datesKey]);

  const rows = useMemo(() => visibleRows(data.rows, collapsed), [data.rows, collapsed]);
  const spans = useMemo(() => workstreamSpans(data.rows), [data.rows]);
  const unscheduled = tasks.filter(isUnscheduled);

  // Previews apply only while the row still has the version the save started from.
  const pendingDates = useMemo(() => {
    const map = new Map<string, GanttTaskDates>();
    for (const task of tasks) {
      const entry = pending.get(task.id);
      if (entry && entry.baseUpdatedAt === task.updatedAt) map.set(task.id, entry.dates);
    }
    return map;
  }, [pending, tasks]);

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

  // Scroll to today on first render and zoom change; keep the view stable when the range grows.
  const previousAxis = useRef<{ zoom: ZoomLevel; start: IsoDate } | null>(null);
  useLayoutEffect(() => {
    const previous = previousAxis.current;
    previousAxis.current = { zoom, start: axis.start };
    if (!previous || previous.zoom !== zoom) {
      scrollToToday();
    } else if (previous.start !== axis.start && scrollerRef.current) {
      scrollerRef.current.scrollLeft += diffDays(axis.start, previous.start) * axis.pxPerDay;
    }
  }, [zoom, axis.start, axis.pxPerDay, scrollToToday]);

  const closePanel = useCallback(() => setPanel(null), []);

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function changeDates(row: TaskRow, change: DateChange) {
    if (!editable) return;
    const dates = previewDates(pendingDates.get(row.id) ?? row, change);
    setPending((current) => new Map(current).set(row.id, { baseUpdatedAt: row.updatedAt, dates }));
    setNotice(null);
    const result = await apiRequest("PATCH", `/api/tasks/${row.id}`, { ...change, expectedUpdatedAt: row.updatedAt });
    if (!result.ok) {
      setPending((current) => {
        const next = new Map(current);
        next.delete(row.id);
        return next;
      });
      setNotice({ tone: "error", message: `${row.edenCode} not changed: ${result.message}` });
      startTransition(() => router.refresh());
      return;
    }
    setNotice({ tone: "info", message: describeChange(row, dates) });
    startTransition(() => router.refresh());
  }

  function scheduleAt(row: TaskRow, event: React.MouseEvent<HTMLDivElement>) {
    if (!editable || row.plannedStart !== null) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const day = Math.floor((event.clientX - rect.left) / axis.pxPerDay);
    const date = addDays(axis.start, day);
    void changeDates(row, { plannedStart: row.isMilestone ? date : nextWorkingDayOnOrAfter(date) });
  }

  function revealTask(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const workstreamRow = data.rows.find((r) => r.kind === "workstream" && r.id === task.workstreamId);
    const nextCollapsed = new Set(collapsed);
    if (workstreamRow) nextCollapsed.delete(workstreamRow.id);
    if (task.parentTaskId) nextCollapsed.delete(task.parentTaskId);
    setCollapsed(nextCollapsed);
    setPanel({ kind: "task", id: taskId });
    const index = visibleRows(data.rows, nextCollapsed).findIndex((r) => r.id === taskId);
    requestAnimationFrame(() => {
      const scroller = scrollerRef.current;
      if (scroller && index >= 0) scroller.scrollTop = Math.max(0, index * ROW_HEIGHT_PX - scroller.clientHeight / 3);
    });
  }

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

  const hintLeft = (axis.todayOffsetPx ?? 0) + 8;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PlannerToolbar
        zoom={zoom}
        onZoomChange={setZoom}
        onScrollToToday={scrollToToday}
        unscheduledCount={unscheduled.length}
        onNewTask={editable ? () => setPanel({ kind: "new-task", parentTaskId: null }) : undefined}
        onNewWorkstream={editable ? () => setPanel({ kind: "new-workstream" }) : undefined}
        canCreateTask={editable && data.workstreams.length > 0}
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollerRef} className="relative min-h-0 flex-1 overflow-auto bg-white">
            <div className="relative flex min-h-full flex-col" style={{ width: TABLE_WIDTH_PX + axis.totalWidthPx }}>
              {/* Sticky header: column titles + time axis */}
              <div className="sticky top-0 z-30 flex" style={{ height: HEADER_HEIGHT_PX }}>
                <div className="sticky left-0 z-10 shrink-0" style={{ width: TABLE_WIDTH_PX }}>
                  <TableHeaderCells />
                </div>
                <TimelineHeader axis={axis} />
              </div>

              {/* Gridlines, weekends and today marker behind the rows */}
              <div className="absolute bottom-0" style={{ top: HEADER_HEIGHT_PX, left: TABLE_WIDTH_PX }}>
                <TimelineOverlay axis={axis} />
              </div>

              <div className="relative">
                {rows.map((row) => {
                  const selected = row.id === selectedId;
                  const isWorkstream = row.kind === "workstream";
                  const interactive = !isWorkstream || editable;
                  const target: Panel = isWorkstream ? { kind: "workstream", id: row.id } : { kind: "task", id: row.id };
                  const span = isWorkstream ? spans.get(row.id) : undefined;
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
                        {row.kind === "workstream" ? (
                          <WorkstreamCells row={row} collapsed={collapsed.has(row.id)} onToggle={() => toggle(row.id)} />
                        ) : (
                          <TaskCells row={row} selected={selected} collapsed={collapsed.has(row.id)} onToggle={() => toggle(row.id)} />
                        )}
                      </div>
                      <div
                        className={
                          row.kind === "workstream"
                            ? "relative border-b border-neutral-200 bg-neutral-100/60"
                            : `relative border-b border-neutral-100 ${selected ? "bg-blue-50/50" : "group-hover:bg-neutral-50/70"}`
                        }
                        style={{ width: axis.totalWidthPx }}
                        onDoubleClick={row.kind === "task" ? (event) => scheduleAt(row, event) : undefined}
                      >
                        {span ? (
                          <div
                            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-neutral-500/70"
                            style={{
                              left: diffDays(axis.start, span.start) * axis.pxPerDay,
                              width: (diffDays(span.start, span.finish) + 1) * axis.pxPerDay,
                            }}
                            title={`${row.kind === "workstream" ? row.code : ""} span ${span.start} → ${span.finish} (scheduled tasks only)`}
                          />
                        ) : null}
                        {row.kind === "task" && row.plannedStart === null && !pendingDates.has(row.id) ? (
                          <span
                            className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] italic text-neutral-400"
                            style={{ left: hintLeft }}
                          >
                            Not scheduled{editable ? " · double-click to set start" : ""}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                <div className="absolute top-0" style={{ left: TABLE_WIDTH_PX }}>
                  <GanttLayer
                    rows={rows}
                    axis={axis}
                    editable={editable}
                    selectedId={selectedId}
                    pendingDates={pendingDates}
                    onSelect={(id) => setPanel({ kind: "task", id })}
                    onChangeDates={(row, change) => void changeDates(row, change)}
                  />
                </div>
              </div>

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

          <NoticeBar notice={notice} onDismiss={() => setNotice(null)} />
          <UnscheduledTray tasks={unscheduled} editable={editable} onSelect={revealTask} />
        </div>

        {renderPanel()}
      </div>
    </div>
  );
}

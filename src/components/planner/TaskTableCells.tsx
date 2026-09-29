import { COLUMNS, ROW_HEIGHT_PX } from "./layout";
import { formatDuration, formatStatus, TBD } from "./format";
import type { TaskRow, WorkstreamRow } from "./types";

const width = (key: (typeof COLUMNS)[number]["key"]) => COLUMNS.find((c) => c.key === key)?.widthPx ?? 0;

export function TableHeaderCells() {
  return (
    <div className="flex h-full items-end border-b border-r border-neutral-300 bg-white pb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
      {COLUMNS.map((column) => (
        <div key={column.key} className="shrink-0 px-2" style={{ width: column.widthPx }}>
          {column.label}
        </div>
      ))}
    </div>
  );
}

function Toggle({ collapsed, label, onToggle }: { collapsed: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] text-neutral-500 hover:bg-neutral-200"
    >
      {collapsed ? "▸" : "▾"}
    </button>
  );
}

export function WorkstreamCells({
  row,
  collapsed,
  onToggle,
}: {
  row: WorkstreamRow;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5 border-b border-r border-neutral-200 bg-neutral-100 px-2 text-xs font-semibold text-neutral-800"
      style={{ height: ROW_HEIGHT_PX }}
    >
      <Toggle collapsed={collapsed} label={`workstream ${row.code}`} onToggle={onToggle} />
      <span className="font-mono text-[11px] text-neutral-500">{row.code}</span>
      <span className="truncate">{row.name}</span>
      <span className="ml-auto text-[11px] font-normal text-neutral-400">{row.taskCount}</span>
    </div>
  );
}

export function TaskCells({
  row,
  selected,
  collapsed,
  onToggle,
}: {
  row: TaskRow;
  selected: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const muted = "text-neutral-400";
  return (
    <div
      className={[
        "flex items-center border-b border-r border-neutral-200 text-xs",
        selected ? "bg-blue-50" : "bg-white group-hover:bg-neutral-50",
      ].join(" ")}
      style={{ height: ROW_HEIGHT_PX }}
    >
      <div className="flex shrink-0 items-center gap-1.5 px-2" style={{ width: width("task"), paddingLeft: 8 + row.depth * 20 }}>
        {row.hasSubtasks ? (
          <Toggle collapsed={collapsed} label={`subtasks of ${row.edenCode}`} onToggle={onToggle} />
        ) : (
          <span className="w-4 shrink-0" aria-hidden />
        )}
        {row.isMilestone ? <span className="text-[10px] text-violet-600" aria-label="Milestone">◆</span> : null}
        <span className="shrink-0 font-mono text-[11px] text-neutral-500">{row.edenCode}</span>
        <span className="truncate text-neutral-900">{row.title}</span>
      </div>
      <div className={`shrink-0 truncate px-2 ${row.ownerName ? "" : muted}`} style={{ width: width("owner") }}>
        {row.ownerName ?? TBD}
      </div>
      <div
        className={`shrink-0 px-2 tabular-nums ${row.plannedDurationDays === null && !row.isMilestone ? muted : ""}`}
        style={{ width: width("duration") }}
      >
        {formatDuration(row)}
      </div>
      <div className={`shrink-0 truncate px-2 ${row.status ? "" : muted}`} style={{ width: width("status") }}>
        {formatStatus(row)}
      </div>
      <div
        className={`shrink-0 truncate px-2 font-mono text-[11px] ${row.predecessorCodes.length ? "" : muted}`}
        style={{ width: width("deps") }}
        title={row.predecessorCodes.join(", ")}
      >
        {row.predecessorCodes.length ? row.predecessorCodes.join(", ") : "—"}
      </div>
    </div>
  );
}

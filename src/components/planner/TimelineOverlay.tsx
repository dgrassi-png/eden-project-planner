import type { TimelineAxis } from "@/domain/timeline/scale";

/** Gridlines and today marker, drawn behind task rows. */
export function TimelineOverlay({ axis }: { axis: TimelineAxis }) {
  return (
    <div className="pointer-events-none absolute inset-y-0 left-0" style={{ width: axis.totalWidthPx }} aria-hidden>
      {axis.lower.map((segment) => (
        <div key={segment.key} className="absolute inset-y-0 border-l border-neutral-100" style={{ left: segment.offsetPx }} />
      ))}
      {axis.upper.map((segment) => (
        <div key={segment.key} className="absolute inset-y-0 border-l border-neutral-200" style={{ left: segment.offsetPx }} />
      ))}
      {axis.todayOffsetPx !== null ? (
        <div
          className="absolute inset-y-0 w-0.5 bg-red-500/80"
          style={{ left: axis.todayOffsetPx + axis.pxPerDay / 2 - 1 }}
          title="Today"
        />
      ) : null}
    </div>
  );
}

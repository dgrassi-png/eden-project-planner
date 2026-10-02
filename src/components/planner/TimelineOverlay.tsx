import { weekendPattern, type TimelineAxis } from "@/domain/timeline/scale";

/** Gridlines, weekend shading and today marker, drawn behind task rows. */
export function TimelineOverlay({ axis }: { axis: TimelineAxis }) {
  const weekend = axis.zoom === "week" ? weekendPattern(axis) : null;
  return (
    <div className="pointer-events-none absolute inset-y-0 left-0" style={{ width: axis.totalWidthPx }} aria-hidden>
      {weekend ? (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `repeating-linear-gradient(to right, rgb(245 245 245) 0 ${weekend.widthPx}px, transparent ${weekend.widthPx}px ${weekend.periodPx}px)`,
            backgroundPosition: `${weekend.firstSaturdayPx}px 0`,
          }}
        />
      ) : null}
      {axis.lower.map((segment) => (
        <div key={segment.key} className="absolute inset-y-0 border-l border-neutral-100" style={{ left: segment.offsetPx }} />
      ))}
      {axis.upper.map((segment) => (
        <div key={segment.key} className="absolute inset-y-0 border-l border-neutral-200" style={{ left: segment.offsetPx }} />
      ))}
      {axis.todayOffsetPx !== null ? (
        <div
          className="absolute inset-y-0 z-20 w-0.5 bg-red-500/80"
          style={{ left: axis.todayOffsetPx + axis.pxPerDay / 2 - 1 }}
          title="Today"
        />
      ) : null}
    </div>
  );
}

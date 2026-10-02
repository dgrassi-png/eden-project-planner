import type { AxisSegment, TimelineAxis } from "@/domain/timeline/scale";

import { HEADER_HEIGHT_PX, TABLE_WIDTH_PX } from "./layout";

function Tier({
  segments,
  className,
  stickyLabels = false,
}: {
  segments: AxisSegment[];
  className: string;
  /** Keep labels visible while their segment is partially scrolled out (coarse tier). */
  stickyLabels?: boolean;
}) {
  return (
    <div className={`relative h-1/2 ${className}`}>
      {segments.map((segment) => (
        <div
          key={segment.key}
          className="absolute top-0 flex h-full items-center overflow-clip border-l border-neutral-200 px-1.5"
          style={{ left: segment.offsetPx, width: segment.widthPx }}
          title={segment.start}
        >
          <span
            className={stickyLabels ? "sticky truncate" : "truncate"}
            style={stickyLabels ? { left: TABLE_WIDTH_PX + 6 } : undefined}
          >
            {segment.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TimelineHeader({ axis }: { axis: TimelineAxis }) {
  return (
    <div
      className="relative shrink-0 border-b border-neutral-300 bg-white"
      style={{ width: axis.totalWidthPx, height: HEADER_HEIGHT_PX }}
    >
      <Tier segments={axis.upper} className="border-b border-neutral-200 text-xs font-medium text-neutral-800" stickyLabels />
      <Tier segments={axis.lower} className="text-[11px] text-neutral-500" />
    </div>
  );
}

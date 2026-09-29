"use client";

import { useRef, useState } from "react";

import { dragDeltaDays } from "@/domain/timeline/gantt";

export type DragMode = "move" | "resize";

export interface DragState {
  taskId: string;
  mode: DragMode;
  deltaDays: number;
}

export interface DragHandlers {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
}

/** Pixels of movement before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD_PX = 3;

/**
 * Pointer-based drag for bars (move) and their finish handle (resize).
 * Reports whole-day deltas. The caller turns them into a date change and
 * persists it; nothing is written while dragging.
 */
export function useBarDrag({
  pxPerDay,
  onCommit,
  onClick,
}: {
  pxPerDay: number;
  onCommit: (taskId: string, mode: DragMode, deltaDays: number) => void;
  onClick: (taskId: string) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const origin = useRef<{ x: number; moved: boolean } | null>(null);

  function bind(taskId: string, mode: DragMode, enabled: boolean): DragHandlers {
    return {
      onPointerDown(event: React.PointerEvent<HTMLElement>) {
        if (event.button !== 0) return;
        event.stopPropagation();
        if (!enabled) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        origin.current = { x: event.clientX, moved: false };
        setDrag({ taskId, mode, deltaDays: 0 });
      },
      onPointerMove(event: React.PointerEvent<HTMLElement>) {
        const start = origin.current;
        if (!start || drag?.taskId !== taskId || drag.mode !== mode) return;
        const dx = event.clientX - start.x;
        if (Math.abs(dx) > DRAG_THRESHOLD_PX) start.moved = true;
        const deltaDays = dragDeltaDays(dx, pxPerDay);
        if (deltaDays !== drag.deltaDays) setDrag({ taskId, mode, deltaDays });
      },
      onPointerUp(event: React.PointerEvent<HTMLElement>) {
        event.stopPropagation();
        const start = origin.current;
        const current = drag;
        origin.current = null;
        setDrag(null);
        if (!start || !current || current.taskId !== taskId) {
          if (!enabled) onClick(taskId);
          return;
        }
        if (!start.moved) onClick(taskId);
        else if (current.deltaDays !== 0) onCommit(taskId, mode, current.deltaDays);
      },
      onPointerCancel() {
        origin.current = null;
        setDrag(null);
      },
    };
  }

  return { drag, bind };
}

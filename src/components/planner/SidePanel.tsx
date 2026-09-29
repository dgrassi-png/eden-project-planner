"use client";

import { useEffect, type ReactNode } from "react";

/** Right-hand planner panel (task details, create forms). Closes on Escape. */
export function SidePanel({
  eyebrow,
  title,
  onClose,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-neutral-200 bg-white">
      <div className="flex items-start justify-between gap-2 border-b border-neutral-200 px-4 py-3">
        <div className="min-w-0">
          {eyebrow ? <p className="font-mono text-xs text-neutral-500">{eyebrow}</p> : null}
          <h2 className="truncate text-sm font-semibold text-neutral-900">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="rounded px-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-3">{children}</div>
    </aside>
  );
}

import type { ReactNode } from "react";

import { getCurrentPrincipal } from "@/lib/auth/server";

import { SideNav } from "./SideNav";
import { UserMenu } from "./UserMenu";

function Brand() {
  return (
    <div className="flex items-center gap-2 leading-none">
      <span className="eden-brand-mark" style={{ width: 20, height: 20 }} aria-hidden />
      <span className="font-mono text-sm font-semibold tracking-tight text-white">E:DEN</span>
      <span className="text-xs text-neutral-400">Planner</span>
    </div>
  );
}

/**
 * Application frame: fixed sidebar on desktop, compact top bar on small
 * screens. Page content fills the remaining viewport and manages its own
 * scrolling (the planner needs full-height split panes).
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const principal = await getCurrentPrincipal().catch(() => null);
  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="hidden w-48 shrink-0 flex-col gap-6 border-r border-neutral-800 bg-neutral-900 px-3 py-4 md:flex">
        <div className="px-2.5">
          <Brand />
        </div>
        <SideNav orientation="vertical" />
        <div className="mt-auto space-y-3 px-2.5">
          <UserMenu principal={principal} />
          <p className="text-[11px] leading-snug text-neutral-500">
            Planner = source of truth
            <br />
            Trello = execution
          </p>
        </div>
      </aside>

      <header className="flex items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-900 px-3 py-2 md:hidden">
        <Brand />
        <SideNav orientation="horizontal" />
      </header>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}

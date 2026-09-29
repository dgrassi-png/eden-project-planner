"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isNavItemActive, NAV_ITEMS } from "./nav";

export function SideNav({ orientation }: { orientation: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  const vertical = orientation === "vertical";

  return (
    <nav aria-label="Primary" className={vertical ? "flex flex-col gap-0.5" : "flex gap-1"}>
      {NAV_ITEMS.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "rounded px-2.5 py-1.5 text-sm transition-colors",
              active
                ? "bg-neutral-800 font-medium text-white"
                : "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-100",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

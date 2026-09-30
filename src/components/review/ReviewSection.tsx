import Link from "next/link";

import { TASK_STATUS_LABELS } from "@/domain/planning/constants";
import type { ReviewItem } from "@/domain/planning/review";

/** Compact list of review items; each opens the task in the planner. */
export function ReviewSection({
  title,
  items,
  empty,
  tone = "neutral",
}: {
  title: string;
  items: (ReviewItem & { atRisk?: boolean })[];
  empty: string;
  tone?: "neutral" | "warn" | "bad" | "good";
}) {
  const accent = { neutral: "border-neutral-300", warn: "border-amber-500", bad: "border-red-600", good: "border-emerald-600" }[tone];
  return (
    <section className={`rounded border border-neutral-200 border-l-4 ${accent} bg-white`}>
      <h2 className="flex items-center justify-between border-b border-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-900">
        {title}
        <span className="font-normal tabular-nums text-neutral-500">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="px-3 py-2 text-xs text-neutral-400">{empty}</p>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {items.map((item) => (
              <tr key={`${title}-${item.taskId}`} className="border-t border-neutral-50 align-top first:border-t-0">
                <td className="w-24 whitespace-nowrap px-3 py-1 font-mono text-[11px]">
                  <Link href={{ pathname: "/planner", query: { task: item.taskId } }} className="text-blue-700 hover:underline">
                    {item.code}
                  </Link>
                </td>
                <td className="px-2 py-1 text-neutral-900">
                  {item.title}
                  {item.note ? <span className={`block text-[11px] ${item.atRisk ? "text-red-700" : "text-neutral-500"}`}>{item.note}</span> : null}
                </td>
                <td className="w-28 whitespace-nowrap px-2 py-1 text-neutral-600">{item.owner ?? <span className="text-neutral-400">TBD</span>}</td>
                <td className="w-40 whitespace-nowrap px-2 py-1 tabular-nums text-neutral-600">
                  {item.start ?? "TBD"} → {item.finish ?? "TBD"}
                </td>
                <td className="w-28 whitespace-nowrap px-3 py-1 text-neutral-600">
                  {TASK_STATUS_LABELS[item.status]}
                  {item.priority ? ` · ${item.priority}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

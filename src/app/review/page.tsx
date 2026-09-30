import type { Metadata } from "next";
import { connection } from "next/server";

import { PlannerErrorState } from "@/components/planner/StatusNotices";
import { ReviewSection } from "@/components/review/ReviewSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { PLANNING_TIME_ZONE } from "@/config/app";
import { todayInTimeZone } from "@/domain/timeline/dates";
import { requirePagePrincipal } from "@/lib/auth/server";
import { loadProjectPage } from "@/lib/planning/pageData";

export const metadata: Metadata = { title: "Weekly review" };

/** Operating review surface (Product Definition §29): objective conditions, no health score. */
export default async function ReviewPage({ searchParams }: PageProps<"/review">) {
  await connection();
  const today = todayInTimeZone(PLANNING_TIME_ZONE);
  const page = await loadProjectPage(await requirePagePrincipal("/review"), (await searchParams).project, (service, project) =>
    service.weeklyReview(project.id, today),
  );
  if (page.status === "error") return <PlannerErrorState message={page.message} />;
  if (page.status !== "ready") return <p className="p-4 text-xs text-neutral-500">Create the project from the Planner page first.</p>;
  const r = page.data;
  return (
    <>
      <PageHeader title="Weekly review" subtitle={`${page.project.name} · ${r.since} → ${r.today} (${PLANNING_TIME_ZONE})`} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid max-w-7xl items-start gap-3 xl:grid-cols-2">
          {r.blockedP0.length ? <ReviewSection title="P0 blocked" items={r.blockedP0} empty="" tone="bad" /> : null}
          <ReviewSection title="Slipping" items={r.slipping} empty="Nothing is behind its planned position." tone="bad" />
          <ReviewSection title="Blocked" items={r.blocked} empty="Nothing is blocked." tone="warn" />
          <ReviewSection title="Milestones (next 90 days and unscheduled)" items={r.milestones} empty="No milestone in the window." tone="neutral" />
          <ReviewSection title="Upcoming (next 14 days)" items={r.upcoming} empty="Nothing starts in the next two weeks." />
          <ReviewSection title="In progress" items={r.inProgress} empty="Nothing is in progress." />
          <ReviewSection title="Completed this week" items={r.completed} empty="Nothing was completed since the last review." tone="good" />
          <ReviewSection title="Decisions / waiting for" items={r.decisions} empty="Nothing is waiting for a decision." tone="warn" />
          <ReviewSection title="New this week (unplanned)" items={r.unplanned} empty="No new activity appeared." />
          <section className="rounded border border-l-4 border-neutral-200 border-l-red-600 bg-white">
            <h2 className="flex items-center justify-between border-b border-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-900">
              Dependency conflicts <span className="font-normal tabular-nums text-neutral-500">{r.violations.length}</span>
            </h2>
            {r.violations.length === 0 ? (
              <p className="px-3 py-2 text-xs text-neutral-400">Every finish-to-start constraint is met.</p>
            ) : (
              <ul className="space-y-0.5 px-3 py-2 text-xs text-red-800">
                {r.violations.map((v) => (
                  <li key={v.dependencyId}>
                    <span className="font-mono">{v.predecessorCode} → {v.successorCode}</span>: {v.conflictDays}-day conflict (earliest {v.earliestStart})
                  </li>
                ))}
              </ul>
            )}
          </section>
          <ReviewSection title="Data quality: no owner" items={r.dataQuality.noOwner} empty="Every open task has an owner." />
          <ReviewSection title="Data quality: no validated duration" items={r.dataQuality.noDuration} empty="Every open task has a duration." />
          <ReviewSection title="Data quality: no schedule" items={r.dataQuality.unscheduled} empty="Every open task has a start." />
        </div>
      </div>
    </>
  );
}

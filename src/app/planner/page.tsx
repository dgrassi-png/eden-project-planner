import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { CreateProjectForm } from "@/components/planner/CreateProjectForm";
import { PlannerWorkspace } from "@/components/planner/PlannerWorkspace";
import { PlannerErrorState } from "@/components/planner/StatusNotices";
import { toPlannerData } from "@/components/planner/viewModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { PLANNING_TIME_ZONE } from "@/config/app";
import { todayInTimeZone } from "@/domain/timeline/dates";
import { requirePagePrincipal } from "@/lib/auth/server";
import { loadProjectPage } from "@/lib/planning/pageData";

export const metadata: Metadata = { title: "Planner" };

export default async function PlannerPage({ searchParams }: PageProps<"/planner">) {
  // Render per request: "today" and planning data are always current.
  await connection();
  const today = todayInTimeZone(PLANNING_TIME_ZONE);
  const todayLabel = `Today ${today} (${PLANNING_TIME_ZONE})`;

  const query = await searchParams;
  const page = await loadProjectPage(await requirePagePrincipal("/planner"), query.project, async (service, project) =>
    toPlannerData(await service.getSnapshot(project.id)),
  );

  switch (page.status) {
    case "error":
      return (
        <>
          <PageHeader title="Master plan" subtitle={todayLabel} />
          <PlannerErrorState message={page.message} />
        </>
      );
    case "no_project":
      return (
        <>
          <PageHeader title="Master plan" subtitle={todayLabel} />
          <CreateProjectForm />
        </>
      );
    case "ready":
      return (
        <>
          <PageHeader
            title={page.project.name}
            subtitle={`${todayLabel} · Data source: planner database`}
            actions={
              page.projects.length > 1 ? (
                <nav aria-label="Projects" className="flex gap-2 text-xs">
                  {page.projects.map((p) => (
                    <Link
                      key={p.id}
                      href={{ pathname: "/planner", query: { project: p.slug } }}
                      className={p.id === page.project.id ? "font-semibold text-neutral-900" : "text-blue-700 hover:underline"}
                    >
                      {p.name}
                    </Link>
                  ))}
                </nav>
              ) : undefined
            }
          />
          <PlannerWorkspace data={page.data} today={today} initialTaskId={typeof query.task === "string" ? query.task : null} />
        </>
      );
  }
}

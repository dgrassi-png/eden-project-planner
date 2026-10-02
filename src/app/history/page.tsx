import type { Metadata } from "next";
import { connection } from "next/server";

import { PlannerErrorState } from "@/components/planner/StatusNotices";
import { PageHeader } from "@/components/ui/PageHeader";
import { describeAuditEvent } from "@/domain/planning/auditText";
import { requirePagePrincipal } from "@/lib/auth/server";
import { loadProjectPage } from "@/lib/planning/pageData";

export const metadata: Metadata = { title: "History" };

/** Project change history (audit log): who changed what, when, and through which path. */
export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  await connection();
  const page = await loadProjectPage(await requirePagePrincipal("/history"), (await searchParams).project, (service, project) =>
    service.history(project.id, { limit: 500 }),
  );
  if (page.status === "error") return <PlannerErrorState message={page.message} />;
  if (page.status !== "ready") return <p className="p-4 text-xs text-neutral-500">Create the project from the Planner page first.</p>;
  return (
    <>
      <PageHeader title="History" subtitle={`${page.project.name} · last ${page.data.length} changes (append-only audit log)`} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <table className="w-full max-w-6xl border border-neutral-200 bg-white text-xs">
          <thead className="bg-neutral-50 text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-1.5 font-medium">When (UTC)</th>
              <th className="px-3 py-1.5 font-medium">Actor</th>
              <th className="px-3 py-1.5 font-medium">Change</th>
              <th className="px-3 py-1.5 font-medium">Via</th>
            </tr>
          </thead>
          <tbody>
            {page.data.map((event) => {
              const text = describeAuditEvent(event);
              return (
                <tr key={event.id} className="border-t border-neutral-100 align-top">
                  <td className="whitespace-nowrap px-3 py-1 tabular-nums text-neutral-600">{event.createdAt.slice(0, 19).replace("T", " ")}</td>
                  <td className="whitespace-nowrap px-3 py-1 font-mono text-[11px]">{text.actor}</td>
                  <td className="px-3 py-1 text-neutral-900">
                    {text.summary}
                    {text.details.length ? <span className="block text-[11px] text-neutral-500">{text.details.join(" · ")}</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1 text-[11px] text-neutral-500">{text.via ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

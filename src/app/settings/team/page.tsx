import type { Metadata } from "next";
import { connection } from "next/server";

import { PlannerErrorState } from "@/components/planner/StatusNotices";
import { AddMemberForm } from "@/components/settings/AddMemberForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePagePrincipal } from "@/lib/auth/server";
import { loadProjectPage } from "@/lib/planning/pageData";

export const metadata: Metadata = { title: "Team" };

/** Project members, the people who can own tasks. */
export default async function TeamPage({ searchParams }: PageProps<"/settings/team">) {
  await connection();
  const page = await loadProjectPage(await requirePagePrincipal("/settings/team"), (await searchParams).project, (service, project) => service.listMembers(project.id));
  const header = <PageHeader title="Team" subtitle="People who can own planning tasks" />;

  if (page.status === "error") {
    return (
      <>
        {header}
        <PlannerErrorState message={page.message} />
      </>
    );
  }
  if (page.status !== "ready") {
    return (
      <>
        {header}
        <p className="p-4 text-xs text-neutral-500">
          {page.status === "not_configured"
            ? "Supabase is not configured. Members are stored in the database."
            : "Create the project from the Planner page first."}
        </p>
      </>
    );
  }

  const members = page.data;
  return (
    <>
      {header}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <table className="w-full max-w-2xl border border-neutral-200 bg-white text-xs">
          <thead className="bg-neutral-50 text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-1.5 font-medium">Name</th>
              <th className="px-3 py-1.5 font-medium">Email</th>
              <th className="px-3 py-1.5 font-medium">Trello member</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-3 text-neutral-500">
                  No members yet.
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.id} className="border-t border-neutral-100">
                  <td className="px-3 py-1.5 text-neutral-900">
                    {m.displayName}
                    {m.active ? null : <span className="ml-1 text-neutral-400">(inactive)</span>}
                  </td>
                  <td className="px-3 py-1.5 text-neutral-600">{m.email ?? "—"}</td>
                  <td className="px-3 py-1.5 text-neutral-400">{m.trelloMemberId ?? "Not mapped"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <AddMemberForm projectId={page.project.id} />
      </div>
    </>
  );
}

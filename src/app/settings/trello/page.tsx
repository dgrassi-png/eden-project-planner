import type { Metadata } from "next";
import { connection } from "next/server";

import { PlannerErrorState } from "@/components/planner/StatusNotices";
import { TrelloSettingsForm } from "@/components/trello/TrelloSettingsForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { TRELLO_BOARD_REFERENCE_URL } from "@/config/app";
import { requirePagePrincipal } from "@/lib/auth/server";
import { loadProjectPage } from "@/lib/planning/pageData";
import { getTrelloService } from "@/lib/trello/server";

export const metadata: Metadata = { title: "Trello" };

/** Planner → Trello mapping: lists per status, labels per workstream, members per person. */
export default async function TrelloSettingsPage({ searchParams }: PageProps<"/settings/trello">) {
  await connection();
  const principal = await requirePagePrincipal("/settings/trello");
  const page = await loadProjectPage(principal, (await searchParams).project, async (service, project) => {
    const trello = getTrelloService(principal, "settings");
    const [snapshot, settings] = await Promise.all([service.getSnapshot(project.id), trello.getSettings(project.id)]);
    return { snapshot, settings, configured: trello.configured };
  });
  const header = (
    <PageHeader
      title="Trello"
      subtitle={`Planner → Trello only. Target board: ${TRELLO_BOARD_REFERENCE_URL}. Trello never changes the plan.`}
    />
  );
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
        <p className="p-4 text-xs text-neutral-500">Create the project from the Planner page first.</p>
      </>
    );
  }
  const { snapshot, settings, configured } = page.data;
  return (
    <>
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {configured ? (
          <TrelloSettingsForm
            projectId={page.project.id}
            settings={settings}
            workstreams={snapshot.workstreams.map((w) => ({ id: w.id, label: `${w.code} · ${w.name}` }))}
            members={snapshot.members.map((m) => ({ id: m.id, label: m.displayName, trelloMemberId: m.trelloMemberId }))}
          />
        ) : (
          <div role="status" className="max-w-2xl rounded border border-neutral-200 bg-white px-4 py-3 text-xs text-neutral-700">
            <p className="font-semibold">Trello is not configured on this server.</p>
            <p className="mt-1">
              Set <code className="font-mono">TRELLO_API_KEY</code>, <code className="font-mono">TRELLO_API_TOKEN</code> and{" "}
              <code className="font-mono">TRELLO_BOARD_ID</code> in the server environment (never in the repository), then reload.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

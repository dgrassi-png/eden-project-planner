import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { PlannerErrorState } from "@/components/planner/StatusNotices";
import { NewProposalForm } from "@/components/proposals/NewProposalForm";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { getServerEnv } from "@/config/env.server";
import { proposalPayloadSchema } from "@/domain/proposals/schema";
import { getProposalService } from "@/lib/ai/server";
import { requirePagePrincipal } from "@/lib/auth/server";
import { loadProjectPage } from "@/lib/planning/pageData";

export const metadata: Metadata = { title: "Proposals" };

const TONE = { PENDING: "amber", APPLIED: "green", REJECTED: "neutral" } as const;

export default async function ProposalsPage({ searchParams }: PageProps<"/proposals">) {
  await connection();
  const principal = await requirePagePrincipal("/proposals");
  const page = await loadProjectPage(principal, (await searchParams).project, (_service, project) =>
    getProposalService({ kind: "user", principal }).list(project.id),
  );
  const header = (
    <PageHeader
      title="Change proposals"
      subtitle="ChatGPT, Claude and people propose; a person reviews BEFORE → PROPOSED and applies or rejects. Nothing changes before that."
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
  const env = getServerEnv();
  const providers = [
    ...(env.ANTHROPIC_API_KEY ? [{ id: "anthropic" as const, label: "Claude" }] : []),
    ...(env.OPENAI_API_KEY && env.OPENAI_MODEL ? [{ id: "openai" as const, label: "ChatGPT" }] : []),
  ];
  const summary = (payload: unknown) => {
    const parsed = proposalPayloadSchema.safeParse(payload);
    return parsed.success ? (parsed.data.summary ?? `${parsed.data.changes.length} change(s)`) : "Invalid payload";
  };

  return (
    <>
      {header}
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
        <table className="w-full max-w-5xl border border-neutral-200 bg-white text-xs">
          <thead className="bg-neutral-50 text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-1.5 font-medium">Submitted</th>
              <th className="px-3 py-1.5 font-medium">Source</th>
              <th className="px-3 py-1.5 font-medium">Summary / reason</th>
              <th className="px-3 py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {page.data.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-3 text-neutral-500">
                  No proposals yet.
                </td>
              </tr>
            ) : (
              page.data.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100">
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-neutral-600">{p.createdAt.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px]">{p.source}</td>
                  <td className="px-3 py-1.5">
                    <Link href={`/proposals/${p.id}`} className="text-blue-700 hover:underline">
                      {summary(p.payload)}
                    </Link>
                    {p.reason ? <p className="text-[11px] text-neutral-500">{p.reason}</p> : null}
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge tone={TONE[p.status]}>{p.status}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <NewProposalForm projectId={page.project.id} providers={providers} />
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";

import { PlannerErrorState } from "@/components/planner/StatusNotices";
import { ProposalReviewView } from "@/components/proposals/ProposalReviewView";
import { PageHeader } from "@/components/ui/PageHeader";
import { getProposalService } from "@/lib/ai/server";
import { requirePagePrincipal } from "@/lib/auth/server";
import { PlanningError } from "@/lib/planning/errors";

export const metadata: Metadata = { title: "Review proposal" };

export default async function ProposalPage({ params }: PageProps<"/proposals/[id]">) {
  await connection();
  const { id } = await params;
  const principal = await requirePagePrincipal(`/proposals/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let review;
  try {
    review = await getProposalService({ kind: "user", principal }).review(id);
  } catch (error) {
    if (error instanceof PlanningError && error.kind === "not_found") notFound();
    if (error instanceof PlanningError) return <PlannerErrorState message={error.message} />;
    throw error;
  }
  return (
    <>
      <PageHeader
        title="Review proposal"
        subtitle={`${review.proposal.source} · submitted ${review.proposal.createdAt.slice(0, 16).replace("T", " ")} by ${review.proposal.submittedBy ?? "?"}`}
        actions={
          <Link href="/proposals" className="text-xs text-blue-700 hover:underline">
            All proposals
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ProposalReviewView review={review} />
      </div>
    </>
  );
}

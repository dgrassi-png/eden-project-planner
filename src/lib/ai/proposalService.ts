import { createHash, randomUUID } from "node:crypto";

import type { ProposalState } from "@/domain/planning/constants";
import type { ChangeProposal } from "@/domain/planning/types";
import { buildAiContext, type AiContext } from "@/domain/proposals/context";
import { proposalPayloadSchema, type ProposalSource } from "@/domain/proposals/schema";
import { simulateProposal, type ProposalPreview } from "@/domain/proposals/simulate";
import { PlanningError } from "@/lib/planning/errors";
import type { PlanningService } from "@/lib/planning/service";
import type { PlanningStore } from "@/lib/planning/store";

export interface ProposalReview {
  proposal: ChangeProposal;
  /** Null when the stored payload no longer parses (e.g. submitted by an older release). */
  preview: Omit<ProposalPreview, "ops"> | null;
  /** Identifies the reviewed diff; `apply` refuses if the current diff differs. */
  fingerprint: string | null;
  payloadIssues: string[];
}

const fingerprintOf = (preview: ProposalPreview) =>
  createHash("sha256").update(JSON.stringify([preview.diffs, preview.issues])).digest("hex");

/**
 * AI change proposals: submit (agents or people), review (BEFORE → PROPOSED
 * diff + dependency impact against the current plan), apply or reject. Only
 * a person applies, and the planning writes, the proposal status and the
 * audit events go into one transaction.
 */
export class ProposalService {
  constructor(
    private readonly store: PlanningStore,
    private readonly planning: PlanningService,
  ) {}

  async submit(
    projectId: string,
    input: { source: ProposalSource; reason?: string | null; payload: unknown },
    submittedBy: string,
  ): Promise<ChangeProposal> {
    await this.planning.requireProject(projectId);
    const parsed = proposalPayloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      throw PlanningError.validation(
        parsed.error.issues.slice(0, 20).map((i) => ({
          code: "PROPOSAL_SCHEMA",
          message: `${i.path.map(String).join(".") || "payload"}: ${i.message}`,
        })),
      );
    }
    return this.store.createProposal({
      projectId,
      source: input.source,
      reason: input.reason?.trim() || null,
      payload: parsed.data,
      submittedBy,
    });
  }

  async list(projectId: string, status?: ProposalState): Promise<ChangeProposal[]> {
    await this.planning.requireProject(projectId);
    return this.store.listProposals(projectId, { status });
  }

  private async simulate(proposal: ChangeProposal): Promise<{ preview: ProposalPreview | null; payloadIssues: string[] }> {
    const parsed = proposalPayloadSchema.safeParse(proposal.payload);
    if (!parsed.success) return { preview: null, payloadIssues: parsed.error.issues.map((i) => i.message) };
    const snapshot = await this.planning.getSnapshot(proposal.projectId);
    return { preview: simulateProposal(snapshot, parsed.data, randomUUID), payloadIssues: [] };
  }

  async review(id: string): Promise<ProposalReview> {
    const proposal = await this.store.getProposal(id);
    if (!proposal) throw PlanningError.notFound("Proposal");
    if (proposal.status !== "PENDING") return { proposal, preview: null, fingerprint: null, payloadIssues: [] };
    const { preview, payloadIssues } = await this.simulate(proposal);
    if (!preview) return { proposal, preview: null, fingerprint: null, payloadIssues };
    const { ops: _ops, ...visible } = preview;
    void _ops;
    return { proposal, preview: visible, fingerprint: fingerprintOf(preview), payloadIssues };
  }

  async apply(id: string, reviewer: string, fingerprint: string): Promise<ChangeProposal> {
    const proposal = await this.store.getProposal(id);
    if (!proposal) throw PlanningError.notFound("Proposal");
    if (proposal.status !== "PENDING") throw PlanningError.conflict("This proposal was already reviewed", [{ code: "PROPOSAL_FINAL", message: "Already reviewed" }]);
    const { preview } = await this.simulate(proposal);
    if (!preview) throw PlanningError.validation([{ code: "PROPOSAL_SCHEMA", message: "The proposal payload is not valid" }]);
    if (fingerprintOf(preview) !== fingerprint) {
      throw PlanningError.conflict("The plan changed since you reviewed this proposal; review it again", [
        { code: "PROPOSAL_CHANGED", message: "The plan changed since the review" },
      ]);
    }
    if (!preview.valid) throw PlanningError.validation(preview.issues);
    await this.store.applyBatch(
      [...preview.ops, { kind: "reviewProposal", id, status: "APPLIED", reviewedBy: reviewer, reviewNote: null }],
      { proposal_id: id, proposal_source: proposal.source },
    );
    return (await this.store.getProposal(id)) as ChangeProposal;
  }

  async reject(id: string, reviewer: string, note: string | null): Promise<ChangeProposal> {
    const proposal = await this.store.getProposal(id);
    if (!proposal) throw PlanningError.notFound("Proposal");
    await this.store.applyBatch([{ kind: "reviewProposal", id, status: "REJECTED", reviewedBy: reviewer, reviewNote: note?.trim() || null }], {
      proposal_id: id,
    });
    return (await this.store.getProposal(id)) as ChangeProposal;
  }

  async context(projectId: string, today: string): Promise<AiContext> {
    const snapshot = await this.planning.getSnapshot(projectId);
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const [checks, proposals, audit] = await Promise.all([
      this.planning.scheduleChecks(projectId),
      this.store.listProposals(projectId, { status: "PENDING", limit: 50 }),
      this.store.listAuditEvents({ projectId, since, limit: 100 }),
    ]);
    return buildAiContext({ snapshot, checks, proposals, audit, today, now: new Date().toISOString() });
  }
}

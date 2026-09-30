import "server-only";

import { actorOfCaller, type Caller } from "@/lib/api/http";
import { getDatabase } from "@/lib/db/connection";
import { PlanningService } from "@/lib/planning/service";
import { createSqlitePlanningStore } from "@/lib/planning/sqliteStore";

import { ProposalService } from "./proposalService";

export function getProposalService(caller: Caller): ProposalService {
  const store = createSqlitePlanningStore(getDatabase(), actorOfCaller(caller));
  return new ProposalService(store, new PlanningService(store));
}

/** Identifier stored as `submitted_by` / `reviewed_by`. */
export const callerId = (caller: Caller) => (caller.kind === "user" ? caller.principal.edenUserId : `agent:${caller.agent}`);

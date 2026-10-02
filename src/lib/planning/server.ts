import "server-only";

import { getDatabase } from "@/lib/db/connection";

import type { Actor } from "./actor";
import { PlanningService } from "./service";
import { createSqlitePlanningStore } from "./sqliteStore";

/**
 * Planning service for the current request. Every write is audited with the
 * given actor (E:DEN user id). Throws PlanningError("unavailable") when the
 * database is missing, misconfigured or behind this release's schema.
 */
export function getPlanningService(actor: Actor): PlanningService {
  return new PlanningService(createSqlitePlanningStore(getDatabase(), actor));
}

import "server-only";

import { createSupabaseAdminClient, type Actor } from "@/lib/supabase/admin";

import { PlanningService } from "./service";
import { createSupabasePlanningStore } from "./supabaseStore";

/**
 * Until Supabase Auth is wired in, requests are attributed to an unidentified
 * USER. The audit trail still records every change.
 */
export const UNAUTHENTICATED_USER: Actor = { type: "USER", id: null };

export type PlanningBackend =
  | { status: "not_configured" }
  | { status: "ready"; service: PlanningService };

/** Planning service for the current request, or `not_configured` when Supabase is not set up. */
export function getPlanningBackend(actor: Actor = UNAUTHENTICATED_USER): PlanningBackend {
  const client = createSupabaseAdminClient(actor);
  if (!client) return { status: "not_configured" };
  return { status: "ready", service: new PlanningService(createSupabasePlanningStore(client)) };
}

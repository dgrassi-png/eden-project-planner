import "server-only";

import { createSupabaseAdminClient, type Actor } from "@/lib/supabase/admin";

import { PlanningService } from "./service";
import { createSupabasePlanningStore } from "./supabaseStore";

export type PlanningBackend =
  | { status: "not_configured" }
  | { status: "ready"; service: PlanningService };

/** Planning service for the current request, or `not_configured` when Supabase is not set up. */
/** The actor (E:DEN user id) is attributed to every write by the database audit trigger. */
export function getPlanningBackend(actor: Actor): PlanningBackend {
  const client = createSupabaseAdminClient(actor);
  if (!client) return { status: "not_configured" };
  return { status: "ready", service: new PlanningService(createSupabasePlanningStore(client)) };
}

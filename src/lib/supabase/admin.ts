import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/config/env.server";
import type { ActorType } from "@/domain/planning/constants";

import type { Database } from "./database.types";

export interface Actor {
  type: ActorType;
  /** Auth user / agent identifier when known. */
  id: string | null;
}

/**
 * Service-role Supabase client. BYPASSES RLS.
 *
 * Server-only, for trusted operations. Never pass this client, or data it
 * returns unfiltered, to Client Components. Returns `null` while not
 * configured.
 *
 * The actor is sent as request headers. The database audit trigger reads
 * them from `request.headers`, so every write is attributed atomically.
 */
export function createSupabaseAdminClient(actor: Actor): SupabaseClient<Database> | null {
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey } = getServerEnv();
  if (!url || !serviceRoleKey) return null;

  const headers: Record<string, string> = { "x-eden-actor-type": actor.type };
  if (actor.id) headers["x-eden-actor-id"] = actor.id;

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers },
  });
}

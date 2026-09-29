import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/config/env.server";

/**
 * Service-role Supabase client. BYPASSES RLS.
 *
 * Server-only, for trusted operations (audit writes, sync jobs, applying
 * approved proposals). Never pass this client, or data it returns unfiltered,
 * to Client Components. Returns `null` while not configured.
 */
export function createSupabaseAdminClient(): SupabaseClient | null {
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey } = getServerEnv();
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

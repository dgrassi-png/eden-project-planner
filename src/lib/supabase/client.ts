import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/config/env.public";

/**
 * Browser Supabase client (anon key, subject to RLS).
 * Returns `null` while Supabase is not configured so the UI can degrade
 * gracefully during bootstrap.
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey } = getPublicEnv();
  if (!url || !anonKey) return null;
  return createBrowserClient(url, anonKey);
}

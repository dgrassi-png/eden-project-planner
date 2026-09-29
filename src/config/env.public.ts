import { parsePublicEnv, type PublicEnv } from "./env.schema";

/**
 * Browser-safe configuration. Only `NEXT_PUBLIC_*` variables may appear here.
 *
 * Each variable is referenced statically so Next.js can inline it into the
 * client bundle (dynamic `process.env[name]` lookups are not inlined).
 */
let cached: PublicEnv | undefined;

export function getPublicEnv(): PublicEnv {
  cached ??= parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  return cached;
}

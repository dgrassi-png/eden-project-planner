import "server-only";

import { EnvValidationError } from "@/config/env.schema";
import { getAuthConfig } from "@/lib/auth/server";
import { EXPECTED_SCHEMA_VERSION } from "@/lib/planning/schemaVersion";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ReadinessReport {
  ready: boolean;
  checks: { configuration: boolean; authentication: string; database: boolean; schema: boolean };
  release: string | null;
}

/**
 * Readiness (deploy gate): configuration valid, authentication configured
 * for the environment, database reachable and schema up to date. Reports
 * booleans only, never values or error details.
 */
export async function checkReadiness(): Promise<ReadinessReport> {
  const report: ReadinessReport = {
    ready: false,
    checks: { configuration: false, authentication: "misconfigured", database: false, schema: false },
    release: process.env.EDEN_DEPLOY_SHA ?? null,
  };
  try {
    report.checks.authentication = getAuthConfig().mode;
    report.checks.configuration = true;
  } catch (error) {
    if (error instanceof EnvValidationError) return report;
    throw error;
  }

  const client = createSupabaseAdminClient({ type: "SYSTEM", id: "readiness-probe" });
  if (client) {
    try {
      const { data, error } = await client
        .from("planner_schema_version")
        .select("version")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      // A missing marker table means the database answered but migrations are not applied.
      const schemaMissing = error?.code === "PGRST205" || error?.code === "42P01";
      report.checks.database = !error || schemaMissing;
      report.checks.schema = !error && data !== null && data.version >= EXPECTED_SCHEMA_VERSION;
    } catch {
      report.checks.database = false;
    }
  }

  // Online (production build) the planner must run behind E:DEN Identity.
  const authOk = process.env.NODE_ENV !== "production" || report.checks.authentication === "identity";
  report.ready = report.checks.configuration && report.checks.database && report.checks.schema && authOk;
  return report;
}

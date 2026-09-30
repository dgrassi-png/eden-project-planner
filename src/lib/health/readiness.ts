import "server-only";

import { EnvValidationError } from "@/config/env.schema";
import { getAuthConfig } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/connection";
import { PlanningError } from "@/lib/planning/errors";

export interface ReadinessReport {
  ready: boolean;
  checks: { configuration: boolean; authentication: string; database: boolean; schema: boolean };
  release: string | null;
}

/**
 * Readiness (deploy gate): configuration valid, authentication configured
 * for the environment, database present and schema at this release's
 * version. Reports booleans only, never paths or error details.
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

  try {
    getDatabase().prepare("SELECT 1").get();
    report.checks.database = true;
    report.checks.schema = true;
  } catch (error) {
    if (!(error instanceof PlanningError)) throw error;
    // The file opened but the schema is behind this release.
    report.checks.database = error.message.includes("schema is at version");
  }

  // Online (production build) the planner must run behind E:DEN Identity.
  const authOk = process.env.NODE_ENV !== "production" || report.checks.authentication === "identity";
  report.ready = report.checks.configuration && report.checks.database && report.checks.schema && authOk;
  return report;
}

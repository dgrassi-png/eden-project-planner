import { checkReadiness } from "@/lib/health/readiness";

/** Readiness: configuration, authentication, database and schema version. 503 until all pass. */
export const dynamic = "force-dynamic";

export async function GET() {
  const report = await checkReadiness();
  return Response.json(report, { status: report.ready ? 200 : 503, headers: { "cache-control": "no-store" } });
}

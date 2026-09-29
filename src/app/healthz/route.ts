/**
 * Liveness: the process is up. Deliberately does not touch the database, so
 * it never flaps because of an external dependency (Natura convention).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok", service: "planner", release: process.env.EDEN_DEPLOY_SHA ?? null },
    { headers: { "cache-control": "no-store" } },
  );
}

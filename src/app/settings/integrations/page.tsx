import type { Metadata } from "next";
import { connection } from "next/server";

import { IntegrationCard } from "@/components/settings/IntegrationCard";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { TRELLO_BOARD_REFERENCE_URL } from "@/config/app";
import { EnvValidationError, type ServerEnv } from "@/config/env.schema";
import { getServerEnv } from "@/config/env.server";
import { getIntegrationStatuses, type IntegrationStatus } from "@/lib/integrations/status";

export const metadata: Metadata = { title: "Integrations" };

function byId(statuses: IntegrationStatus[], id: IntegrationStatus["id"]): IntegrationStatus {
  const status = statuses.find((s) => s.id === id);
  if (!status) throw new Error(`Missing integration status: ${id}`);
  return status;
}

export default async function IntegrationsPage() {
  // Configuration is read at request time, never baked into the build.
  await connection();

  let env: ServerEnv;
  try {
    env = getServerEnv();
  } catch (error) {
    if (!(error instanceof EnvValidationError)) throw error;
    return (
      <>
        <PageHeader title="Integrations" />
        <div className="p-4">
          <div role="alert" className="max-w-3xl rounded border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900">
            <p className="font-semibold">Invalid environment configuration</p>
            <p className="mt-1">
              Fix these variables in <code className="font-mono">.env.local</code> (or the deployment environment):{" "}
              <span className="font-mono">{error.invalidKeys.join(", ")}</span>
            </p>
          </div>
        </div>
      </>
    );
  }

  const statuses = getIntegrationStatuses(env);

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="Configuration status only. Secret values are never displayed or sent to the browser."
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
          <IntegrationCard
            status={byId(statuses, "supabase")}
            description="Postgres database and authentication. The planner database is the planning source of truth."
          >
            <p className="text-[11px] text-neutral-500">
              Apply <code className="font-mono">supabase/migrations</code> to the project. Planning data is read and
              written server-side with the service-role key. The browser never talks to the database directly. Sign-in
              is not enabled yet.
            </p>
          </IntegrationCard>

          <IntegrationCard
            status={byId(statuses, "trello")}
            description={
              <>
                Execution layer. Sync is one-way (Planner → Trello), idempotent, and always previewed before
                it runs. Target board:{" "}
                <a
                  href={TRELLO_BOARD_REFERENCE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-700 hover:underline"
                >
                  {TRELLO_BOARD_REFERENCE_URL}
                </a>
              </>
            }
          >
            <p className="text-[11px] text-neutral-500">Sync is not implemented yet (Phase 04).</p>
          </IntegrationCard>

          <IntegrationCard
            status={byId(statuses, "ai")}
            description="Optional. ChatGPT, Claude and other agents can submit change proposals. They never write planning data directly. The planner works fully without any AI key."
          >
            <div className="flex items-center justify-between border-t border-neutral-100 pt-2 text-xs">
              <span className="font-mono text-[11px] text-neutral-800">AI_MUTATIONS_REQUIRE_APPROVAL</span>
              {env.AI_MUTATIONS_REQUIRE_APPROVAL ? (
                <Badge tone="green">true: human approval required</Badge>
              ) : (
                <Badge tone="red">false: approval disabled</Badge>
              )}
            </div>
            <p className="text-[11px] text-neutral-500">The proposal and approval workflow ships in Phase 05.</p>
          </IntegrationCard>
        </div>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import { connection } from "next/server";

import { PlannerWorkspace } from "@/components/planner/PlannerWorkspace";
import { SCAFFOLD_PLANNER_DATA } from "@/components/planner/scaffold";
import { ScaffoldNotice } from "@/components/planner/ScaffoldNotice";
import { PageHeader } from "@/components/ui/PageHeader";
import { PLANNING_TIME_ZONE } from "@/config/app";
import { todayInTimeZone } from "@/domain/timeline/dates";

export const metadata: Metadata = { title: "Planner" };

export default async function PlannerPage() {
  // Render per request so "today" is always current.
  await connection();
  const today = todayInTimeZone(PLANNING_TIME_ZONE);

  // Bootstrap phase: no persistence yet. Replaced by a Supabase query in Phase 01/02.
  const data = SCAFFOLD_PLANNER_DATA;

  return (
    <>
      <PageHeader
        title="Master plan"
        subtitle={
          <>
            Today {today} ({PLANNING_TIME_ZONE}) · Data source:{" "}
            {data.source === "scaffold" ? "UI scaffolding (not canonical)" : "Supabase"}
          </>
        }
      />
      {data.source === "scaffold" ? <ScaffoldNotice /> : null}
      <PlannerWorkspace data={data} today={today} />
    </>
  );
}

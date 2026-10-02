import { PLANNING_TIME_ZONE } from "@/config/app";
import { todayInTimeZone } from "@/domain/timeline/dates";
import { parseId, planningRoute } from "@/lib/api/http";

/** Weekly Review data: completed, in progress, blocked, slipping, upcoming, milestones, decisions, unplanned, data quality. */
export const GET = planningRoute<{ id: string }>(({ params, service }) =>
  service.weeklyReview(parseId(params.id, "Project"), todayInTimeZone(PLANNING_TIME_ZONE)),
);

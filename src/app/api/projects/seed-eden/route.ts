import { planningRoute } from "@/lib/api/http";
import { seedEdenPlan } from "@/lib/planning/seed";

/** Creates the E:DEN macro structure (codes and titles only; no dates, durations or owners). Idempotent. */
export const POST = planningRoute(({ service }) => seedEdenPlan(service), 201);

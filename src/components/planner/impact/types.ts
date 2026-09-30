import type { CascadePlan, DependencyCheck } from "@/domain/planning/scheduling";

/** Mirror of the API's TaskImpactPreview (JSON). */
export interface ImpactPreview {
  taskId: string;
  edenCode: string;
  changes: Record<string, unknown>;
  messages: string[];
  created: DependencyCheck[];
  resolved: DependencyCheck[];
  cascade: CascadePlan;
}

export const cascadeConfirmation = (plan: CascadePlan) => ({
  moves: plan.moves.map((m) => ({ taskId: m.taskId, toStart: m.toStart })),
});

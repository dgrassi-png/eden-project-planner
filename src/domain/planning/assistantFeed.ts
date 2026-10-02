import type { DependencyCheck } from "./scheduling";
import type { PlanningSnapshot } from "./types";

/**
 * Planning constraints for the Personal Assistant (Product Definition §26,
 * Phase 08). The planner provides constraints; the assistant decides when
 * someone actually works on what. Only open work; unknown values are null.
 */
export interface PlanningConstraints {
  schema: "eden-planner/planning-constraints@1";
  generatedAt: string;
  project: { id: string; name: string };
  tasks: {
    code: string;
    title: string;
    owner: string | null;
    status: string;
    priority: string | null;
    geography: string | null;
    splittable: boolean | null;
    durationDays: number | null;
    plannedStart: string | null;
    plannedFinish: string | null;
    deadline: string | null;
    milestone: boolean;
    dependsOn: string[];
    /** Predecessors not DONE yet (the task cannot really start before them). */
    waitingOn: string[];
    /** No open predecessor and not blocked. */
    ready: boolean;
    blocker: string | null;
    waitingFor: string | null;
    dependencyConflict: boolean;
  }[];
}

export function buildPlanningConstraints(
  snapshot: PlanningSnapshot,
  checks: DependencyCheck[],
  options: { owner?: string; now: string },
): PlanningConstraints {
  const byId = new Map(snapshot.tasks.map((t) => [t.id, t]));
  const names = new Map(snapshot.members.map((m) => [m.id, m.displayName]));
  const conflict = new Set(checks.filter((c) => c.state === "violated").map((c) => c.successorTaskId));
  const ownerFilter = options.owner?.trim().toLowerCase();
  const tasks = snapshot.tasks
    .filter((t) => t.status !== "DONE" && t.status !== "CANCELLED")
    .map((t) => {
      const predecessors = snapshot.dependencies.filter((d) => d.successorTaskId === t.id).map((d) => byId.get(d.predecessorTaskId));
      const waitingOn = predecessors.filter((p) => p && p.status !== "DONE" && p.status !== "CANCELLED").map((p) => p?.edenCode ?? "?");
      const owner = t.ownerMemberId ? (names.get(t.ownerMemberId) ?? null) : null;
      return {
        code: t.edenCode,
        title: t.title,
        owner,
        status: t.status,
        priority: t.priority,
        geography: t.geography,
        splittable: t.splittable,
        durationDays: t.isMilestone ? 0 : t.plannedDurationDays,
        plannedStart: t.plannedStart,
        plannedFinish: t.plannedFinish,
        deadline: t.deadline,
        milestone: t.isMilestone,
        dependsOn: predecessors.map((p) => p?.edenCode ?? "?").sort(),
        waitingOn: waitingOn.sort(),
        ready: waitingOn.length === 0 && t.status !== "WAITING_BLOCKED" && t.blocker === null,
        blocker: t.blocker,
        waitingFor: t.waitingFor,
        dependencyConflict: conflict.has(t.id),
      };
    })
    .filter((t) => !ownerFilter || t.owner?.toLowerCase() === ownerFilter)
    .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
  return {
    schema: "eden-planner/planning-constraints@1",
    generatedAt: options.now,
    project: { id: snapshot.project.id, name: snapshot.project.name },
    tasks,
  };
}

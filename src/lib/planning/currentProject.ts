import "server-only";

import type { Project } from "@/domain/planning/types";

import type { PlanningService } from "./service";

/**
 * V0 has a single E:DEN project; `?project=<slug>` selects another one if
 * more exist. Returns null when no project exists yet.
 */
export async function resolveCurrentProject(
  service: PlanningService,
  slug: string | string[] | undefined,
): Promise<{ project: Project; projects: Project[] } | null> {
  const projects = await service.listProjects();
  const first = projects[0];
  if (!first) return null;
  const requested = typeof slug === "string" ? projects.find((p) => p.slug === slug) : undefined;
  return { project: requested ?? first, projects };
}

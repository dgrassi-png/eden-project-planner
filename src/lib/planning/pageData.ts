import "server-only";

import { EnvValidationError } from "@/config/env.schema";
import type { Project } from "@/domain/planning/types";
import { actorFor, type Principal } from "@/lib/auth/session";

import { resolveCurrentProject } from "./currentProject";
import { PlanningError } from "./errors";
import { getPlanningService } from "./server";
import type { PlanningService } from "./service";

export type PageLoad<T> =
  | { status: "error"; message: string }
  | { status: "no_project" }
  | { status: "ready"; project: Project; projects: Project[]; data: T };

/**
 * Shared loader for pages that show data of the current project. Converts
 * configuration and database failures into renderable states.
 */
export async function loadProjectPage<T>(
  principal: Principal,
  projectSlug: string | string[] | undefined,
  load: (service: PlanningService, project: Project) => Promise<T>,
): Promise<PageLoad<T>> {
  try {
    const service = getPlanningService(actorFor(principal));
    const current = await resolveCurrentProject(service, projectSlug);
    if (!current) return { status: "no_project" };
    return { status: "ready", ...current, data: await load(service, current.project) };
  } catch (error) {
    if (error instanceof EnvValidationError) {
      return { status: "error", message: `Invalid environment variables: ${error.invalidKeys.join(", ")}` };
    }
    if (error instanceof PlanningError) return { status: "error", message: error.message };
    throw error;
  }
}

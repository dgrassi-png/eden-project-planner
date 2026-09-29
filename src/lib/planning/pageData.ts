import "server-only";

import { EnvValidationError } from "@/config/env.schema";
import type { Project } from "@/domain/planning/types";

import { resolveCurrentProject } from "./currentProject";
import { PlanningError } from "./errors";
import { getPlanningBackend } from "./server";
import type { PlanningService } from "./service";

export type PageLoad<T> =
  | { status: "not_configured" }
  | { status: "error"; message: string }
  | { status: "no_project" }
  | { status: "ready"; project: Project; projects: Project[]; data: T };

/**
 * Shared loader for pages that show data of the current project. Converts
 * configuration and database failures into renderable states.
 */
export async function loadProjectPage<T>(
  projectSlug: string | string[] | undefined,
  load: (service: PlanningService, project: Project) => Promise<T>,
): Promise<PageLoad<T>> {
  try {
    const backend = getPlanningBackend();
    if (backend.status === "not_configured") return { status: "not_configured" };
    const current = await resolveCurrentProject(backend.service, projectSlug);
    if (!current) return { status: "no_project" };
    return { status: "ready", ...current, data: await load(backend.service, current.project) };
  } catch (error) {
    if (error instanceof EnvValidationError) {
      return { status: "error", message: `Invalid environment variables: ${error.invalidKeys.join(", ")}` };
    }
    if (error instanceof PlanningError) return { status: "error", message: error.message };
    throw error;
  }
}

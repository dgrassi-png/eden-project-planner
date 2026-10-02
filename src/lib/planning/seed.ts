import { EDEN_PROJECT, EDEN_TASKS, EDEN_WORKSTREAMS } from "@/domain/planning/edenSeed";
import type { Project } from "@/domain/planning/types";

import type { PlanningService } from "./service";

export interface SeedResult {
  project: Project;
  createdWorkstreams: string[];
  createdTasks: string[];
  skippedTasks: string[];
}

/**
 * Creates the E:DEN macro structure through the normal planning service
 * (validated and audited as the calling user). Idempotent: existing
 * workstreams and codes are left untouched, so it never overwrites work.
 */
export async function seedEdenPlan(service: PlanningService): Promise<SeedResult> {
  const projects = await service.listProjects();
  const project = projects.find((p) => p.slug === EDEN_PROJECT.slug) ?? (await service.createProject({ ...EDEN_PROJECT }));

  const workstreams = new Map((await service.listWorkstreams(project.id)).map((w) => [w.code, w]));
  const createdWorkstreams: string[] = [];
  for (const seed of EDEN_WORKSTREAMS) {
    if (workstreams.has(seed.code)) continue;
    workstreams.set(seed.code, await service.createWorkstream(project.id, seed));
    createdWorkstreams.push(seed.code);
  }

  const existing = new Set((await service.listTasks(project.id)).map((t) => t.edenCode));
  const createdTasks: string[] = [];
  const skippedTasks: string[] = [];
  for (const [index, seed] of EDEN_TASKS.entries()) {
    if (existing.has(seed.edenCode)) {
      skippedTasks.push(seed.edenCode);
      continue;
    }
    await service.createTask(project.id, {
      edenCode: seed.edenCode,
      title: seed.title,
      workstreamId: workstreams.get(seed.workstream)?.id ?? null,
      isMilestone: seed.isMilestone ?? false,
      sortOrder: (index + 1) * 10,
    });
    createdTasks.push(seed.edenCode);
  }
  return { project, createdWorkstreams, createdTasks, skippedTasks };
}

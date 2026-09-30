import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EDEN_TASKS } from "@/domain/planning/edenSeed";
import { applyMigrations, openDatabase } from "@/lib/db/migrator.mjs";

import { seedEdenPlan } from "./seed";
import { PlanningService } from "./service";
import { createSqlitePlanningStore } from "./sqliteStore";

const MIGRATIONS = fileURLToPath(new URL("../../../db/migrations", import.meta.url));

function makeService() {
  const db = openDatabase(":memory:", { create: true });
  applyMigrations(db, MIGRATIONS);
  return new PlanningService(createSqlitePlanningStore(db, { type: "USER", id: "eden_seed" }));
}

describe("seedEdenPlan", () => {
  it("creates the macro structure with every planning value unknown", async () => {
    const service = makeService();
    const result = await seedEdenPlan(service);
    expect(result.createdTasks).toHaveLength(16);
    const tasks = await service.listTasks(result.project.id);
    for (const task of tasks) {
      expect(task).toMatchObject({
        plannedStart: null,
        plannedFinish: null,
        ownerMemberId: null,
        priority: null,
        geography: null,
        progressPercent: null,
        deadline: null,
        status: "BACKLOG",
      });
      if (!task.isMilestone) expect(task.plannedDurationDays).toBeNull();
    }
    expect(tasks.filter((t) => t.isMilestone).map((t) => t.edenCode).sort()).toEqual(["CERT-003", "EIMA-003"]);
    expect((await service.getSnapshot(result.project.id)).dependencies).toEqual([]);
  });

  it("is idempotent and never overwrites existing tasks", async () => {
    const service = makeService();
    const first = await seedEdenPlan(service);
    const tec = (await service.listTasks(first.project.id)).find((t) => t.edenCode === "TEC-001");
    await service.updateTask(tec?.id as string, { title: "Renamed by the team" });
    const second = await seedEdenPlan(service);
    expect(second.createdTasks).toEqual([]);
    expect(second.skippedTasks).toHaveLength(EDEN_TASKS.length);
    expect((await service.getTask(tec?.id as string)).title).toBe("Renamed by the team");
  });
});

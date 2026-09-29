import { describe, expect, it } from "vitest";

import { createDependencySchema, createTaskSchema, updateTaskSchema } from "./schemas";

const uuid = "5f0e7a1c-2b3d-4e5f-8a9b-0c1d2e3f4a5b";

describe("API schemas", () => {
  it("accepts a minimal task", () => {
    expect(createTaskSchema.safeParse({ edenCode: "TEC-001", title: "x", workstreamId: uuid }).success).toBe(true);
  });

  it("rejects unknown fields, bad enums and invalid dates", () => {
    expect(createTaskSchema.safeParse({ edenCode: "TEC-001", title: "x", plannedFinish: "2026-10-09" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ edenCode: "TEC-001", title: "x", status: "WIP" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ edenCode: "TEC-001", title: "x", plannedStart: "2026-02-30" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ edenCode: "TEC-001", title: "x", workstreamId: "not-a-uuid" }).success).toBe(false);
  });

  it("does not accept permanent fields in updates", () => {
    expect(updateTaskSchema.safeParse({ edenCode: "TEC-002" }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ title: "renamed", plannedStart: null }).success).toBe(true);
  });

  it("requires integer lag", () => {
    expect(createDependencySchema.safeParse({ predecessorTaskId: uuid, successorTaskId: uuid, lagDays: 1.5 }).success).toBe(false);
  });
});

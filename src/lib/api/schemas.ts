import { z } from "zod";

import { GEOGRAPHIES, TASK_PRIORITIES, TASK_STATUSES } from "@/domain/planning/constants";
import { parseIsoDate } from "@/domain/timeline/dates";

/**
 * Request body schemas. External payloads are untrusted: shapes are checked
 * here (strict objects, bounded sizes). Planning rules are checked by the
 * domain layer.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")
  .refine((value) => {
    try {
      parseIsoDate(value);
      return true;
    } catch {
      return false;
    }
  }, "Invalid calendar date");

const id = z.uuid();
const shortText = z.string().max(500);

export const createProjectSchema = z.strictObject({
  name: shortText,
  slug: z.string().max(64),
  description: z.string().max(5_000).nullish(),
});

export const createWorkstreamSchema = z.strictObject({
  code: z.string().max(16),
  name: shortText,
  sortOrder: z.number().int().optional(),
});

export const updateWorkstreamSchema = z.strictObject({
  name: shortText.optional(),
  sortOrder: z.number().int().optional(),
});

export const createMemberSchema = z.strictObject({
  displayName: shortText,
  email: z.string().max(320).nullish(),
});

const taskFields = {
  title: shortText,
  workstreamId: id.nullish(),
  description: z.string().max(20_000).nullish(),
  ownerMemberId: id.nullish(),
  plannedStart: isoDate.nullish(),
  plannedDurationDays: z.number().int().nullish(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).nullish(),
  geography: z.enum(GEOGRAPHIES).nullish(),
  isMilestone: z.boolean().optional(),
  progressPercent: z.number().int().nullish(),
  sortOrder: z.number().int().optional(),
};

export const createTaskSchema = z.strictObject({
  edenCode: z.string().max(32),
  parentTaskId: id.nullish(),
  ...taskFields,
});

/** Fields that identify a task permanently and can never be patched. */
export const IMMUTABLE_TASK_FIELDS = ["edenCode", "parentTaskId", "projectId", "plannedFinish"] as const;

export const updateTaskSchema = z.strictObject({
  ...taskFields,
  title: shortText.optional(),
  /** Optimistic concurrency: the `updatedAt` the editor loaded. */
  expectedUpdatedAt: z.string().max(64).optional(),
});

export const createDependencySchema = z.strictObject({
  predecessorTaskId: id,
  successorTaskId: id,
  lagDays: z.number().int().optional(),
});

export const updateDependencySchema = z.strictObject({
  lagDays: z.number().int(),
});

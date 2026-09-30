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
  deadline: isoDate.nullish(),
  blocker: z.string().max(4_000).nullish(),
  waitingFor: z.string().max(4_000).nullish(),
  notes: z.string().max(20_000).nullish(),
  splittable: z.boolean().nullish(),
  sortOrder: z.number().int().optional(),
};

export const createTaskSchema = z.strictObject({
  edenCode: z.string().max(32),
  parentTaskId: id.nullish(),
  ...taskFields,
});

/** Fields that identify a task permanently and can never be patched. */
export const IMMUTABLE_TASK_FIELDS = ["edenCode", "parentTaskId", "projectId", "plannedFinish"] as const;

/** The cascade moves the user reviewed (see PlanningService.updateTask). */
export const cascadeConfirmationSchema = z.strictObject({
  moves: z.array(z.strictObject({ taskId: id, toStart: isoDate })).max(2_000),
});

export const updateTaskSchema = z.strictObject({
  ...taskFields,
  title: shortText.optional(),
  /** Optimistic concurrency: the `updatedAt` the editor loaded. */
  expectedUpdatedAt: z.string().max(64).optional(),
  /** Explicit cascade: apply these reviewed successor moves together with the change. */
  cascade: cascadeConfirmationSchema.optional(),
});

/** Impact preview of a patch (nothing is saved). */
export const taskImpactSchema = z.strictObject({ ...taskFields, title: shortText.optional() });

export const createDependencySchema = z.strictObject({
  predecessorTaskId: id,
  successorTaskId: id,
  lagDays: z.number().int().optional(),
});

export const updateDependencySchema = z.strictObject({
  lagDays: z.number().int(),
});

// Trello (Phase 04) ------------------------------------------------------------

const trelloId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Expected a Trello id");

export const trelloSettingsSchema = z.strictObject({
  subtaskMode: z.enum(["CHECKLIST", "CARD"]),
  statusLists: z.partialRecord(z.enum(TASK_STATUSES), trelloId.or(z.literal(""))),
  workstreamLabels: z.record(id, trelloId.or(z.literal(""))),
});

export const memberTrelloSchema = z.strictObject({ trelloMemberId: trelloId.nullable() });

export const syncConfirmationSchema = z.strictObject({
  items: z
    .array(z.strictObject({ taskId: id, action: z.enum(["create", "update", "unchanged", "error", "skip"]) }))
    .max(5_000),
});

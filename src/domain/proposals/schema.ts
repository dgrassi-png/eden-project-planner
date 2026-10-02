import { z } from "zod";

import { GEOGRAPHIES, TASK_PRIORITIES, TASK_STATUSES } from "../planning/constants";
import { parseIsoDate } from "../timeline/dates";

/**
 * Structured change proposal (provider-neutral). ChatGPT, Claude or a person
 * submits one of these; nothing changes until a person applies it. Tasks are
 * referenced by their permanent E:DEN code, people by display name or email.
 * Deleting tasks cannot be proposed.
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

const code = z.string().trim().min(1).max(32);
const text = (max: number) => z.string().max(max);

const detailFields = {
  description: text(10_000).nullable().optional(),
  /** Member display name or email; null clears the owner. */
  owner: text(320).nullable().optional(),
  plannedStart: isoDate.nullable().optional(),
  plannedDurationDays: z.number().int().nullable().optional(),
  /**
   * Target finish. Finish is derived in the planner, so this is translated
   * into a duration (tasks) or a date (milestones) and previewed as such.
   */
  plannedFinish: isoDate.optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).nullable().optional(),
  geography: z.enum(GEOGRAPHIES).nullable().optional(),
  isMilestone: z.boolean().optional(),
  progressPercent: z.number().int().nullable().optional(),
  deadline: isoDate.nullable().optional(),
  blocker: text(2_000).nullable().optional(),
  waitingFor: text(2_000).nullable().optional(),
  notes: text(10_000).nullable().optional(),
  splittable: z.boolean().nullable().optional(),
};

const plannableFields = { title: text(200).min(1).optional(), ...detailFields };

export const proposalChangeSchema = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("update_task"),
    task: code,
    set: z.strictObject({ ...plannableFields, workstream: code.optional() }),
  }),
  z.strictObject({
    op: z.literal("create_task"),
    task: z.strictObject({
      edenCode: code,
      title: text(200).min(1),
      /** Workstream code (top-level tasks). */
      workstream: code.optional(),
      /** Parent E:DEN code (subtasks). */
      parent: code.optional(),
      ...detailFields,
    }),
  }),
  z.strictObject({ op: z.literal("add_dependency"), predecessor: code, successor: code, lagDays: z.number().int().optional() }),
  z.strictObject({ op: z.literal("update_dependency"), predecessor: code, successor: code, lagDays: z.number().int() }),
  z.strictObject({ op: z.literal("remove_dependency"), predecessor: code, successor: code }),
]);

export const proposalPayloadSchema = z.strictObject({
  /** One-line summary shown in the review list. */
  summary: text(300).optional(),
  changes: z.array(proposalChangeSchema).min(1).max(200),
});

export type ProposalChange = z.infer<typeof proposalChangeSchema>;
export type ProposalPayload = z.infer<typeof proposalPayloadSchema>;

/** Sources allowed to submit proposals (audit actor types). */
export const PROPOSAL_SOURCES = ["CHATGPT", "CLAUDE", "USER"] as const;
export type ProposalSource = (typeof PROPOSAL_SOURCES)[number];

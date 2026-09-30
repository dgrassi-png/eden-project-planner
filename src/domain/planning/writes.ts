import type { TaskChanges, TaskDraft } from "./taskRules";
import type { TaskDependency } from "./types";

/**
 * One step of an atomic write batch (cascade, proposal apply). IDs of new rows
 * are chosen by the caller so later steps can reference them.
 */
export type BatchOp =
  | { kind: "createTask"; id: string; draft: TaskDraft }
  | { kind: "updateTask"; id: string; changes: TaskChanges; expectedUpdatedAt: string }
  | {
      kind: "createDependency";
      id: string;
      projectId: string;
      input: Pick<TaskDependency, "predecessorTaskId" | "successorTaskId" | "lagDays">;
    }
  | { kind: "updateDependency"; id: string; lagDays: number }
  | { kind: "deleteDependency"; id: string }
  | {
      kind: "reviewProposal";
      id: string;
      status: "APPLIED" | "REJECTED";
      reviewedBy: string;
      reviewNote: string | null;
    };

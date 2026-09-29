import type { Issue } from "@/domain/result";

/** Failure categories surfaced by the planning service and API. */
export type PlanningErrorKind = "validation" | "not_found" | "conflict" | "unavailable" | "internal";

export class PlanningError extends Error {
  constructor(
    public readonly kind: PlanningErrorKind,
    message: string,
    public readonly issues: Issue[] = [],
  ) {
    super(message);
    this.name = "PlanningError";
  }

  static validation(issues: Issue[]): PlanningError {
    return new PlanningError("validation", issues.map((i) => i.message).join("; ") || "Invalid input", issues);
  }

  static notFound(what: string): PlanningError {
    return new PlanningError("not_found", `${what} not found`);
  }

  static conflict(message: string, issues: Issue[] = []): PlanningError {
    return new PlanningError("conflict", message, issues);
  }
}

export const HTTP_STATUS: Record<PlanningErrorKind, number> = {
  validation: 422,
  not_found: 404,
  conflict: 409,
  unavailable: 503,
  internal: 500,
};

/** Shape of errors returned by PostgREST / supabase-js. */
export interface PostgrestLikeError {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

const RELATION_MISSING = new Set(["42P01", "PGRST205"]);

/**
 * Maps a database error to a PlanningError. Database guard triggers raise
 * SQLSTATE P0001 with a stable machine code in `hint` and a readable
 * message. Those are safe to show; other database messages are not echoed,
 * since they can reveal internals.
 */
export function fromPostgrestError(error: PostgrestLikeError): PlanningError {
  const code = error.code ?? "";
  if (code === "P0001") {
    return PlanningError.validation([{ code: error.hint ?? "DB_RULE", message: error.message }]);
  }
  if (code === "23505") {
    return PlanningError.conflict("A record with the same code already exists", [
      { code: "UNIQUE_VIOLATION", message: "A record with the same code already exists" },
    ]);
  }
  if (code === "23503") {
    return PlanningError.conflict("The record is still referenced by other planning data", [
      { code: "REFERENCED", message: "The record is still referenced by other planning data" },
    ]);
  }
  if (code === "23514" || code === "22P02" || code === "22007" || code === "22008") {
    return PlanningError.validation([{ code: "DB_CONSTRAINT", message: "The change violates a planning rule" }]);
  }
  if (RELATION_MISSING.has(code)) {
    return new PlanningError("unavailable", "Planning tables not found. Apply the Supabase migrations first.");
  }
  return new PlanningError("internal", "Database request failed");
}

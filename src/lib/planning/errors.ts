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

/** Shape of errors thrown by better-sqlite3. */
export interface SqliteLikeError {
  code?: string;
  message: string;
}

const TRIGGER_MESSAGE = /^([A-Z][A-Z_]+): (.+)$/;

/**
 * Maps a SQLite error to a PlanningError. Guard triggers raise
 * "CODE: readable message", which is safe to show. Other database messages
 * are not echoed, since they can reveal internals.
 */
export function fromSqliteError(error: SqliteLikeError): PlanningError {
  const trigger = TRIGGER_MESSAGE.exec(error.message);
  if (trigger && error.code?.startsWith("SQLITE_CONSTRAINT")) {
    const [, code = "DB_RULE", message = error.message] = trigger;
    return PlanningError.validation([{ code, message }]);
  }
  switch (error.code) {
    case "SQLITE_CONSTRAINT_UNIQUE":
    case "SQLITE_CONSTRAINT_PRIMARYKEY":
      return PlanningError.conflict("A record with the same code already exists", [
        { code: "UNIQUE_VIOLATION", message: "A record with the same code already exists" },
      ]);
    case "SQLITE_CONSTRAINT_FOREIGNKEY":
      return PlanningError.conflict("The record is still referenced by other planning data", [
        { code: "REFERENCED", message: "The record is still referenced by other planning data" },
      ]);
    case "SQLITE_CONSTRAINT_CHECK":
    case "SQLITE_CONSTRAINT_NOTNULL":
      return PlanningError.validation([{ code: "DB_CONSTRAINT", message: "The change violates a planning rule" }]);
    case "SQLITE_BUSY":
    case "SQLITE_LOCKED":
      return new PlanningError("unavailable", "The planning database is busy; try again");
    default:
      return new PlanningError("internal", "Database request failed");
  }
}

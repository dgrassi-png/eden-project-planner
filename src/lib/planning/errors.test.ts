import { describe, expect, it } from "vitest";

import { fromSqliteError, HTTP_STATUS } from "./errors";

describe("fromSqliteError", () => {
  it("surfaces guard-trigger messages with their machine code", () => {
    const error = fromSqliteError({ code: "SQLITE_CONSTRAINT_TRIGGER", message: "EDEN_CODE_IMMUTABLE: E:DEN codes are permanent" });
    expect(error.kind).toBe("validation");
    expect(error.issues).toEqual([{ code: "EDEN_CODE_IMMUTABLE", message: "E:DEN codes are permanent" }]);
  });

  it("maps constraint violations without leaking database details", () => {
    const unique = fromSqliteError({ code: "SQLITE_CONSTRAINT_UNIQUE", message: "UNIQUE constraint failed: tasks.project_id, tasks.eden_code" });
    expect(unique.kind).toBe("conflict");
    expect(unique.message).not.toContain("tasks.project_id");
    expect(fromSqliteError({ code: "SQLITE_CONSTRAINT_FOREIGNKEY", message: "FOREIGN KEY constraint failed" }).kind).toBe("conflict");
    expect(fromSqliteError({ code: "SQLITE_CONSTRAINT_CHECK", message: "CHECK constraint failed: x" }).kind).toBe("validation");
  });

  it("reports busy databases as unavailable and hides unknown errors", () => {
    expect(fromSqliteError({ code: "SQLITE_BUSY", message: "database is locked" }).kind).toBe("unavailable");
    const unknown = fromSqliteError({ code: "SQLITE_IOERR", message: "disk I/O error at /var/lib/eden/secret" });
    expect(unknown.kind).toBe("internal");
    expect(unknown.message).not.toContain("/var/lib");
    expect(HTTP_STATUS[unknown.kind]).toBe(500);
  });

  it("does not treat ordinary messages that look like codes as trigger errors", () => {
    expect(fromSqliteError({ code: "SQLITE_ERROR", message: "NO_SUCH: table" }).kind).toBe("internal");
  });
});

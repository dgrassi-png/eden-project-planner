import { describe, expect, it } from "vitest";

import { fromPostgrestError, HTTP_STATUS } from "./errors";

describe("fromPostgrestError", () => {
  it("surfaces guard-trigger messages with their machine code", () => {
    const error = fromPostgrestError({ code: "P0001", message: "E:DEN code TEC-001 is permanent", hint: "EDEN_CODE_IMMUTABLE" });
    expect(error.kind).toBe("validation");
    expect(error.issues).toEqual([{ code: "EDEN_CODE_IMMUTABLE", message: "E:DEN code TEC-001 is permanent" }]);
  });

  it("maps constraint violations without leaking database details", () => {
    const unique = fromPostgrestError({ code: "23505", message: 'duplicate key value violates unique constraint "tasks_project_id_eden_code_key"' });
    expect(unique.kind).toBe("conflict");
    expect(unique.message).not.toContain("tasks_project_id");
    expect(fromPostgrestError({ code: "23503", message: "fk" }).kind).toBe("conflict");
    expect(fromPostgrestError({ code: "23514", message: "check" }).kind).toBe("validation");
  });

  it("flags missing migrations and hides unknown errors", () => {
    expect(fromPostgrestError({ code: "PGRST205", message: "no table" }).kind).toBe("unavailable");
    const unknown = fromPostgrestError({ code: "XX000", message: "internal secret detail" });
    expect(unknown.kind).toBe("internal");
    expect(unknown.message).not.toContain("secret");
    expect(HTTP_STATUS[unknown.kind]).toBe(500);
  });
});

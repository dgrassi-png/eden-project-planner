import { describe, expect, it } from "vitest";

import {
  compareEdenCodes,
  isValidEdenCode,
  isValidWorkstreamCode,
  parseEdenCode,
  suggestNextSubtaskCode,
  suggestNextTaskCode,
} from "./edenCode";

describe("E:DEN codes", () => {
  it.each(["TEC-001", "PROD-002", "CERT-003", "EIMA-001", "SC-001", "TEC-001.1", "TEC-1234", "TEC-001.12"])(
    "accepts %s",
    (code) => expect(isValidEdenCode(code)).toBe(true),
  );

  it.each(["tec-001", "TEC-01", "TEC001", "TEC-001.0", "TEC-001.1.1", "T-001", "TEC-001.", " TEC-001", "1TEC-001"])(
    "rejects %s",
    (code) => expect(isValidEdenCode(code)).toBe(false),
  );

  it("parses tasks and subtasks", () => {
    expect(parseEdenCode("TEC-001")).toMatchObject({ prefix: "TEC", number: 1, subtaskNumber: null, parentCode: null });
    expect(parseEdenCode("TEC-001.2")).toMatchObject({ prefix: "TEC", number: 1, subtaskNumber: 2, parentCode: "TEC-001" });
    expect(parseEdenCode("nope")).toBeNull();
  });

  it("orders codes naturally", () => {
    const codes = ["TEC-010", "TEC-001.10", "CERT-002", "TEC-001.2", "TEC-002", "TEC-001"];
    expect([...codes].sort(compareEdenCodes)).toEqual(["CERT-002", "TEC-001", "TEC-001.2", "TEC-001.10", "TEC-002", "TEC-010"]);
  });

  it("suggests the next free codes", () => {
    const existing = ["TEC-001", "TEC-003", "TEC-001.1", "TEC-001.4", "CERT-009"];
    expect(suggestNextTaskCode("TEC", existing)).toBe("TEC-004");
    expect(suggestNextTaskCode("GOV", existing)).toBe("GOV-001");
    expect(suggestNextSubtaskCode("TEC-001", existing)).toBe("TEC-001.5");
    expect(suggestNextSubtaskCode("TEC-003", existing)).toBe("TEC-003.1");
  });

  it("validates workstream codes", () => {
    expect(isValidWorkstreamCode("CERT")).toBe(true);
    expect(isValidWorkstreamCode("C")).toBe(false);
    expect(isValidWorkstreamCode("cert")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { isAdmitted, parseExchangeResponse, safeNextPath } from "./identityContract";

const valid = {
  eden_user_id: "eden_0192f3a4b5c6d7e8f90123456789abcdef012345",
  email: "person@e-den.tech",
  email_verified: true,
  application: "planner",
  platform_full_access: true,
};

describe("parseExchangeResponse", () => {
  it("accepts the Identity exchange shape", () => {
    expect(parseExchangeResponse(valid, "planner")).toEqual({
      ok: true,
      value: { edenUserId: valid.eden_user_id, email: valid.email, platformFullAccess: true, entitlementActive: false },
    });
    const withEntitlement = parseExchangeResponse({ ...valid, platform_full_access: false, entitlement: "ACTIVE" }, "planner");
    expect(withEntitlement.ok && withEntitlement.value.entitlementActive).toBe(true);
  });

  it.each([
    ["missing claim", { ...valid, platform_full_access: undefined }],
    ["string claim", { ...valid, platform_full_access: "true" }],
    ["unverified email", { ...valid, email_verified: false }],
    ["other application", { ...valid, application: "budget" }],
    ["bad user id", { ...valid, eden_user_id: "user_1" }],
    ["injected user id", { ...valid, eden_user_id: "eden_x/../y" }],
    ["bad email", { ...valid, email: "a@b@c" }],
    ["revoked entitlement", { ...valid, entitlement: "REVOKED" }],
    ["not an object", ["nope"]],
  ])("rejects %s", (_label, body) => {
    expect(parseExchangeResponse(body, "planner").ok).toBe(false);
  });
});

describe("isAdmitted", () => {
  it("admits platform full access or an active entitlement only", () => {
    const base = { edenUserId: "eden_1", email: "a@b.c" };
    expect(isAdmitted({ ...base, platformFullAccess: true, entitlementActive: false })).toBe(true);
    expect(isAdmitted({ ...base, platformFullAccess: false, entitlementActive: true })).toBe(true);
    expect(isAdmitted({ ...base, platformFullAccess: false, entitlementActive: false })).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNextPath("/planner?project=demo")).toBe("/planner?project=demo");
    expect(safeNextPath("/settings/team")).toBe("/settings/team");
  });

  it.each(["https://evil.example/x", "//evil.example", "/\\evil.example", "planner", "/a\nb", "/auth/eden/start", "", null])(
    "falls back to /planner for %s",
    (raw) => {
      expect(safeNextPath(raw)).toBe("/planner");
    },
  );
});

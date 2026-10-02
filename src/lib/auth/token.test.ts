import { describe, expect, it } from "vitest";

import { signToken, verifyToken } from "./token";

const secret = "s".repeat(40);
const now = 1_900_000_000;

describe("signed tokens", () => {
  it("round-trips unexpired claims of the expected type", async () => {
    const token = await signToken({ typ: "session", exp: now + 60, sub: "eden_1" }, secret);
    expect(await verifyToken(token, secret, "session", now)).toMatchObject({ sub: "eden_1" });
  });

  it("rejects expired, wrong-type, tampered and foreign-key tokens", async () => {
    const token = await signToken({ typ: "session", exp: now + 60, sub: "eden_1" }, secret);
    expect(await verifyToken(token, secret, "session", now + 61)).toBeNull();
    expect(await verifyToken(token, secret, "sso-pending", now)).toBeNull();
    expect(await verifyToken(token, "k".repeat(40), "session", now)).toBeNull();
    const [payload, signature] = token.split(".");
    const forged = btoa(JSON.stringify({ typ: "session", exp: now + 60, sub: "eden_admin" })).replace(/=+$/, "");
    expect(await verifyToken(`${forged}.${signature}`, secret, "session", now)).toBeNull();
    expect(await verifyToken(`${payload}.${signature}.x`, secret, "session", now)).toBeNull();
    expect(await verifyToken(undefined, secret, "session", now)).toBeNull();
    expect(await verifyToken("garbage", secret, "session", now)).toBeNull();
  });
});

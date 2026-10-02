import { describe, expect, it } from "vitest";

import { hostnameFromHostHeader, isBackgroundRequest, isLoopbackHost, resolveAuthConfig } from "./auth";
import { parseServerEnv } from "./env.schema";

const secret = "x".repeat(40);

describe("resolveAuthConfig", () => {
  it("defaults to local-dev outside production and fails closed in production", () => {
    expect(resolveAuthConfig(parseServerEnv({}), "development").mode).toBe("local-dev");
    expect(resolveAuthConfig(parseServerEnv({}), "production").mode).toBe("misconfigured");
  });

  it("allows explicit local-dev (loopback enforcement happens per request)", () => {
    expect(resolveAuthConfig(parseServerEnv({ PLANNER_AUTH_MODE: "local-dev" }), "production").mode).toBe("local-dev");
  });

  it("configures Identity SSO with https origins and a session secret", () => {
    const config = resolveAuthConfig(
      parseServerEnv({
        EDEN_IDENTITY_BASE_URL: "https://auth.e-den.tech",
        PLANNER_PUBLIC_URL: "https://planner.e-den.tech",
        PLANNER_SESSION_SECRET: secret,
      }),
      "production",
    );
    expect(config).toEqual({
      mode: "identity",
      identityBaseUrl: "https://auth.e-den.tech",
      applicationId: "planner",
      publicOrigin: "https://planner.e-den.tech",
      sessionSecret: secret,
      secureCookies: true,
    });
  });

  it("rejects insecure or incomplete Identity configuration", () => {
    const insecure = resolveAuthConfig(
      parseServerEnv({
        PLANNER_AUTH_MODE: "identity",
        EDEN_IDENTITY_BASE_URL: "http://auth.e-den.tech",
        PLANNER_PUBLIC_URL: "https://planner.e-den.tech/app",
      }),
      "production",
    );
    expect(insecure.mode).toBe("misconfigured");
    expect(insecure.mode === "misconfigured" && insecure.problems).toHaveLength(3);
  });

  it("allows plain http only on loopback (test setups)", () => {
    const config = resolveAuthConfig(
      parseServerEnv({
        EDEN_IDENTITY_BASE_URL: "http://127.0.0.1:9900",
        PLANNER_PUBLIC_URL: "http://localhost:3100",
        PLANNER_SESSION_SECRET: secret,
      }),
      "production",
    );
    expect(config.mode === "identity" && config.secureCookies).toBe(false);
  });

  it("rejects short session secrets at parse time", () => {
    expect(() => parseServerEnv({ PLANNER_SESSION_SECRET: "short" })).toThrow();
  });
});

describe("host parsing", () => {
  it.each([
    ["localhost:3100", "localhost", true],
    ["127.0.0.1", "127.0.0.1", true],
    ["[::1]:3000", "[::1]", true],
    ["planner.e-den.tech", "planner.e-den.tech", false],
    ["localhost.evil.example:80", "localhost.evil.example", false],
    ["[::1", "", false],
    [null, "", false],
  ])("%s -> %s (loopback: %s)", (header, hostname, loopback) => {
    expect(hostnameFromHostHeader(header)).toBe(hostname);
    expect(isLoopbackHost(hostnameFromHostHeader(header))).toBe(loopback);
  });
});

describe("isBackgroundRequest", () => {
  it("recognises router prefetches and RSC fetches, not navigations", () => {
    const none = new URLSearchParams();
    expect(isBackgroundRequest(new Headers({ "next-router-prefetch": "1" }), none)).toBe(true);
    expect(isBackgroundRequest(new Headers({ rsc: "1" }), none)).toBe(true);
    expect(isBackgroundRequest(new Headers(), new URLSearchParams("_rsc=abc"))).toBe(true);
    expect(isBackgroundRequest(new Headers({ accept: "text/html" }), none)).toBe(false);
  });
});

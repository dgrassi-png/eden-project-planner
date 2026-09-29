import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Guardrail for the preview/production boundary (manual Rev.09, ADR-R09-04):
// the two runtimes never share a unit, port, worktree, env file or state dir.
const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");

const production = read("ops/systemd/eden-planner-production.service");
const preview = read("ops/systemd/eden-planner-preview.service");
const nginx = read("ops/nginx/planner.conf.example");
const deploy = read("ops/deploy/planner-deploy.sh");

describe("preview/production boundary", () => {
  it("binds each unit to its own loopback port", () => {
    expect(production).toContain("--hostname 127.0.0.1 --port 3300");
    expect(preview).toContain("--hostname 127.0.0.1 --port 3310");
  });

  it("keeps preview free of production paths and vice versa", () => {
    expect(preview).not.toMatch(/planner-production|3300/);
    expect(production).not.toMatch(/planner-preview|3310/);
  });

  it("routes each hostname to its own upstream", () => {
    const block = (host: string) => nginx.slice(nginx.indexOf(`server_name ${host};`)).split("server {")[0] ?? "";
    expect(block("planner.e-den.tech")).toContain("proxy_pass http://127.0.0.1:3300;");
    expect(block("planner-preview.e-den.tech")).toContain("proxy_pass http://127.0.0.1:3310;");
  });

  it("uses hardened units with external env files", () => {
    for (const unit of [production, preview]) {
      for (const directive of ["NoNewPrivileges=true", "ProtectSystem=strict", "PrivateTmp=true", "EnvironmentFile=/etc/eden/"]) {
        expect(unit).toContain(directive);
      }
    }
  });

  it("requires explicit confirmation for production deploys", () => {
    expect(deploy).toContain("production requires --confirm-production");
    expect(deploy).toContain("CRITICAL INCIDENT");
  });
});

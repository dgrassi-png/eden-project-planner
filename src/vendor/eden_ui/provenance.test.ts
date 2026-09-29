import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Must match PROVENANCE.md: vendored foundation files may never drift locally.
const EXPECTED: Record<string, string> = {
  "css/eden-foundation.css": "e5af707731a0b59309a6437deb2e10e8486c31f021a74fc54d49d7f2edd4a433",
  "css/eden-operational.css": "e0e70db7f3703e62b6575b807b851a143e43205591e5e1345963da2e65136e0e",
  "img/eden-mark.svg": "d5c9113591bc8b6c4efb1af799862eb0b358fae70a270dbbc6aac0c8473f1a92",
};

describe("vendored E:DEN UI foundation", () => {
  it.each(Object.entries(EXPECTED))("%s is an unmodified copy", (file, hash) => {
    const path = fileURLToPath(new URL(file, import.meta.url));
    expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toBe(hash);
  });

  it("is recorded in PROVENANCE.md", () => {
    const provenance = readFileSync(fileURLToPath(new URL("PROVENANCE.md", import.meta.url)), "utf8");
    for (const hash of Object.values(EXPECTED)) expect(provenance).toContain(hash);
  });
});

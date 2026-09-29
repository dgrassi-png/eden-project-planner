import { describe, expect, it } from "vitest";

import { prepareMember, prepareProject, prepareWorkstream, prepareWorkstreamUpdate } from "./entityRules";
import { makeWorkstream } from "./testFixtures";

describe("entity rules", () => {
  it("validates project slugs", () => {
    expect(prepareProject({ name: " E:DEN ", slug: "eden" })).toEqual({ ok: true, value: { name: "E:DEN", slug: "eden", description: null } });
    expect(prepareProject({ name: "x", slug: "Eden Project" }).ok).toBe(false);
  });

  it("normalises and de-duplicates workstream codes", () => {
    expect(prepareWorkstream({ code: " tec ", name: "Engineering" }, [])).toEqual({
      ok: true,
      value: { code: "TEC", name: "Engineering", sortOrder: 0 },
    });
    const taken = prepareWorkstream({ code: "TEC", name: "x" }, [{ code: "TEC" }]);
    expect(!taken.ok && taken.issues[0]?.code).toBe("WORKSTREAM_CODE_TAKEN");
    expect(prepareWorkstream({ code: "T-1", name: "x" }, []).ok).toBe(false);
  });

  it("only lets workstream name and order change", () => {
    const ws = makeWorkstream({ id: "ws-1", code: "TEC", name: "Engineering" });
    expect(prepareWorkstreamUpdate(ws, { name: "Product engineering", sortOrder: 0 })).toEqual({
      ok: true,
      value: { name: "Product engineering" },
    });
  });

  it("validates members", () => {
    expect(prepareMember({ displayName: "A. Person", email: " A@Example.com " })).toEqual({
      ok: true,
      value: { displayName: "A. Person", email: "a@example.com" },
    });
    expect(prepareMember({ displayName: "", email: "bad" }).ok).toBe(false);
  });
});

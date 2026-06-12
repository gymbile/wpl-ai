import { describe, it, expect } from "vitest";
import { compileWplAi } from "../src/index.js";
import { MINIMAL_PLAN } from "./helpers/minimal-plan.js";

// Real contraindication grammar (v16+):
//   contraindication <name> severity <high|moderate|low> action <require_clearance|modify|exclude>
const CONTRA_BLOCK =
  "\n  contraindication lower_back_injury severity high action require_clearance\n";

describe("safety-adjacent unknown sections fail closed", () => {
  for (const name of [
    "REQUIREMENTS",
    "CONTRAINDICATIONS",
    "SAFETY",
    "SAFETY_NOTES",
    "PRECAUTIONS",
  ]) {
    it(`${name}: compile fails instead of silently dropping the section`, () => {
      const r = compileWplAi(MINIMAL_PLAN + `\n${name}:` + CONTRA_BLOCK);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.errors.some((e) => /REQUIRES/.test(e.message))).toBe(true);
      }
    });
  }

  it("non-safety unknown sections still skip tolerantly (with a repair)", () => {
    const r = compileWplAi(MINIMAL_PLAN + "\nSUMMARY:\n  nice plan\n");
    expect(r.ok).toBe(true);
  });

  it("the canonical REQUIRES section still parses", () => {
    // REQUIRES has no colon — it's a known keyword in the grammar
    const r = compileWplAi(MINIMAL_PLAN + "\nREQUIRES" + CONTRA_BLOCK);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(JSON.stringify(r.json)).toContain("lower_back_injury");
    }
  });
});

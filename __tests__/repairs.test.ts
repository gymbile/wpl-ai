import { describe, it, expect } from "vitest";
import { compileWplAi } from "../src/index.js";
import { MINIMAL_PLAN } from "./helpers/minimal-plan.js";

describe("repairs ledger", () => {
  it("baseline compiles with empty repairs", () => {
    const r = compileWplAi(MINIMAL_PLAN);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.repairs).toEqual([]);
  });

  it("records a skipped unknown (non-safety) section", () => {
    const r = compileWplAi(MINIMAL_PLAN + "\nSUMMARY:\n  great plan\n");
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.repairs).toContainEqual(
        expect.objectContaining({ type: "skipped_section", section: "SUMMARY" }),
      );
  });

  it("records an exercise auto-substitution with from/to", () => {
    // "pushup" fuzzy-corrects to "push_up" (Jaro-Winkler > 0.85, confirmed in
    // exercise-matcher.test.ts). Replace the known "push_up" ref with the
    // typo so we hit the Tier-1 substitution path in resolveExerciseRef.
    const src = MINIMAL_PLAN.replace("push_up", "pushup");
    const r = compileWplAi(src);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.repairs).toContainEqual(
        expect.objectContaining({
          type: "exercise_substitution",
          from: "pushup",
          to: "push_up",
        }),
      );
  });

  it("records a defaulted value when expectDate fabricates one", () => {
    // Replace the valid ISO date with a non-date bare word. expectDate() will
    // fabricate today's ISO date as the default and record a repair.
    const src = MINIMAL_PLAN.replace("deadline 2027-12-31", "deadline soonish");
    const r = compileWplAi(src);
    if (r.ok)
      expect(r.repairs.some((rep) => rep.type === "defaulted_value")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Task 16: Strict contraindication parsing
//
// Verifies:
//   C4 — unknown severity/action are hard errors (not silent drop/downgrade)
//   H1 — affects entries are resolved through resolveExerciseRef (typo correction + repair)
//
// DSL forms:
//   contraindication <name> severity <high|moderate|low> action <require_clearance|modify|exclude>
//   contraindication <name> -> <action>   (legacy form)
// affects sub-block (indented, comma-separated bare words):
//   affects deadlift, squat
//
// Valid severity set: low, moderate, high
// Valid action set:   exclude, modify, require_clearance
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { compileWplAi } from "../src/index.js";
import { MINIMAL_PLAN } from "./helpers/minimal-plan.js";

// Build a REQUIRES block with a single contraindication line (plus optional indented body)
function req(body: string): string {
  return MINIMAL_PLAN + "\nREQUIRES\n" + body + "\n";
}

describe("contraindication parsing is strict (C4)", () => {
  it("unknown action keyword is a hard error, not a downgrade to exclude", () => {
    const r = compileWplAi(req("  contraindication lower_back_injury action require_clearence"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /require_clearence/.test(e.message))).toBe(true);
    }
  });

  it("unknown action via legacy arrow form is a hard error", () => {
    const r = compileWplAi(req("  contraindication lower_back_injury -> require_clearence"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /require_clearence/.test(e.message))).toBe(true);
    }
  });

  it("unknown severity is a hard error, not silently dropped", () => {
    const r = compileWplAi(req("  contraindication lower_back_injury severity hgh action exclude"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /hgh/.test(e.message))).toBe(true);
    }
  });

  it("valid contraindication still parses with severity and action intact", () => {
    const r = compileWplAi(req("  contraindication lower_back_injury severity high action require_clearance"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const s = JSON.stringify(r.json);
      expect(s).toContain('"severity":"high"');
      expect(s).toContain('"require_clearance"');
    }
  });

  it("valid legacy arrow form still works (back-compat)", () => {
    const r = compileWplAi(req("  contraindication knee_injury -> modify"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const s = JSON.stringify(r.json);
      expect(s).toContain('"modify"');
    }
  });

  it("valid action keyword form without severity works", () => {
    const r = compileWplAi(req("  contraindication heart_condition action require_clearance"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const s = JSON.stringify(r.json);
      expect(s).toContain('"require_clearance"');
    }
  });
});

describe("contraindication affects resolution (H1)", () => {
  it("affects entries are resolved like exercise refs (typo corrected + recorded)", () => {
    // pushup is a known typo for push_up (Jaro-Winkler ≥ 0.85)
    const r = compileWplAi(
      req(
        "  contraindication knee_injury action exclude\n    affects pushup, pull_up",
      ),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const s = JSON.stringify(r.json);
      // pushup should be auto-corrected to push_up via resolveExerciseRef
      expect(s).toContain("push_up");
      // A repair entry should record the substitution
      expect(r.repairs).toContainEqual(
        expect.objectContaining({ type: "exercise_substitution", from: "pushup", to: "push_up" }),
      );
    }
  });

  it("affects entries that are valid catalog refs pass through unchanged", () => {
    const r = compileWplAi(
      req(
        "  contraindication knee_injury action exclude\n    affects pull_up, push_up",
      ),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const s = JSON.stringify(r.json);
      expect(s).toContain("pull_up");
      expect(s).toContain("push_up");
      // No exercise_substitution repairs for valid refs
      expect(r.repairs.filter((rep) => rep.type === "exercise_substitution")).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Task 16 regression: multi-contraindication control-flow (skipNewlines path)
//
// These tests cover the path where ONE contraindication is followed by ANOTHER
// in the same REQUIRES block — the code path introduced by the skipNewlines
// fix before the affects indent check. Without the fix, the parser would
// misidentify the second contraindication header line as an affects entry or
// fall off into an error state.
// ---------------------------------------------------------------------------

describe("multiple consecutive contraindications in one REQUIRES block (Task 16 regression)", () => {
  it("two consecutive contraindication lines (no affects on either) both appear in compiled JSON", () => {
    const src =
      MINIMAL_PLAN +
      "\nREQUIRES\n" +
      "  contraindication lower_back_injury severity high action require_clearance\n" +
      "  contraindication knee_injury severity moderate action modify\n";

    const r = compileWplAi(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const s = JSON.stringify(r.json);
      expect(s).toContain("lower_back_injury");
      expect(s).toContain("knee_injury");
    }
  });

  it("contraindication with affects followed by another contraindication: both conditions present, affects resolved", () => {
    const src =
      MINIMAL_PLAN +
      "\nREQUIRES\n" +
      "  contraindication knee_injury action exclude\n" +
      "    affects pull_up, push_up\n" +
      "  contraindication lower_back_injury severity high action require_clearance\n";

    const r = compileWplAi(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const s = JSON.stringify(r.json);
      // Both conditions must be present
      expect(s).toContain("knee_injury");
      expect(s).toContain("lower_back_injury");
      // Affects entries on the first contraindication must be resolved
      expect(s).toContain("pull_up");
      expect(s).toContain("push_up");
      // The affects entries must NOT bleed onto lower_back_injury
      // (verify the second contraindication has no affects from the first block)
      expect(r.repairs.filter((rep) => rep.type === "exercise_substitution")).toHaveLength(0);
    }
  });
});

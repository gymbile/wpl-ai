import { describe, it, expect } from "vitest";
import { compileWplAi } from "../src/index.js";
import { MINIMAL_PLAN } from "./helpers/minimal-plan.js";

// MINIMAL_PLAN uses `push_up` which is in the catalog.
// `jefferson_curl` is a real exercise NOT in ALL_EXERCISES and does NOT
// fuzzy-correct to any catalog entry (Jaro-Winkler < 0.85 against all
// known refs — verified manually). It therefore takes the tier-2 verbatim
// passthrough path in resolveExerciseRef and the validator sees it as-is.

describe("unknown exercise refs produce a semantic warning", () => {
  it("jefferson_curl (real but uncataloged) compiles WITH a warning", () => {
    const src = MINIMAL_PLAN.replace(/\bpush_up\b/, "jefferson_curl");
    const r = compileWplAi(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(
        r.warnings.some(
          (w) =>
            /jefferson_curl/.test(w.message) &&
            /catalog|known exercise/.test(w.message),
        ),
      ).toBe(true);
    }
  });

  it("known exercises produce no catalog warning", () => {
    const r = compileWplAi(MINIMAL_PLAN);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(
        r.warnings.filter((w) => /catalog|known exercise/.test(w.message)),
      ).toHaveLength(0);
    }
  });
});

import { describe, it, expect } from "vitest";
import {
  ALL_EXERCISES,
  UPPER_BODY,
  LOWER_BODY,
  CORE,
  CARDIO_WARMUP,
  STRETCHING,
  FULL_BODY,
  isKnownExercise,
} from "../src/exercises.js";
import { suggest, bestMatch, validate } from "../src/exercise-matcher.js";

// ---------------------------------------------------------------------------
// 1. Exercise library (exercises.ts)
// ---------------------------------------------------------------------------
describe("Exercise library", () => {
  it("ALL_EXERCISES contains expected key exercises", () => {
    const expected = [
      "push_up",
      "squat",
      "bench_press",
      "plank",
      "deadlift",
      "pull_up",
      "lunge",
      "burpee",
      "crunch",
      "kettlebell_swing",
    ];
    for (const name of expected) {
      expect(ALL_EXERCISES).toContain(name);
    }
  });

  it("total count is reasonable (>100 exercises)", () => {
    expect(ALL_EXERCISES.length).toBeGreaterThan(100);
  });

  describe("categories exist and have items", () => {
    it("UPPER_BODY is non-empty", () => {
      expect(UPPER_BODY.length).toBeGreaterThan(0);
    });

    it("LOWER_BODY is non-empty", () => {
      expect(LOWER_BODY.length).toBeGreaterThan(0);
    });

    it("CORE is non-empty", () => {
      expect(CORE.length).toBeGreaterThan(0);
    });

    it("CARDIO_WARMUP is non-empty", () => {
      expect(CARDIO_WARMUP.length).toBeGreaterThan(0);
    });

    it("STRETCHING is non-empty", () => {
      expect(STRETCHING.length).toBeGreaterThan(0);
    });

    it("FULL_BODY is non-empty", () => {
      expect(FULL_BODY.length).toBeGreaterThan(0);
    });

    it("all categories together equal ALL_EXERCISES", () => {
      const combined = [
        ...UPPER_BODY,
        ...LOWER_BODY,
        ...CORE,
        ...CARDIO_WARMUP,
        ...STRETCHING,
        ...FULL_BODY,
      ];
      expect(combined).toEqual(ALL_EXERCISES);
    });
  });

  describe("isKnownExercise", () => {
    it("returns true for valid exercises", () => {
      expect(isKnownExercise("push_up")).toBe(true);
      expect(isKnownExercise("squat")).toBe(true);
      expect(isKnownExercise("deadlift")).toBe(true);
      expect(isKnownExercise("plank")).toBe(true);
      expect(isKnownExercise("bench_press")).toBe(true);
    });

    it("returns false for unknown exercises", () => {
      expect(isKnownExercise("pushup")).toBe(false);
      expect(isKnownExercise("flying_kick")).toBe(false);
      expect(isKnownExercise("")).toBe(false);
      expect(isKnownExercise("xyz123")).toBe(false);
    });
  });

  it("has no duplicates in ALL_EXERCISES", () => {
    const unique = new Set(ALL_EXERCISES);
    expect(unique.size).toBe(ALL_EXERCISES.length);
  });
});

// ---------------------------------------------------------------------------
// 2. Jaro-Winkler similarity via suggest()
// ---------------------------------------------------------------------------
describe("suggest() (Jaro-Winkler similarity)", () => {
  it('finds "push_up" for "pushup" (missing underscore)', () => {
    const results = suggest("pushup");
    expect(results).toContain("push_up");
  });

  it('finds "squat" for "squats" (plural)', () => {
    const results = suggest("squats");
    expect(results).toContain("squat");
  });

  it('finds "bench_press" for "benchpress" (missing underscore)', () => {
    const results = suggest("benchpress");
    expect(results).toContain("bench_press");
  });

  it('finds "plank" for "plnk" (typo)', () => {
    const results = suggest("plnk");
    expect(results).toContain("plank");
  });

  it('returns empty for completely unrelated input "xyz123abc"', () => {
    const results = suggest("xyz123abc");
    expect(results).toEqual([]);
  });

  it("returns at most 3 suggestions", () => {
    const results = suggest("press");
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("returns suggestions sorted by similarity (best first)", () => {
    const results = suggest("pushup");
    // The first result should be the closest match
    expect(results[0]).toBe("push_up");
  });
});

// ---------------------------------------------------------------------------
// 3. bestMatch()
// ---------------------------------------------------------------------------
describe("bestMatch()", () => {
  it('returns "push_up" for "pushup"', () => {
    expect(bestMatch("pushup")).toBe("push_up");
  });

  it('returns "squat" for "squats"', () => {
    expect(bestMatch("squats")).toBe("squat");
  });

  it('returns null for "xyz123"', () => {
    expect(bestMatch("xyz123")).toBeNull();
  });

  it('returns null for "foobar"', () => {
    expect(bestMatch("foobar")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. validate()
// ---------------------------------------------------------------------------
describe("validate()", () => {
  it('returns { ok: true } for "push_up"', () => {
    const result = validate("push_up");
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: true } for "deadlift"', () => {
    const result = validate("deadlift");
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: false, suggestions } for "pushup" with "push_up" in suggestions', () => {
    const result = validate("pushup");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.suggestions).toContain("push_up");
    }
  });

  it("returns { ok: false, suggestions: [] } for completely unknown input", () => {
    const result = validate("xyz123abc");
    expect(result).toEqual({ ok: false, suggestions: [] });
  });
});

import { describe, it, expect } from "vitest";
import { compileWplAi } from "../src/index.js";
import { validateSemantics } from "../src/validator.js";
import type { Document, MeasurementSpec, Checkpoint } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function compileAndGetWarnings(source: string) {
  const result = compileWplAi(source);
  if (!result.ok) {
    throw new Error(`Expected compilation to succeed but got errors:\n${result.formatted}`);
  }
  return result.warnings;
}

// ---------------------------------------------------------------------------
// Domain vocabulary warnings
// ---------------------------------------------------------------------------

describe("Semantic validator - domain vocabulary", () => {
  describe("goal categories", () => {
    it("no warning for valid goal category", () => {
      const source = `\
PLAN "Test"
TYPE workout

GOALS
  GOAL primary weight_loss:
    name "Lose weight"
`;
      const warnings = compileAndGetWarnings(source);
      const goalWarnings = warnings.filter(w => w.message.includes("goal category"));
      expect(goalWarnings).toHaveLength(0);
    });

    it("warns for unknown goal category", () => {
      const source = `\
PLAN "Test"
TYPE workout

GOALS
  GOAL primary lose_fat:
    name "Lose fat"
`;
      const warnings = compileAndGetWarnings(source);
      const goalWarnings = warnings.filter(w => w.message.includes("goal category"));
      expect(goalWarnings.length).toBeGreaterThan(0);
      expect(goalWarnings[0].message).toContain("lose_fat");
    });
  });

  describe("cardio modalities", () => {
    it("no warning for valid cardio modality", () => {
      const source = `\
PLAN "Test"
TYPE workout

PHASES
  PHASE "Main" (4 weeks):
    WEEK 1:
      DAY 1 training 30m:
        main:
          cardio running continuous:
            total 20 min
`;
      const warnings = compileAndGetWarnings(source);
      const cardioWarnings = warnings.filter(w => w.message.includes("cardio modality"));
      expect(cardioWarnings).toHaveLength(0);
    });

    it("warns for unknown cardio modality", () => {
      const source = `\
PLAN "Test"
TYPE workout

PHASES
  PHASE "Main" (4 weeks):
    WEEK 1:
      DAY 1 training 30m:
        main:
          cardio jogging continuous:
            total 20 min
`;
      const warnings = compileAndGetWarnings(source);
      const cardioWarnings = warnings.filter(w => w.message.includes("cardio modality"));
      expect(cardioWarnings.length).toBeGreaterThan(0);
      expect(cardioWarnings[0].message).toContain("jogging");
    });
  });

  describe("nutrition categories", () => {
    it("no warning for valid nutrition category", () => {
      const source = `\
PLAN "Test"
TYPE nutrition

PHASES
  PHASE "Main" (4 weeks):
    WEEK 1:
      DAY 1 training 30m:
        nutrition:
          nutrition meal:
            calories 300..500
`;
      const warnings = compileAndGetWarnings(source);
      const nutritionWarnings = warnings.filter(w => w.message.includes("nutrition category"));
      expect(nutritionWarnings).toHaveLength(0);
    });

    it("warns for unknown nutrition category", () => {
      const source = `\
PLAN "Test"
TYPE nutrition

PHASES
  PHASE "Main" (4 weeks):
    WEEK 1:
      DAY 1 training 30m:
        nutrition:
          nutrition breakfast:
            calories 300..500
`;
      const warnings = compileAndGetWarnings(source);
      const nutritionWarnings = warnings.filter(w => w.message.includes("nutrition category"));
      expect(nutritionWarnings.length).toBeGreaterThan(0);
      expect(nutritionWarnings[0].message).toContain("breakfast");
    });
  });

  describe("meditation categories", () => {
    it("no warning for valid meditation category", () => {
      const source = `\
PLAN "Test"
TYPE meditation

PHASES
  PHASE "Main" (4 weeks):
    WEEK 1:
      DAY 1 training 30m:
        meditation:
          meditation mindfulness:
            duration 10 min
`;
      const warnings = compileAndGetWarnings(source);
      const meditationWarnings = warnings.filter(w => w.message.includes("meditation category"));
      expect(meditationWarnings).toHaveLength(0);
    });

    it("warns for unknown meditation category", () => {
      const source = `\
PLAN "Test"
TYPE meditation

PHASES
  PHASE "Main" (4 weeks):
    WEEK 1:
      DAY 1 training 30m:
        meditation:
          meditation yoga:
            duration 10 min
`;
      const warnings = compileAndGetWarnings(source);
      const meditationWarnings = warnings.filter(w => w.message.includes("meditation category"));
      expect(meditationWarnings.length).toBeGreaterThan(0);
      expect(meditationWarnings[0].message).toContain("yoga");
    });
  });

  describe("recovery categories", () => {
    it("no warning for valid recovery category", () => {
      const source = `\
PLAN "Test"
TYPE recovery

PHASES
  PHASE "Main" (4 weeks):
    WEEK 1:
      DAY 1 training 30m:
        main:
          recovery stretching:
            duration 15 min
`;
      const warnings = compileAndGetWarnings(source);
      const recoveryWarnings = warnings.filter(w => w.message.includes("recovery category"));
      expect(recoveryWarnings).toHaveLength(0);
    });

    it("warns for unknown recovery category", () => {
      const source = `\
PLAN "Test"
TYPE recovery

PHASES
  PHASE "Main" (4 weeks):
    WEEK 1:
      DAY 1 training 30m:
        main:
          recovery sauna:
            duration 15 min
`;
      const warnings = compileAndGetWarnings(source);
      const recoveryWarnings = warnings.filter(w => w.message.includes("recovery category"));
      expect(recoveryWarnings.length).toBeGreaterThan(0);
      expect(recoveryWarnings[0].message).toContain("sauna");
    });
  });

  describe("habit categories", () => {
    it("warns for unknown habit category", () => {
      const source = `\
PLAN "Test"
TYPE hybrid

PHASES
  PHASE "Main" (4 weeks):
    WEEK 1:
      DAY 1 training 30m:
        main:
          habit journaling:
            target 1 entries
            frequency daily
`;
      const warnings = compileAndGetWarnings(source);
      const habitWarnings = warnings.filter(w => w.message.includes("habit category"));
      expect(habitWarnings.length).toBeGreaterThan(0);
      expect(habitWarnings[0].message).toContain("journaling");
    });
  });

  describe("fitness levels", () => {
    it("no warning for valid fitness level", () => {
      const source = `\
PLAN "Test"
TYPE workout

REQUIRES
  fitness beginner, intermediate
`;
      const warnings = compileAndGetWarnings(source);
      const fitnessWarnings = warnings.filter(w => w.message.includes("fitness level"));
      expect(fitnessWarnings).toHaveLength(0);
    });

    it("warns for unknown fitness level", () => {
      const source = `\
PLAN "Test"
TYPE workout

REQUIRES
  fitness elite
`;
      const warnings = compileAndGetWarnings(source);
      const fitnessWarnings = warnings.filter(w => w.message.includes("fitness level"));
      expect(fitnessWarnings.length).toBeGreaterThan(0);
      expect(fitnessWarnings[0].message).toContain("elite");
    });
  });

  describe("equipment", () => {
    it("no warning for valid equipment", () => {
      const source = `\
PLAN "Test"
TYPE workout

REQUIRES
  equipment dumbbells required
`;
      const warnings = compileAndGetWarnings(source);
      const equipWarnings = warnings.filter(w => w.message.includes("equipment"));
      expect(equipWarnings).toHaveLength(0);
    });

    it("warns for unknown equipment", () => {
      const source = `\
PLAN "Test"
TYPE workout

REQUIRES
  equipment sandbag required
`;
      const warnings = compileAndGetWarnings(source);
      const equipWarnings = warnings.filter(w => w.message.includes("equipment"));
      expect(equipWarnings.length).toBeGreaterThan(0);
      expect(equipWarnings[0].message).toContain("sandbag");
    });
  });

  describe("weight/distance unit", () => {
    it("warns when a muscle-group is used as a unit", () => {
      // Regression: muscle-group names like "biceps" used to be silently
      // accepted as valid weight/distance units. They should warn.
      const source = `\
PLAN "Test"
TYPE workout

GOALS
  GOAL primary muscle_gain:
    name "Bigger arms"
    target weight 5 biceps absolute
`;
      const warnings = compileAndGetWarnings(source);
      const unitWarnings = warnings.filter(w => w.message.includes("Unrecognized unit"));
      expect(unitWarnings.length).toBeGreaterThan(0);
      expect(unitWarnings[0]!.message).toContain("biceps");
    });

    it("does not warn for valid weight units", () => {
      const source = `\
PLAN "Test"
TYPE workout

GOALS
  GOAL primary weight_loss:
    name "Lose weight"
    target weight 5 kg relative
`;
      const warnings = compileAndGetWarnings(source);
      const unitWarnings = warnings.filter(w => w.message.includes("Unrecognized unit"));
      expect(unitWarnings).toHaveLength(0);
    });
  });

  describe("warnings include suggestions", () => {
    it("suggests close match for typo in cardio modality", () => {
      const source = `\
PLAN "Test"
TYPE workout

PHASES
  PHASE "Main" (4 weeks):
    WEEK 1:
      DAY 1 training 30m:
        main:
          cardio runing continuous:
            total 20 min
`;
      const warnings = compileAndGetWarnings(source);
      const cardioWarnings = warnings.filter(w => w.message.includes("cardio modality"));
      expect(cardioWarnings.length).toBeGreaterThan(0);
      expect(cardioWarnings[0].message).toContain("running");
    });
  });
});

// ---------------------------------------------------------------------------
// Position correctness — regression test for findInSource bug
// ---------------------------------------------------------------------------

describe("Semantic validator - warning positions", () => {
  it("points at the second occurrence of an unknown term, not the first", () => {
    // First cardio uses a valid modality "running" (no warning).
    // Second cardio uses an unknown modality "runing" (typo) — and crucially
    // the typo "runing" is a substring that does NOT collide with "running".
    // We assert that the warning points at the line containing "runing", not
    // line 1 of the source. Pre-fix, findInSource would still return the
    // first matching line/column for the keyword as searched against `lines`.
    //
    // To make this a real duplicate-term case, we use an unknown category
    // that intentionally appears twice in the source: once as a comment-like
    // string in the plan name, and once as the offending value.
    const source = `\
PLAN "lose_fat plan"
TYPE workout

GOALS
  GOAL primary lose_fat:
    name "Lose fat"
`;
    const result = compileWplAi(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const goalWarnings = result.warnings.filter(w => w.message.includes("goal category"));
    expect(goalWarnings.length).toBe(1);
    // The actual offending token is on line 5, not line 1.
    expect(goalWarnings[0]!.line).toBe(5);
  });

  it("points at the second of two activities sharing an unknown modality", () => {
    // Two cardio activities with the same unknown modality "joging".
    // Each warning should point at its own activity, not both at the first.
    const source = `\
PLAN "Test"
TYPE workout

PHASES
  PHASE "Main" (4 weeks):
    WEEK 1:
      DAY 1 training 60m:
        main:
          cardio joging continuous:
            total 20 min
          cardio joging continuous:
            total 20 min
`;
    const result = compileWplAi(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cardioWarnings = result.warnings.filter(w => w.message.includes("cardio modality"));
    expect(cardioWarnings.length).toBe(2);
    // First warning points at the first cardio activity, second at the second.
    expect(cardioWarnings[0]!.line).toBe(9);
    expect(cardioWarnings[1]!.line).toBe(11);
    // And they must not be identical positions.
    expect(cardioWarnings[0]!.line).not.toBe(cardioWarnings[1]!.line);
  });
});

// ---------------------------------------------------------------------------
// MeasurementMetric / MeasurementSpec / Questionnaire (schema v1.6.0)
// ---------------------------------------------------------------------------

/** Minimal Document factory for direct validator tests. */
function makeDocWithCheckpoint(measurements: (string | MeasurementSpec)[]): Document {
  return {
    header: {
      name: "Test",
      type: "workout",
      visibility: null,
      difficulty: null,
      duration: null,
      tags: null,
      language: "en",
      min_app_version: null,
      schema: null,
    },
    goals: null,
    requirements: null,
    personalization: null,
    athlete_thresholds: null,
    phases: [],
    progress: {
      checkpoints: [
        {
          name: "Week 4",
          trigger: { type: "time", every: 4, unit_count: 1 },
          measurements,
          questions: null,
        } as Checkpoint,
      ],
      points: null,
      achievements: null,
      streaks: null,
    },
    notifications: null,
    rendering: null,
  };
}

describe("Semantic validator - MeasurementMetric v1.6.0", () => {
  const checkpointPreamble = `\
PLAN "Test"
TYPE workout

PROGRESS
  CHECKPOINT "Week 4":
    at 4 weeks
    measure:
`;

  // --- DSL-path tests (exercise the parser → validator pipeline) ---

  it("no warning for typed MeasurementSpec with valid metric body_weight_kg", () => {
    const source = checkpointPreamble + `      body_weight_kg\n`;
    const warnings = compileAndGetWarnings(source);
    const metricWarnings = warnings.filter(w => w.message.includes("measurement metric"));
    expect(metricWarnings).toHaveLength(0);
  });

  it("no warning for typed MeasurementSpec questionnaire_score with valid questionnaire psqi", () => {
    const source = checkpointPreamble + `      questionnaire_score questionnaire psqi\n`;
    const warnings = compileAndGetWarnings(source);
    const metricWarnings = warnings.filter(w =>
      w.message.includes("measurement metric") || w.message.includes("questionnaire"),
    );
    expect(metricWarnings).toHaveLength(0);
  });

  it("no warning for legacy string 'weight' (back-compat, quoted form in DSL)", () => {
    // "weight" is in the legacy MEASUREMENT_METRICS vocabulary. Written as a quoted
    // string in the DSL it becomes a plain string item and must not produce a warning.
    const source = checkpointPreamble + `      "weight"\n`;
    const warnings = compileAndGetWarnings(source);
    const metricWarnings = warnings.filter(w => w.message.includes("measurement metric"));
    expect(metricWarnings).toHaveLength(0);
  });

  it("warns for plain string measurement item with unknown metric 'totally_made_up'", () => {
    // A bare-word unknown value is emitted as a plain string by the parser and must
    // produce a "measurement metric" warning.
    const source = checkpointPreamble + `      - totally_made_up\n`;
    const warnings = compileAndGetWarnings(source);
    const metricWarnings = warnings.filter(w => w.message.includes("measurement metric"));
    expect(metricWarnings.length).toBeGreaterThan(0);
    expect(metricWarnings[0]!.message).toContain("totally_made_up");
  });

  // --- Direct-AST tests (bypass parser; exercise validator object-path logic) ---

  it("no warning for typed MeasurementSpec { metric: 'body_weight_kg' } (direct AST)", () => {
    const doc = makeDocWithCheckpoint([{ metric: "body_weight_kg" } as MeasurementSpec]);
    const warnings = validateSemantics(doc, "");
    const metricWarnings = warnings.filter(w => w.message.includes("measurement metric"));
    expect(metricWarnings).toHaveLength(0);
  });

  it("no warning for { metric: 'questionnaire_score', questionnaire: 'psqi' } (direct AST)", () => {
    const doc = makeDocWithCheckpoint([
      { metric: "questionnaire_score", questionnaire: "psqi" } as MeasurementSpec,
    ]);
    const warnings = validateSemantics(doc, "");
    const relevant = warnings.filter(w =>
      w.message.includes("measurement metric") || w.message.includes("questionnaire"),
    );
    expect(relevant).toHaveLength(0);
  });

  it("warns for { metric: 'questionnaire_score', questionnaire: 'phq' } — 'phq' is not a valid questionnaire enum value", () => {
    // The valid value is "phq9"; "phq" must trigger a questionnaire warning.
    const doc = makeDocWithCheckpoint([
      { metric: "questionnaire_score", questionnaire: "phq" as never } as MeasurementSpec,
    ]);
    const warnings = validateSemantics(doc, "");
    const questWarnings = warnings.filter(w => w.message.includes("questionnaire"));
    expect(questWarnings.length).toBeGreaterThan(0);
    expect(questWarnings[0]!.message).toContain("phq");
  });

  it("warns for { metric: 'totally_made_up' } — unknown metric in typed spec (direct AST)", () => {
    const doc = makeDocWithCheckpoint([
      { metric: "totally_made_up" as never } as MeasurementSpec,
    ]);
    const warnings = validateSemantics(doc, "");
    const metricWarnings = warnings.filter(w => w.message.includes("measurement metric"));
    expect(metricWarnings.length).toBeGreaterThan(0);
    expect(metricWarnings[0]!.message).toContain("totally_made_up");
  });
});

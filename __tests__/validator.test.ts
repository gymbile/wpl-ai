import { describe, it, expect } from "vitest";
import { compileWplAi } from "../src/index.js";

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

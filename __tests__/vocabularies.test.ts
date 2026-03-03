import { describe, it, expect } from "vitest";
import {
  GOAL_CATEGORIES, GOAL_CATEGORY_SET,
  EXERCISE_CATEGORIES, EXERCISE_CATEGORY_SET,
  CARDIO_MODALITIES, CARDIO_MODALITY_SET,
  NUTRITION_CATEGORIES, NUTRITION_CATEGORY_SET,
  MEDITATION_CATEGORIES, MEDITATION_CATEGORY_SET,
  RECOVERY_CATEGORIES, RECOVERY_CATEGORY_SET,
  HABIT_CATEGORIES, HABIT_CATEGORY_SET,
  MUSCLE_GROUPS, MUSCLE_GROUP_SET,
  EQUIPMENT, EQUIPMENT_SET,
  FITNESS_LEVELS, FITNESS_LEVEL_SET,
  MEASUREMENT_METRICS, MEASUREMENT_METRIC_SET,
  WEIGHT_UNITS, WEIGHT_UNIT_SET,
  DISTANCE_UNITS,
  STREAK_TYPES, STREAK_TYPE_SET,
} from "../src/vocabularies.js";
import { validateVocabulary } from "../src/vocabulary-matcher.js";

// ---------------------------------------------------------------------------
// 1. Vocabulary completeness — each list is non-empty and matches its set
// ---------------------------------------------------------------------------
describe("Vocabulary lists", () => {
  const vocabs = [
    { name: "GOAL_CATEGORIES", list: GOAL_CATEGORIES, set: GOAL_CATEGORY_SET },
    { name: "EXERCISE_CATEGORIES", list: EXERCISE_CATEGORIES, set: EXERCISE_CATEGORY_SET },
    { name: "CARDIO_MODALITIES", list: CARDIO_MODALITIES, set: CARDIO_MODALITY_SET },
    { name: "NUTRITION_CATEGORIES", list: NUTRITION_CATEGORIES, set: NUTRITION_CATEGORY_SET },
    { name: "MEDITATION_CATEGORIES", list: MEDITATION_CATEGORIES, set: MEDITATION_CATEGORY_SET },
    { name: "RECOVERY_CATEGORIES", list: RECOVERY_CATEGORIES, set: RECOVERY_CATEGORY_SET },
    { name: "HABIT_CATEGORIES", list: HABIT_CATEGORIES, set: HABIT_CATEGORY_SET },
    { name: "MUSCLE_GROUPS", list: MUSCLE_GROUPS, set: MUSCLE_GROUP_SET },
    { name: "EQUIPMENT", list: EQUIPMENT, set: EQUIPMENT_SET },
    { name: "FITNESS_LEVELS", list: FITNESS_LEVELS, set: FITNESS_LEVEL_SET },
    { name: "MEASUREMENT_METRICS", list: MEASUREMENT_METRICS, set: MEASUREMENT_METRIC_SET },
    { name: "WEIGHT_UNITS", list: WEIGHT_UNITS, set: WEIGHT_UNIT_SET },
    { name: "STREAK_TYPES", list: STREAK_TYPES, set: STREAK_TYPE_SET },
  ];

  for (const { name, list, set } of vocabs) {
    describe(name, () => {
      it("is non-empty", () => {
        expect(list.length).toBeGreaterThan(0);
      });

      it("has no duplicates", () => {
        expect(new Set(list).size).toBe(list.length);
      });

      it("set size matches list length", () => {
        expect(set.size).toBe(list.length);
      });

      it("all list items are in the set", () => {
        for (const item of list) {
          expect(set.has(item)).toBe(true);
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Spec-mandated values are present
// ---------------------------------------------------------------------------
describe("Spec-mandated values", () => {
  it("goal categories include spec values", () => {
    for (const v of ["weight_loss", "muscle_gain", "endurance", "flexibility", "strength", "mental_wellness", "nutrition", "habit", "custom"]) {
      expect(GOAL_CATEGORY_SET.has(v)).toBe(true);
    }
  });

  it("cardio modalities include spec values", () => {
    for (const v of ["running", "cycling", "swimming", "rowing", "elliptical", "jump_rope"]) {
      expect(CARDIO_MODALITY_SET.has(v)).toBe(true);
    }
  });

  it("nutrition categories include spec values", () => {
    for (const v of ["meal", "snack", "supplement", "hydration"]) {
      expect(NUTRITION_CATEGORY_SET.has(v)).toBe(true);
    }
  });

  it("meditation categories include spec values", () => {
    for (const v of ["breathing", "mindfulness", "visualization", "body_scan", "sleep"]) {
      expect(MEDITATION_CATEGORY_SET.has(v)).toBe(true);
    }
  });

  it("recovery categories include spec values", () => {
    for (const v of ["stretching", "foam_rolling", "massage", "cold_therapy", "heat_therapy", "sleep"]) {
      expect(RECOVERY_CATEGORY_SET.has(v)).toBe(true);
    }
  });

  it("habit categories include spec values", () => {
    for (const v of ["hydration", "sleep", "steps", "screen_time", "custom"]) {
      expect(HABIT_CATEGORY_SET.has(v)).toBe(true);
    }
  });

  it("fitness levels include spec values", () => {
    for (const v of ["beginner", "intermediate", "advanced"]) {
      expect(FITNESS_LEVEL_SET.has(v)).toBe(true);
    }
  });

  it("weight units include spec values", () => {
    for (const v of ["kg", "lbs"]) {
      expect(WEIGHT_UNIT_SET.has(v)).toBe(true);
    }
  });

  it("distance units include spec values", () => {
    for (const v of ["meters", "km", "miles"]) {
      expect(DISTANCE_UNITS).toContain(v);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Vocabulary matcher
// ---------------------------------------------------------------------------
describe("validateVocabulary", () => {
  it("returns ok for known values", () => {
    expect(validateVocabulary("running", CARDIO_MODALITY_SET, CARDIO_MODALITIES).ok).toBe(true);
    expect(validateVocabulary("weight_loss", GOAL_CATEGORY_SET, GOAL_CATEGORIES).ok).toBe(true);
    expect(validateVocabulary("meal", NUTRITION_CATEGORY_SET, NUTRITION_CATEGORIES).ok).toBe(true);
  });

  it("returns not ok for unknown values", () => {
    const result = validateVocabulary("joggin", CARDIO_MODALITY_SET, CARDIO_MODALITIES);
    expect(result.ok).toBe(false);
  });

  it("suggests close matches", () => {
    const result = validateVocabulary("runing", CARDIO_MODALITY_SET, CARDIO_MODALITIES);
    expect(result.ok).toBe(false);
    expect(result.suggestions).toContain("running");
  });

  it("suggests close match for goal category typo", () => {
    const result = validateVocabulary("weight_los", GOAL_CATEGORY_SET, GOAL_CATEGORIES);
    expect(result.ok).toBe(false);
    expect(result.suggestions).toContain("weight_loss");
  });

  it("returns empty suggestions for completely unrelated input", () => {
    const result = validateVocabulary("xyz123abc", CARDIO_MODALITY_SET, CARDIO_MODALITIES);
    expect(result.ok).toBe(false);
    expect(result.suggestions).toEqual([]);
  });

  it("returns at most 3 suggestions", () => {
    const result = validateVocabulary("s", MUSCLE_GROUP_SET, MUSCLE_GROUPS);
    expect(result.suggestions.length).toBeLessThanOrEqual(3);
  });
});

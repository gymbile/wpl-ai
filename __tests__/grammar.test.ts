import { describe, it, expect } from "vitest";
import {
  GRAMMAR,
  PLAN_TYPE_SET,
  VISIBILITY_SET,
  DIFFICULTY_SET,
  SECTION_REQUIRED_SET,
  SECTION_ALL_SET,
  GOAL_PRIORITY_SET,
  MEASUREMENT_TYPE_SET,
  CONTRAINDICATION_ACTION_SET,
  INPUT_TYPE_SET,
  ACTION_SCOPE_SET,
  DAY_NAME_SET,
  DAY_TYPE_SET,
  BLOCK_TYPE_SET,
  BLOCK_STRUCTURE_SET,
  CARDIO_TYPE_SET,
  RECOVERY_SIDES_SET,
  TIME_UNIT_SHORT_SET,
  SCHEDULE_PREF_SET,
  SCHEDULE_FLEX_SET,
} from "../src/grammar.js";

// ---------------------------------------------------------------------------
// 1. Every GRAMMAR array is non-empty and has no duplicates
// ---------------------------------------------------------------------------
describe("GRAMMAR arrays", () => {
  const arrays: [string, readonly string[]][] = [
    ["plan_type", GRAMMAR.plan_type],
    ["visibility", GRAMMAR.visibility],
    ["difficulty", GRAMMAR.difficulty],
    ["goal_priority", GRAMMAR.goal_priority],
    ["measurement_type", GRAMMAR.measurement_type],
    ["contraindication_action", GRAMMAR.contraindication_action],
    ["input_type", GRAMMAR.input_type],
    ["comparison_op", GRAMMAR.comparison_op],
    ["logical_op", GRAMMAR.logical_op],
    ["action_type", GRAMMAR.action_type],
    ["action_scope", GRAMMAR.action_scope],
    ["day_name", GRAMMAR.day_name],
    ["day_type", GRAMMAR.day_type],
    ["block_type", GRAMMAR.block_type],
    ["block_structure", GRAMMAR.block_structure],
    ["cardio_modality", GRAMMAR.cardio_modality],
    ["cardio_type", GRAMMAR.cardio_type],
    ["nutrition_category", GRAMMAR.nutrition_category],
    ["meditation_category", GRAMMAR.meditation_category],
    ["recovery_category", GRAMMAR.recovery_category],
    ["habit_category", GRAMMAR.habit_category],
    ["recovery_sides", GRAMMAR.recovery_sides],
    ["weight_type", GRAMMAR.weight_type],
    ["unit_time", GRAMMAR.unit_time],
    ["unit_time_short", GRAMMAR.unit_time_short],
    ["unit_weight", GRAMMAR.unit_weight],
    ["schedule_pref", GRAMMAR.schedule_pref],
    ["schedule_flex", GRAMMAR.schedule_flex],
  ];

  for (const [name, arr] of arrays) {
    describe(name, () => {
      it("is non-empty", () => {
        expect(arr.length).toBeGreaterThan(0);
      });

      it("has no duplicates", () => {
        expect(new Set(arr).size).toBe(arr.length);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Sets match their source arrays
// ---------------------------------------------------------------------------
describe("Lookup sets", () => {
  const pairs: [string, Set<string>, readonly string[]][] = [
    ["PLAN_TYPE_SET", PLAN_TYPE_SET, GRAMMAR.plan_type],
    ["VISIBILITY_SET", VISIBILITY_SET, GRAMMAR.visibility],
    ["DIFFICULTY_SET", DIFFICULTY_SET, GRAMMAR.difficulty],
    ["GOAL_PRIORITY_SET", GOAL_PRIORITY_SET, GRAMMAR.goal_priority],
    ["MEASUREMENT_TYPE_SET", MEASUREMENT_TYPE_SET, GRAMMAR.measurement_type],
    ["CONTRAINDICATION_ACTION_SET", CONTRAINDICATION_ACTION_SET, GRAMMAR.contraindication_action],
    ["INPUT_TYPE_SET", INPUT_TYPE_SET, GRAMMAR.input_type],
    ["ACTION_SCOPE_SET", ACTION_SCOPE_SET, GRAMMAR.action_scope],
    ["DAY_NAME_SET", DAY_NAME_SET, GRAMMAR.day_name],
    ["DAY_TYPE_SET", DAY_TYPE_SET, GRAMMAR.day_type],
    ["BLOCK_TYPE_SET", BLOCK_TYPE_SET, GRAMMAR.block_type],
    ["BLOCK_STRUCTURE_SET", BLOCK_STRUCTURE_SET, GRAMMAR.block_structure],
    ["CARDIO_TYPE_SET", CARDIO_TYPE_SET, GRAMMAR.cardio_type],
    ["RECOVERY_SIDES_SET", RECOVERY_SIDES_SET, GRAMMAR.recovery_sides],
    ["TIME_UNIT_SHORT_SET", TIME_UNIT_SHORT_SET, GRAMMAR.unit_time_short],
    ["SCHEDULE_PREF_SET", SCHEDULE_PREF_SET, GRAMMAR.schedule_pref],
    ["SCHEDULE_FLEX_SET", SCHEDULE_FLEX_SET, GRAMMAR.schedule_flex],
  ];

  for (const [name, set, arr] of pairs) {
    it(`${name} size matches source array`, () => {
      expect(set.size).toBe(arr.length);
    });

    it(`${name} contains all source values`, () => {
      for (const v of arr) {
        expect(set.has(v)).toBe(true);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Section sets
// ---------------------------------------------------------------------------
describe("Section sets", () => {
  it("SECTION_REQUIRED_SET contains PHASES", () => {
    expect(SECTION_REQUIRED_SET.has("PHASES")).toBe(true);
  });

  it("SECTION_ALL_SET contains all required and optional sections", () => {
    for (const s of GRAMMAR.sections.required) {
      expect(SECTION_ALL_SET.has(s)).toBe(true);
    }
    for (const s of GRAMMAR.sections.optional) {
      expect(SECTION_ALL_SET.has(s)).toBe(true);
    }
  });

  it("SECTION_ALL_SET size is correct", () => {
    expect(SECTION_ALL_SET.size).toBe(
      GRAMMAR.sections.required.length + GRAMMAR.sections.optional.length,
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Spec-mandated values are present
// ---------------------------------------------------------------------------
describe("Spec-mandated values", () => {
  it("plan types include all spec values", () => {
    for (const v of ["workout", "nutrition", "meditation", "recovery", "hybrid"]) {
      expect(PLAN_TYPE_SET.has(v)).toBe(true);
    }
  });

  it("day types include all spec values", () => {
    for (const v of ["training", "rest", "active_recovery", "assessment"]) {
      expect(DAY_TYPE_SET.has(v)).toBe(true);
    }
  });

  it("block types include all spec values", () => {
    for (const v of ["warmup", "main", "cooldown", "nutrition", "meditation", "education", "assessment"]) {
      expect(BLOCK_TYPE_SET.has(v)).toBe(true);
    }
  });

  it("block structures include all spec values", () => {
    for (const v of ["circuit", "straight_sets", "superset", "emom", "amrap", "tabata"]) {
      expect(BLOCK_STRUCTURE_SET.has(v)).toBe(true);
    }
  });

  it("day names include all seven days", () => {
    for (const v of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
      expect(DAY_NAME_SET.has(v)).toBe(true);
    }
    expect(DAY_NAME_SET.size).toBe(7);
  });

  it("action scopes include all spec values", () => {
    for (const v of ["activity", "block", "day", "week", "phase", "plan"]) {
      expect(ACTION_SCOPE_SET.has(v)).toBe(true);
    }
  });

  it("input types include all spec values", () => {
    for (const v of ["number", "string", "array", "enum", "boolean"]) {
      expect(INPUT_TYPE_SET.has(v)).toBe(true);
    }
  });
});

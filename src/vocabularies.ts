// ---------------------------------------------------------------------------
// WPL Domain Vocabularies
// ---------------------------------------------------------------------------
// Predefined values from the WPL specification for domain-specific fields.
// These are used for semantic validation (warnings) — plans with unknown
// values still parse and compile, but the validator flags them.
//
// Enums shared with the parser grammar are imported from grammar.ts
// (the single source of truth for parser-level vocabulary).
// ---------------------------------------------------------------------------

import { GRAMMAR } from "./grammar.js";

// ---------------------------------------------------------------------------
// Goal Categories (spec §1)
// ---------------------------------------------------------------------------

export const GOAL_CATEGORIES = [
  "weight_loss",
  "muscle_gain",
  "endurance",
  "flexibility",
  "strength",
  "mental_wellness",
  "nutrition",
  "habit",
  "custom",
] as const;

// ---------------------------------------------------------------------------
// Exercise Categories (spec §5.1)
// ---------------------------------------------------------------------------

export const EXERCISE_CATEGORIES = [
  "strength",
  "cardio",
  "flexibility",
  "balance",
  "plyometric",
] as const;

// ---------------------------------------------------------------------------
// Cardio Modalities (spec §5.2) — sourced from grammar.ts
// ---------------------------------------------------------------------------

export const CARDIO_MODALITIES = GRAMMAR.cardio_modality;

// ---------------------------------------------------------------------------
// Nutrition Categories (spec §5.3) — sourced from grammar.ts
// ---------------------------------------------------------------------------

export const NUTRITION_CATEGORIES = GRAMMAR.nutrition_category;

// ---------------------------------------------------------------------------
// Meditation Categories (spec §5.4) — sourced from grammar.ts
// ---------------------------------------------------------------------------

export const MEDITATION_CATEGORIES = GRAMMAR.meditation_category;

// ---------------------------------------------------------------------------
// Recovery Categories (spec §5.5) — sourced from grammar.ts
// ---------------------------------------------------------------------------

export const RECOVERY_CATEGORIES = GRAMMAR.recovery_category;

// ---------------------------------------------------------------------------
// Habit Categories (spec §5.6) — sourced from grammar.ts
// ---------------------------------------------------------------------------

export const HABIT_CATEGORIES = GRAMMAR.habit_category;

// ---------------------------------------------------------------------------
// Muscle Groups (spec §8 exercise library)
// ---------------------------------------------------------------------------

export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "abs",
  "obliques",
  "quadriceps",
  "hamstrings",
  "glutes",
  "calves",
  "hip_flexors",
  "adductors",
  "abductors",
  "traps",
  "lats",
  "rhomboids",
  "rotator_cuff",
] as const;

// ---------------------------------------------------------------------------
// Equipment (spec §2)
// ---------------------------------------------------------------------------

export const EQUIPMENT = [
  "none",
  "dumbbells",
  "barbell",
  "kettlebell",
  "resistance_bands",
  "pull_up_bar",
  "bench",
  "cable_machine",
  "smith_machine",
  "leg_press_machine",
  "yoga_mat",
  "foam_roller",
  "medicine_ball",
  "stability_ball",
  "jump_rope",
  "treadmill",
  "stationary_bike",
  "rowing_machine",
  "elliptical_machine",
  "box",
  "trx",
  "battle_ropes",
  "water_bottles",
] as const;

// ---------------------------------------------------------------------------
// Fitness Levels (spec §2)
// ---------------------------------------------------------------------------

export const FITNESS_LEVELS = [
  "beginner",
  "intermediate",
  "advanced",
] as const;

// ---------------------------------------------------------------------------
// Measurement Metrics (spec §6 progress checkpoints)
// ---------------------------------------------------------------------------

export const MEASUREMENT_METRICS = [
  "weight",
  "body_fat",
  "bmi",
  "photos",
  "measurements",
  "chest",
  "waist",
  "hips",
  "arms",
  "thighs",
  "calves_circumference",
  "neck",
  "resting_heart_rate",
  "blood_pressure",
  "vo2_max",
  "1rm",
] as const;

// ---------------------------------------------------------------------------
// Weight Units (spec Standard Units)
// ---------------------------------------------------------------------------

export const WEIGHT_UNITS = [
  "kg",
  "lbs",
] as const;

// ---------------------------------------------------------------------------
// Distance Units (spec Standard Units)
// ---------------------------------------------------------------------------

export const DISTANCE_UNITS = [
  "meters",
  "km",
  "miles",
] as const;

// ---------------------------------------------------------------------------
// Streak Types (spec §6 progress)
// ---------------------------------------------------------------------------

export const STREAK_TYPES = [
  "daily_workout",
  "daily_nutrition",
  "daily_meditation",
] as const;

// ---------------------------------------------------------------------------
// Lookup sets for O(1) validation
// ---------------------------------------------------------------------------

export const GOAL_CATEGORY_SET = new Set<string>(GOAL_CATEGORIES);
export const EXERCISE_CATEGORY_SET = new Set<string>(EXERCISE_CATEGORIES);
export const CARDIO_MODALITY_SET = new Set<string>(CARDIO_MODALITIES);
export const NUTRITION_CATEGORY_SET = new Set<string>(NUTRITION_CATEGORIES);
export const MEDITATION_CATEGORY_SET = new Set<string>(MEDITATION_CATEGORIES);
export const RECOVERY_CATEGORY_SET = new Set<string>(RECOVERY_CATEGORIES);
export const HABIT_CATEGORY_SET = new Set<string>(HABIT_CATEGORIES);
export const MUSCLE_GROUP_SET = new Set<string>(MUSCLE_GROUPS);
export const EQUIPMENT_SET = new Set<string>(EQUIPMENT);
export const FITNESS_LEVEL_SET = new Set<string>(FITNESS_LEVELS);
export const MEASUREMENT_METRIC_SET = new Set<string>(MEASUREMENT_METRICS);
export const WEIGHT_UNIT_SET = new Set<string>(WEIGHT_UNITS);
export const DISTANCE_UNIT_SET = new Set<string>(DISTANCE_UNITS);
export const STREAK_TYPE_SET = new Set<string>(STREAK_TYPES);

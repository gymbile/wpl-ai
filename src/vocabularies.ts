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
  "recovery",
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

// ---------------------------------------------------------------------------
// v1.6.0 Vocabulary Additions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Recovery Modalities (spec §5.5, schema v1.6.0)
// ---------------------------------------------------------------------------

export const RECOVERY_MODALITIES = [
  "static_stretch",
  "dynamic_stretch",
  "pnf",
  "smr_foam_roll",
  "smr_ball",
  "breathwork",
  "mobility_drill",
] as const;

export const RECOVERY_MODALITY_SET = new Set<string>(RECOVERY_MODALITIES);

/**
 * Natural-language synonym map → canonical RecoveryModality enum value.
 * Keys are lowercase; consumers should normalise input before lookup.
 */
export const RECOVERY_MODALITY_SYNONYMS: Record<string, string> = {
  // static_stretch
  "stretch": "static_stretch",
  "static stretch": "static_stretch",
  "static stretching": "static_stretch",
  "hold stretch": "static_stretch",
  "passive stretch": "static_stretch",
  // dynamic_stretch
  "dynamic stretch": "dynamic_stretch",
  "dynamic stretching": "dynamic_stretch",
  "active stretch": "dynamic_stretch",
  // pnf
  "pnf": "pnf",
  "contract-relax": "pnf",
  "contract relax": "pnf",
  "proprioceptive neuromuscular facilitation": "pnf",
  // smr_foam_roll
  "foam roll": "smr_foam_roll",
  "foam_roll": "smr_foam_roll",
  "foam roller": "smr_foam_roll",
  "foam_roller": "smr_foam_roll",
  "foam rolling": "smr_foam_roll",
  "smr foam roll": "smr_foam_roll",
  "self-myofascial release foam": "smr_foam_roll",
  // smr_ball
  "lacrosse ball": "smr_ball",
  "massage ball": "smr_ball",
  "smr ball": "smr_ball",
  "tennis ball": "smr_ball",
  // breathwork
  "breathing": "breathwork",
  "breathwork": "breathwork",
  "breath work": "breathwork",
  "diaphragmatic breathing": "breathwork",
  // mobility_drill
  "mobility drill": "mobility_drill",
  "mobility": "mobility_drill",
  "active mobility": "mobility_drill",
  "joint mobility": "mobility_drill",
};

// ---------------------------------------------------------------------------
// MeasurementMetric (spec §6 progress checkpoints, schema v1.6.0)
// ---------------------------------------------------------------------------

export const MEASUREMENT_METRIC_ENUM_VALUES = [
  "body_weight_kg",
  "waist_cm",
  "hip_cm",
  "body_fat_pct",
  "lean_mass_kg",
  "resting_hr_bpm",
  "hrv_rmssd_ms",
  "blood_pressure_systolic_mmhg",
  "blood_pressure_diastolic_mmhg",
  "vo2max_ml_kg_min",
  "six_min_walk_m",
  "cooper_test_m",
  "one_rm_kg",
  "grip_strength_kg",
  "vertical_jump_cm",
  "sit_and_reach_cm",
  "shoulder_flexion_deg",
  "sleep_hours_avg",
  "session_rpe_avg",
  "questionnaire_score",
  "photo",
  "free_text",
] as const;

export const MEASUREMENT_METRIC_ENUM_SET = new Set<string>(MEASUREMENT_METRIC_ENUM_VALUES);

/**
 * Natural-language synonym map → canonical MeasurementMetric value.
 * For blood pressure, 'blood pressure' is ambiguous (systolic vs diastolic);
 * consumers should disambiguate or emit both.
 */
export const MEASUREMENT_METRIC_SYNONYMS: Record<string, string> = {
  // body_weight_kg
  "weight": "body_weight_kg",
  "body weight": "body_weight_kg",
  "bw": "body_weight_kg",
  "scale weight": "body_weight_kg",
  // waist_cm
  "waist": "waist_cm",
  "waist circumference": "waist_cm",
  // hip_cm
  "hip": "hip_cm",
  "hips": "hip_cm",
  "hip circumference": "hip_cm",
  // body_fat_pct
  "body fat": "body_fat_pct",
  "body fat %": "body_fat_pct",
  "bf%": "body_fat_pct",
  // lean_mass_kg
  "lean mass": "lean_mass_kg",
  "lbm": "lean_mass_kg",
  "lean body mass": "lean_mass_kg",
  // resting_hr_bpm
  "resting heart rate": "resting_hr_bpm",
  "resting hr": "resting_hr_bpm",
  "rhr": "resting_hr_bpm",
  // hrv_rmssd_ms
  "hrv": "hrv_rmssd_ms",
  "heart rate variability": "hrv_rmssd_ms",
  "rmssd": "hrv_rmssd_ms",
  // blood_pressure_systolic_mmhg (systolic; consumers should also capture diastolic)
  "blood pressure": "blood_pressure_systolic_mmhg",
  "bp": "blood_pressure_systolic_mmhg",
  "systolic": "blood_pressure_systolic_mmhg",
  "systolic bp": "blood_pressure_systolic_mmhg",
  // blood_pressure_diastolic_mmhg
  "diastolic": "blood_pressure_diastolic_mmhg",
  "diastolic bp": "blood_pressure_diastolic_mmhg",
  // vo2max_ml_kg_min
  "vo2max": "vo2max_ml_kg_min",
  "vo2 max": "vo2max_ml_kg_min",
  "aerobic capacity": "vo2max_ml_kg_min",
  // one_rm_kg
  "1rm": "one_rm_kg",
  "one rep max": "one_rm_kg",
  "1 rep max": "one_rm_kg",
  // grip_strength_kg
  "grip strength": "grip_strength_kg",
  "handgrip": "grip_strength_kg",
  // sleep_hours_avg
  "sleep": "sleep_hours_avg",
  "sleep duration": "sleep_hours_avg",
  "hours of sleep": "sleep_hours_avg",
  // questionnaire_score
  "questionnaire": "questionnaire_score",
  "survey score": "questionnaire_score",
  // photo
  "photo": "photo",
  "progress photo": "photo",
  "picture": "photo",
  // free_text
  "notes": "free_text",
  "free text": "free_text",
};

// ---------------------------------------------------------------------------
// Questionnaire (spec §6, schema v1.6.0)
// ---------------------------------------------------------------------------

export const QUESTIONNAIRE_VALUES = [
  "phq9",
  "gad7",
  "ipaq_short",
  "ipaq_long",
  "psqi",
  "pss10",
  "borg_cr10",
  "rpe_session",
] as const;

export const QUESTIONNAIRE_SET = new Set<string>(QUESTIONNAIRE_VALUES);

export const QUESTIONNAIRE_SYNONYMS: Record<string, string> = {
  "phq-9": "phq9",
  "phq9": "phq9",
  "depression screen": "phq9",
  "gad-7": "gad7",
  "gad7": "gad7",
  "anxiety screen": "gad7",
  "ipaq short": "ipaq_short",
  "ipaq long": "ipaq_long",
  "ipaq": "ipaq_short",
  "psqi": "psqi",
  "sleep quality": "psqi",
  "pss": "pss10",
  "pss-10": "pss10",
  "stress scale": "pss10",
  "borg cr10": "borg_cr10",
  "borg": "borg_cr10",
  "rpe session": "rpe_session",
  "session rpe": "rpe_session",
};

// ---------------------------------------------------------------------------
// Contraindication Severity (schema v1.6.0)
// ---------------------------------------------------------------------------

export const CONTRAINDICATION_SEVERITIES = ["low", "moderate", "high"] as const;

export const CONTRAINDICATION_SEVERITY_SET = new Set<string>(CONTRAINDICATION_SEVERITIES);

/**
 * Synonym map for natural-language → canonical severity value.
 */
export const CONTRAINDICATION_SEVERITY_SYNONYMS: Record<string, string> = {
  "low": "low",
  "mild": "low",
  "minor": "low",
  "low risk": "low",
  "moderate": "moderate",
  "medium": "moderate",
  "medium risk": "moderate",
  "moderate risk": "moderate",
  "high": "high",
  "severe": "high",
  "high risk": "high",
  "high-risk": "high",
  "serious": "high",
};

// ---------------------------------------------------------------------------
// Contraindication Action extensions (schema v1.6.0: adds require_clearance)
// ---------------------------------------------------------------------------

export const CONTRAINDICATION_ACTIONS = ["exclude", "modify", "require_clearance"] as const;

export const CONTRAINDICATION_ACTION_SET = new Set<string>(CONTRAINDICATION_ACTIONS);

export const CONTRAINDICATION_ACTION_SYNONYMS: Record<string, string> = {
  "exclude": "exclude",
  "skip": "exclude",
  "remove": "exclude",
  "modify": "modify",
  "adjust": "modify",
  "substitute": "modify",
  "require_clearance": "require_clearance",
  "clearance": "require_clearance",
  "doctor clearance": "require_clearance",
  "doctor's note required": "require_clearance",
  "medical clearance": "require_clearance",
  "needs clearance": "require_clearance",
  "requires clearance": "require_clearance",
};

// ---------------------------------------------------------------------------
// WeightMetric (schema v1.6.0: percentage_1rm reference)
// ---------------------------------------------------------------------------

export const WEIGHT_METRICS = ["1RM", "e1RM", "training_max", "daily_max"] as const;

export const WEIGHT_METRIC_SET = new Set<string>(WEIGHT_METRICS);

export const WEIGHT_METRIC_SYNONYMS: Record<string, string> = {
  "1rm": "1RM",
  "tested 1rm": "1RM",
  "e1rm": "e1RM",
  "estimated 1rm": "e1RM",
  "velocity 1rm": "e1RM",
  "training max": "training_max",
  "training maximum": "training_max",
  "training_max": "training_max",
  "tm": "training_max",
  "daily max": "daily_max",
  "daily maximum": "daily_max",
  "daily_max": "daily_max",
  "auto-regulated max": "daily_max",
};

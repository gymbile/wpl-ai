// ---------------------------------------------------------------------------
// WPL-AI Semantic Validator
// ---------------------------------------------------------------------------
// Post-parse validation that checks plan type consistency, activity
// appropriateness, domain vocabulary correctness, and structural coherence.
// Produces warnings (not errors) so the plan still compiles but the user
// gets feedback.
// ---------------------------------------------------------------------------

import type {
  Document,
  PlanType,
  Activity,
} from "./types.js";

import { validateVocabulary } from "./vocabulary-matcher.js";
import {
  GOAL_CATEGORIES, GOAL_CATEGORY_SET,
  CARDIO_MODALITIES, CARDIO_MODALITY_SET,
  NUTRITION_CATEGORIES, NUTRITION_CATEGORY_SET,
  MEDITATION_CATEGORIES, MEDITATION_CATEGORY_SET,
  RECOVERY_CATEGORIES, RECOVERY_CATEGORY_SET,
  HABIT_CATEGORIES, HABIT_CATEGORY_SET,
  EQUIPMENT, EQUIPMENT_SET,
  FITNESS_LEVELS, FITNESS_LEVEL_SET,
  MEASUREMENT_METRICS, MEASUREMENT_METRIC_SET,
  WEIGHT_UNITS, WEIGHT_UNIT_SET,
  MUSCLE_GROUPS, MUSCLE_GROUP_SET,
  STREAK_TYPES, STREAK_TYPE_SET,
} from "./vocabularies.js";

export interface SemanticWarning {
  severity: "warning" | "info";
  message: string;
  line: number;
  column: number;
  length: number;
}

// Activity kinds expected for each plan type
const EXPECTED_ACTIVITIES: Record<PlanType, Set<string>> = {
  workout: new Set(["exercise", "cardio", "recovery", "simple"]),
  nutrition: new Set(["nutrition", "simple"]),
  meditation: new Set(["meditation", "simple"]),
  recovery: new Set(["recovery", "meditation", "simple"]),
  hybrid: new Set(["exercise", "cardio", "nutrition", "meditation", "recovery", "habit", "simple"]),
};

// Block types expected for each plan type
const EXPECTED_BLOCKS: Record<PlanType, Set<string>> = {
  workout: new Set(["warmup", "main", "cooldown", "education", "assessment"]),
  nutrition: new Set(["nutrition", "education"]),
  meditation: new Set(["meditation", "education"]),
  recovery: new Set(["warmup", "main", "cooldown", "education"]),
  hybrid: new Set(["warmup", "main", "cooldown", "nutrition", "meditation", "education", "assessment"]),
};

export function validateSemantics(doc: Document, source: string): SemanticWarning[] {
  const warnings: SemanticWarning[] = [];
  const planType = doc.header.type;
  const lines = source.split("\n");

  // --- Plan type consistency (skip for hybrid) ---
  if (planType !== "hybrid") {
    const allowedActivities = EXPECTED_ACTIVITIES[planType];
    const allowedBlocks = EXPECTED_BLOCKS[planType];

    for (const phase of doc.phases ?? []) {
      for (const week of phase.weeks ?? []) {
        for (const day of week.days ?? []) {
          for (const block of day.blocks ?? []) {
            if (!allowedBlocks.has(block.type)) {
              const loc = findInSource(lines, block.type);
              warnings.push({
                severity: "warning",
                message: `Block type "${block.type}" is unusual for a "${planType}" plan. Consider using TYPE hybrid.`,
                ...loc,
              });
            }

            for (const activity of block.activities ?? []) {
              if (!allowedActivities.has(activity.kind)) {
                const activityLabel = getActivityLabel(activity);
                const loc = findInSource(lines, activityLabel);
                warnings.push({
                  severity: "warning",
                  message: `${activity.kind} activity "${activityLabel}" doesn't match plan type "${planType}". Expected: ${Array.from(allowedActivities).join(", ")}.`,
                  ...loc,
                });
              }
            }
          }
        }
      }
    }
  }

  // --- Domain vocabulary validation ---
  validateGoalCategories(doc, lines, warnings);
  validateActivityVocabularies(doc, lines, warnings);
  validateRequirements(doc, lines, warnings);
  validateProgress(doc, lines, warnings);

  return warnings;
}

// ---------------------------------------------------------------------------
// Goal categories
// ---------------------------------------------------------------------------

function validateGoalCategories(
  doc: Document,
  lines: string[],
  warnings: SemanticWarning[],
): void {
  for (const goal of doc.goals ?? []) {
    checkVocabulary(goal.category, "goal category", GOAL_CATEGORY_SET, GOAL_CATEGORIES, lines, warnings);

    // Check target metric
    if (goal.target) {
      checkVocabulary(goal.target.metric, "measurement metric", MEASUREMENT_METRIC_SET, MEASUREMENT_METRICS, lines, warnings);
      if (goal.target.unit) {
        checkWeightOrDistanceUnit(goal.target.unit, lines, warnings);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Activity vocabularies (cardio modality, nutrition/meditation/recovery/habit categories)
// ---------------------------------------------------------------------------

function validateActivityVocabularies(
  doc: Document,
  lines: string[],
  warnings: SemanticWarning[],
): void {
  for (const phase of doc.phases ?? []) {
    for (const week of phase.weeks ?? []) {
      for (const day of week.days ?? []) {
        for (const block of day.blocks ?? []) {
          for (const activity of block.activities ?? []) {
            validateActivityValues(activity, lines, warnings);
          }
        }
      }
    }
  }
}

function validateActivityValues(
  activity: Activity,
  lines: string[],
  warnings: SemanticWarning[],
): void {
  switch (activity.kind) {
    case "cardio":
      checkVocabulary(activity.modality, "cardio modality", CARDIO_MODALITY_SET, CARDIO_MODALITIES, lines, warnings);
      break;
    case "nutrition":
      checkVocabulary(activity.category, "nutrition category", NUTRITION_CATEGORY_SET, NUTRITION_CATEGORIES, lines, warnings);
      break;
    case "meditation":
      checkVocabulary(activity.category, "meditation category", MEDITATION_CATEGORY_SET, MEDITATION_CATEGORIES, lines, warnings);
      break;
    case "recovery":
      checkVocabulary(activity.category, "recovery category", RECOVERY_CATEGORY_SET, RECOVERY_CATEGORIES, lines, warnings);
      break;
    case "habit":
      checkVocabulary(activity.category, "habit category", HABIT_CATEGORY_SET, HABIT_CATEGORIES, lines, warnings);
      break;
    case "exercise":
      if (activity.weight?.unit) {
        checkVocabulary(activity.weight.unit, "weight unit", WEIGHT_UNIT_SET, WEIGHT_UNITS, lines, warnings);
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// Requirements (fitness levels, equipment)
// ---------------------------------------------------------------------------

function validateRequirements(
  doc: Document,
  lines: string[],
  warnings: SemanticWarning[],
): void {
  const req = doc.requirements;
  if (!req) return;

  for (const level of req.fitness_levels ?? []) {
    checkVocabulary(level, "fitness level", FITNESS_LEVEL_SET, FITNESS_LEVELS, lines, warnings);
  }

  for (const equip of req.equipment ?? []) {
    checkVocabulary(equip.name, "equipment", EQUIPMENT_SET, EQUIPMENT, lines, warnings);
    for (const alt of equip.alternatives ?? []) {
      checkVocabulary(alt, "equipment", EQUIPMENT_SET, EQUIPMENT, lines, warnings);
    }
  }
}

// ---------------------------------------------------------------------------
// Progress (measurement metrics, streak types)
// ---------------------------------------------------------------------------

function validateProgress(
  doc: Document,
  lines: string[],
  warnings: SemanticWarning[],
): void {
  const progress = doc.progress;
  if (!progress) return;

  for (const cp of progress.checkpoints ?? []) {
    for (const m of cp.measurements ?? []) {
      checkVocabulary(m, "measurement metric", MEASUREMENT_METRIC_SET, MEASUREMENT_METRICS, lines, warnings);
    }
  }

  if (progress.streaks?.types) {
    for (const t of progress.streaks.types) {
      checkVocabulary(t, "streak type", STREAK_TYPE_SET, STREAK_TYPES, lines, warnings);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function checkVocabulary(
  value: string,
  fieldName: string,
  knownSet: Set<string>,
  allValues: readonly string[],
  lines: string[],
  warnings: SemanticWarning[],
): void {
  const result = validateVocabulary(value, knownSet, allValues);
  if (result.ok) return;

  const loc = findInSource(lines, value);
  let message: string;
  if (result.suggestions.length > 0) {
    message = `Unknown ${fieldName} "${value}". Did you mean: ${result.suggestions.join(", ")}?`;
  } else {
    message = `Unknown ${fieldName} "${value}". Expected: ${allValues.join(" | ")}.`;
  }
  warnings.push({ severity: "warning", message, ...loc });
}

function checkWeightOrDistanceUnit(
  unit: string,
  lines: string[],
  warnings: SemanticWarning[],
): void {
  if (WEIGHT_UNIT_SET.has(unit)) return;
  // Also allow percentage, common metric keywords, and time units
  if (unit === "percentage" || unit === "%" || unit === "percentage_1rm") return;

  const combined: string[] = [...WEIGHT_UNITS, ...MUSCLE_GROUPS]; // allow body measurement units
  const combinedSet = new Set(combined);
  if (combinedSet.has(unit)) return;

  // Not a known unit — skip warning for freeform units like "glasses", "steps", etc.
  // Only warn for values that look like they could be misspelled weight/distance units
  const result = validateVocabulary(unit, WEIGHT_UNIT_SET, WEIGHT_UNITS);
  if (!result.ok && result.suggestions.length > 0) {
    const loc = findInSource(lines, unit);
    warnings.push({
      severity: "info",
      message: `Unrecognized unit "${unit}". Did you mean: ${result.suggestions.join(", ")}?`,
      ...loc,
    });
  }
}

function getActivityLabel(activity: Activity): string {
  switch (activity.kind) {
    case "exercise":
      return activity.exercise_ref;
    case "cardio":
      return activity.modality;
    case "nutrition":
      return activity.category;
    case "meditation":
      return activity.category;
    case "recovery":
      return activity.category;
    case "habit":
      return activity.category;
    case "simple":
      return activity.name;
  }
}

function findInSource(
  lines: string[],
  keyword: string,
): { line: number; column: number; length: number } {
  for (let i = 0; i < lines.length; i++) {
    const col = lines[i]!.indexOf(keyword);
    if (col !== -1) {
      return { line: i + 1, column: col + 1, length: keyword.length };
    }
  }
  return { line: 1, column: 1, length: 1 };
}

// ---------------------------------------------------------------------------
// WPL-AI Semantic Validator
// ---------------------------------------------------------------------------
// Post-parse validation that checks plan type consistency, activity
// appropriateness, domain vocabulary correctness, and structural coherence.
// Produces warnings (not errors) so the plan still compiles but the user
// gets feedback.
//
// Position info comes from AST node ranges (recorded by the parser via
// makeRange). When a sub-node doesn't yet carry a range — e.g. Intensity
// values, NutritionTiming, Macros, etc. before Refactor C lands — we fall
// back to the closest enclosing parent's range.
// ---------------------------------------------------------------------------

import type {
  Document,
  PlanType,
  Activity,
  SourceRange,
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
  MEASUREMENT_METRIC_ENUM_VALUES, MEASUREMENT_METRIC_ENUM_SET,
  QUESTIONNAIRE_VALUES, QUESTIONNAIRE_SET,
  WEIGHT_UNITS, WEIGHT_UNIT_SET,
  MUSCLE_GROUP_SET,
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

// ---------------------------------------------------------------------------
// SourceMap: precomputed offset → line/column lookup
// ---------------------------------------------------------------------------

class SourceMap {
  private lineStarts: number[];
  readonly source: string;

  constructor(source: string) {
    this.source = source;
    this.lineStarts = [0];
    for (let i = 0; i < source.length; i++) {
      if (source[i] === "\n") this.lineStarts.push(i + 1);
    }
  }

  positionOf(offset: number): { line: number; column: number } {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi + 1) / 2);
      if (this.lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - this.lineStarts[lo]! + 1 };
  }

  // Resolve a range to {line, column, length}. If range is given and valid,
  // use it; otherwise fall back to first occurrence of `keyword` (legacy
  // behaviour — only used for sub-nodes without ranges).
  locateRange(
    range: SourceRange | undefined,
    fallbackKeyword: string,
  ): { line: number; column: number; length: number } {
    if (range && range.from >= 0 && range.to >= range.from) {
      // Find the first occurrence of fallbackKeyword inside the range, so
      // warnings about a sub-string (e.g. a vocabulary value) point at the
      // value within the parent's source span rather than the parent's start.
      const slice = this.source.slice(range.from, range.to);
      const relIdx = slice.indexOf(fallbackKeyword);
      if (relIdx !== -1) {
        const offset = range.from + relIdx;
        const { line, column } = this.positionOf(offset);
        return { line, column, length: fallbackKeyword.length };
      }
      // Substring not found inside the range — point at the range start.
      const { line, column } = this.positionOf(range.from);
      return { line, column, length: Math.max(1, range.to - range.from) };
    }

    // Legacy fallback: search whole source. Only reached when neither the
    // node nor any enclosing parent has a range — which after Refactor C
    // should never happen for the validator's emission sites.
    const idx = this.source.indexOf(fallbackKeyword);
    if (idx !== -1) {
      const { line, column } = this.positionOf(idx);
      return { line, column, length: fallbackKeyword.length };
    }
    return { line: 1, column: 1, length: 1 };
  }
}

export function validateSemantics(doc: Document, source: string): SemanticWarning[] {
  const warnings: SemanticWarning[] = [];
  const planType = doc.header.type;
  const sm = new SourceMap(source);

  // --- Plan type consistency (skip for hybrid) ---
  if (planType !== "hybrid") {
    const allowedActivities = EXPECTED_ACTIVITIES[planType];
    const allowedBlocks = EXPECTED_BLOCKS[planType];

    for (const phase of doc.phases ?? []) {
      for (const week of phase.weeks ?? []) {
        for (const day of week.days ?? []) {
          for (const block of day.blocks ?? []) {
            if (!allowedBlocks.has(block.type)) {
              const loc = sm.locateRange(block.range, block.type);
              warnings.push({
                severity: "warning",
                message: `Block type "${block.type}" is unusual for a "${planType}" plan. Consider using TYPE hybrid.`,
                ...loc,
              });
            }

            for (const activity of block.activities ?? []) {
              if (!allowedActivities.has(activity.kind)) {
                const activityLabel = getActivityLabel(activity);
                const loc = sm.locateRange(activity.range, activityLabel);
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
  validateGoalCategories(doc, sm, warnings);
  validateActivityVocabularies(doc, sm, warnings);
  validateRequirements(doc, sm, warnings);
  validateProgress(doc, sm, warnings);

  return warnings;
}

// ---------------------------------------------------------------------------
// Goal categories
// ---------------------------------------------------------------------------

function validateGoalCategories(
  doc: Document,
  sm: SourceMap,
  warnings: SemanticWarning[],
): void {
  for (const goal of doc.goals ?? []) {
    checkVocabulary(goal.category, "goal category", GOAL_CATEGORY_SET, GOAL_CATEGORIES, goal.range, sm, warnings);

    if (goal.target) {
      // Target sub-node has no range yet; fall back to the goal's range.
      // TODO(Refactor C): once Target carries a range, use it directly.
      // Accept both the legacy vocabulary and the v1.6.0 enum values.
      const combinedMetricSet = new Set<string>([...MEASUREMENT_METRIC_SET, ...MEASUREMENT_METRIC_ENUM_SET]);
      const combinedMetricValues = [...MEASUREMENT_METRICS, ...MEASUREMENT_METRIC_ENUM_VALUES.filter(v => !MEASUREMENT_METRIC_SET.has(v))];
      checkVocabulary(goal.target.metric, "measurement metric", combinedMetricSet, combinedMetricValues, goal.range, sm, warnings);
      if (goal.target.unit) {
        checkWeightOrDistanceUnit(goal.target.unit, goal.range, sm, warnings);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Activity vocabularies (cardio modality, nutrition/meditation/recovery/habit categories)
// ---------------------------------------------------------------------------

function validateActivityVocabularies(
  doc: Document,
  sm: SourceMap,
  warnings: SemanticWarning[],
): void {
  for (const phase of doc.phases ?? []) {
    for (const week of phase.weeks ?? []) {
      for (const day of week.days ?? []) {
        for (const block of day.blocks ?? []) {
          for (const activity of block.activities ?? []) {
            validateActivityValues(activity, sm, warnings);
          }
        }
      }
    }
  }
}

function validateActivityValues(
  activity: Activity,
  sm: SourceMap,
  warnings: SemanticWarning[],
): void {
  switch (activity.kind) {
    case "cardio":
      checkVocabulary(activity.modality, "cardio modality", CARDIO_MODALITY_SET, CARDIO_MODALITIES, activity.range, sm, warnings);
      break;
    case "nutrition":
      checkVocabulary(activity.category, "nutrition category", NUTRITION_CATEGORY_SET, NUTRITION_CATEGORIES, activity.range, sm, warnings);
      break;
    case "meditation":
      checkVocabulary(activity.category, "meditation category", MEDITATION_CATEGORY_SET, MEDITATION_CATEGORIES, activity.range, sm, warnings);
      break;
    case "recovery":
      checkVocabulary(activity.category, "recovery category", RECOVERY_CATEGORY_SET, RECOVERY_CATEGORIES, activity.range, sm, warnings);
      break;
    case "habit":
      checkVocabulary(activity.category, "habit category", HABIT_CATEGORY_SET, HABIT_CATEGORIES, activity.range, sm, warnings);
      break;
    case "exercise":
      if (activity.weight?.unit && activity.weight.type === "absolute") {
        // Weight sub-node has no range yet; fall back to the exercise's range.
        // TODO(Refactor C): once Weight carries a range, use it directly.
        // Only enforce the kg/lbs unit check for absolute weights;
        // percentage_1rm / percentage_bodyweight / bodyweight use "rm" or null
        // as their unit marker and should never trigger this warning.
        checkVocabulary(activity.weight.unit, "weight unit", WEIGHT_UNIT_SET, WEIGHT_UNITS, activity.range, sm, warnings);
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// Requirements (fitness levels, equipment)
// ---------------------------------------------------------------------------

function validateRequirements(
  doc: Document,
  sm: SourceMap,
  warnings: SemanticWarning[],
): void {
  const req = doc.requirements;
  if (!req) return;

  for (const level of req.fitness_levels ?? []) {
    checkVocabulary(level, "fitness level", FITNESS_LEVEL_SET, FITNESS_LEVELS, req.range, sm, warnings);
  }

  for (const equip of req.equipment ?? []) {
    // Equipment sub-node has no range yet; fall back to requirements' range.
    // TODO(Refactor C): once Equipment carries a range, use it directly.
    checkVocabulary(equip.name, "equipment", EQUIPMENT_SET, EQUIPMENT, req.range, sm, warnings);
    for (const alt of equip.alternatives ?? []) {
      checkVocabulary(alt, "equipment", EQUIPMENT_SET, EQUIPMENT, req.range, sm, warnings);
    }
  }
}

// ---------------------------------------------------------------------------
// Progress (measurement metrics, streak types)
// ---------------------------------------------------------------------------

function validateProgress(
  doc: Document,
  sm: SourceMap,
  warnings: SemanticWarning[],
): void {
  const progress = doc.progress;
  if (!progress) return;

  for (const cp of progress.checkpoints ?? []) {
    for (const m of cp.measurements ?? []) {
      if (typeof m === "string") {
        // Legacy string form: validate against combined legacy + v1.6.0 enum vocabulary.
        const combinedMetricSet = new Set<string>([...MEASUREMENT_METRIC_SET, ...MEASUREMENT_METRIC_ENUM_SET]);
        const combinedMetricValues = [...MEASUREMENT_METRICS, ...MEASUREMENT_METRIC_ENUM_VALUES.filter(v => !MEASUREMENT_METRIC_SET.has(v))];
        checkVocabulary(m, "measurement metric", combinedMetricSet, combinedMetricValues, cp.range, sm, warnings);
      } else {
        // Typed MeasurementSpec (v1.6.0+): validate m.metric against the enum set.
        checkVocabulary(m.metric, "measurement metric", MEASUREMENT_METRIC_ENUM_SET, MEASUREMENT_METRIC_ENUM_VALUES, cp.range, sm, warnings);
        // When metric is "questionnaire_score", also validate the questionnaire field.
        if (m.metric === "questionnaire_score" && m.questionnaire) {
          checkVocabulary(m.questionnaire, "questionnaire", QUESTIONNAIRE_SET, QUESTIONNAIRE_VALUES, cp.range, sm, warnings);
        }
        // m.note and m.unit are free strings per schema — no vocabulary check needed.
      }
    }
  }

  if (progress.streaks?.types) {
    // StreaksConfig sub-node has no range yet; fall back to progress' range.
    // TODO(Refactor C): once StreaksConfig carries a range, use it directly.
    for (const t of progress.streaks.types) {
      checkVocabulary(t, "streak type", STREAK_TYPE_SET, STREAK_TYPES, progress.range, sm, warnings);
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
  range: SourceRange | undefined,
  sm: SourceMap,
  warnings: SemanticWarning[],
): void {
  const result = validateVocabulary(value, knownSet, allValues);
  if (result.ok) return;

  const loc = sm.locateRange(range, value);
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
  range: SourceRange | undefined,
  sm: SourceMap,
  warnings: SemanticWarning[],
): void {
  if (WEIGHT_UNIT_SET.has(unit)) return;
  if (unit === "percentage" || unit === "%" || unit === "percentage_1rm") return;

  if (MUSCLE_GROUP_SET.has(unit)) {
    const loc = sm.locateRange(range, unit);
    warnings.push({
      severity: "warning",
      message: `Unrecognized unit "${unit}" looks like a muscle group, not a measurement unit.`,
      ...loc,
    });
    return;
  }

  const result = validateVocabulary(unit, WEIGHT_UNIT_SET, WEIGHT_UNITS);
  if (!result.ok && result.suggestions.length > 0) {
    const loc = sm.locateRange(range, unit);
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
    case "sub_plan":
      return activity.sub_plan_ref;
  }
}

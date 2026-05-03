// ---------------------------------------------------------------------------
// WPL-AI Compiler: AST -> WPL JSON
// ---------------------------------------------------------------------------
// Ported from gymbile_backend/lib/gymbile_backend/wellness_plans/wpl_ai/compiler.ex
// ---------------------------------------------------------------------------

import { randomBytes, randomUUID } from "node:crypto";

import type {
  Document,
  Header,
  Goal,
  Target,
  Milestone,
  Requirements,
  Equipment,
  Contraindication,
  TimeCommitment,
  Personalization,
  Input,
  Rule,
  Condition,
  Action,
  Phase,
  Week,
  Day,
  Block,
  Activity,
  Exercise,
  Cardio,
  Nutrition,
  Meditation,
  Recovery,
  RecoveryExercise,
  Habit,
  SimpleActivity,
  Duration,
  Weight,
  IntervalPattern,
  Macros,
  NutritionTiming,
  Progress,
  Checkpoint,
  PointsConfig,
  PointsRule,
  Notification,
  RepsSpec,
  PointerSourceMap,
} from "./types.js";

import type { CompileError } from "./errors.js";
import { CompileContext } from "./compile-context.js";
import { isKnownExercise } from "./exercises.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function compile(
  doc: Document,
):
  | { ok: true; json: Record<string, unknown>; pointerMap: PointerSourceMap }
  | { ok: false; errors: CompileError[] } {
  try {
    const ctx = new CompileContext();
    const json: Record<string, unknown> = {
      $schema: "https://wpl.dev/schemas/wpl/v1.schema.json",
      version: "1.0.0",
    };
    ctx.withSegment("plan", doc, () => {
      json.plan = compileDocument(doc, ctx);
    });
    return { ok: true, json, pointerMap: ctx.pointerMap };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack ?? null : null;
    return {
      ok: false,
      errors: [
        {
          kind: "compile",
          type: "internal_error",
          message: `Internal compiler error: ${message}. This is a wpl-ai bug, please report it at https://github.com/gymbile/wpl-ai/issues.`,
          path: null,
          details: stack ? { stack } : null,
        },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Remove keys whose value is null or undefined from a plain object. */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v !== null && v !== undefined) {
      result[key] = v;
    }
  }
  return result;
}

/** Generate a short random ID: `prefix_` + 8 hex chars. */
function generateShortId(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString("hex")}`;
}

/**
 * Convert a snake_case slug into a Title Cased human-readable name.
 * Special-cases a few well-known acronyms (HIIT, AMRAP, EMOM, RPE, RIR).
 */
const ACRONYMS = new Set(["hiit", "amrap", "emom", "rpe", "rir", "1rm"]);

function humanise(slug: string | null | undefined): string {
  if (!slug) return "";
  return slug
    .split(/[_\s-]+/)
    .filter((w) => w.length > 0)
    .map((w) => {
      const lower = w.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

function compileDocument(doc: Document, ctx: CompileContext): Record<string, unknown> {
  const plan: Record<string, unknown> = {
    id: randomUUID(),
    name: doc.header.name,
    type: doc.header.type,
    visibility: doc.header.visibility ?? "private",
    metadata: compileMetadata(doc.header),
    goals: ctx.withSegment("goals", undefined, () =>
      compileGoals(doc.goals ?? [], ctx),
    ),
    requirements: ctx.withSegment("requirements", doc.requirements ?? undefined, () =>
      compileRequirements(doc.requirements),
    ),
    personalization: ctx.withSegment(
      "personalization",
      doc.personalization ?? undefined,
      () => compilePersonalization(doc.personalization, ctx),
    ),
    phases: ctx.withSegment("phases", undefined, () =>
      compilePhases(doc.phases ?? [], ctx),
    ),
    progress: ctx.withSegment("progress", doc.progress ?? undefined, () =>
      compileProgress(doc.progress, ctx),
    ),
    notifications: ctx.withSegment("notifications", undefined, () =>
      compileNotifications(doc.notifications, ctx),
    ),
  };

  if (doc.athlete_thresholds) {
    // Top-level config — no AST node, so no withSegment pointer mapping.
    plan.athlete_thresholds = compileAthleteThresholds(doc.athlete_thresholds);
  }

  // Register a pointer for the rendering section even though the compiler
  // doesn't currently emit it into the JSON output. Useful for diagnostics.
  if (doc.rendering) {
    ctx.withSegment("rendering", doc.rendering, () => null);
  }

  return compact(plan);
}

function compileAthleteThresholds(t: import("./types.js").AthleteThresholds): Record<string, unknown> {
  return compact({
    hr_max_bpm: t.hr_max_bpm,
    lthr_bpm: t.lthr_bpm,
    resting_hr_bpm: t.resting_hr_bpm,
    ftp_watts: t.ftp_watts,
    vo2max_ml_kg_min: t.vo2max_ml_kg_min,
    critical_pace_seconds_per_km: t.critical_pace_seconds_per_km,
    body_weight_kg: t.body_weight_kg,
    one_rm: t.one_rm && t.one_rm.length > 0 ? t.one_rm : undefined,
  });
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

function compileMetadata(header: Header): Record<string, unknown> {
  const now = new Date().toISOString();
  const metadata: Record<string, unknown> = {
    created_at: now,
    updated_at: now,
  };

  if (header.tags) {
    metadata.tags = header.tags;
  }
  if (header.difficulty) {
    metadata.difficulty = header.difficulty;
  }
  if (header.language) {
    metadata.language = header.language;
  }
  if (header.duration) {
    const days = durationToDays(header.duration);
    if (days !== null) {
      metadata.estimated_duration_days = days;
    }
  }

  return metadata;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

function compileGoals(goals: Goal[], ctx: CompileContext): Record<string, unknown>[] {
  return goals.map((goal, i) =>
    ctx.withSegment(i, goal, () => compileGoal(goal, i + 1)),
  );
}

function compileGoal(goal: Goal, index: number): Record<string, unknown> {
  const compiled: Record<string, unknown> = {
    id: `goal_${index}`,
    type: goal.priority ?? "primary",
    category: goal.category,
  };

  if (goal.name) {
    compiled.name = goal.name;
  }
  if (goal.description) {
    compiled.description = goal.description;
  }
  if (goal.target) {
    compiled.target = compileTarget(goal.target);
  }
  if (goal.deadline) {
    compiled.deadline = goal.deadline;
  }
  if (goal.milestones && goal.milestones.length > 0) {
    compiled.milestones = goal.milestones.map(compileMilestone);
  }

  return compiled;
}

function compileTarget(target: Target): Record<string, unknown> {
  return {
    metric: target.metric,
    target_value: target.value,
    unit: target.unit,
    measurement_type: target.measurement_type ?? "absolute",
  };
}

function compileMilestone(milestone: Milestone): Record<string, unknown> {
  const compiled: Record<string, unknown> = {
    id: generateShortId("m"),
    name: milestone.name,
  };

  if (milestone.at_value != null) {
    compiled.target_value = milestone.at_value;
  }
  if (milestone.reward_points != null) {
    compiled.reward_points = milestone.reward_points;
  }

  return compiled;
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

function compileRequirements(req: Requirements | null): Record<string, unknown> {
  if (!req) return {};

  const compiled: Record<string, unknown> = {};

  if (req.age_range) {
    compiled.min_age = req.age_range[0];
    compiled.max_age = req.age_range[1];
  }

  if (req.fitness_levels && req.fitness_levels.length > 0) {
    compiled.fitness_level = req.fitness_levels;
  }

  if (req.equipment && req.equipment.length > 0) {
    compiled.equipment = req.equipment.map(compileEquipment);
  }

  if (req.contraindications && req.contraindications.length > 0) {
    compiled.contraindications = req.contraindications.map(compileContraindication);
  }

  if (req.time_commitment) {
    compiled.time_commitment = compileTimeCommitment(req.time_commitment);
  }

  return compiled;
}

function compileEquipment(equip: Equipment): Record<string, unknown> {
  const compiled: Record<string, unknown> = {
    id: equip.name.toLowerCase().replace(/ /g, "_"),
    name: equip.name,
    required: equip.required ?? false,
  };

  if (equip.alternatives && equip.alternatives.length > 0) {
    compiled.alternatives = equip.alternatives;
  }

  return compiled;
}

function compileContraindication(contra: Contraindication): Record<string, unknown> {
  const compiled: Record<string, unknown> = {
    condition: contra.condition,
    action: contra.action ?? "exclude",
  };

  if (contra.affects && contra.affects.length > 0) {
    compiled.affected_activities = contra.affects;
  }

  return compiled;
}

function compileTimeCommitment(tc: TimeCommitment): Record<string, unknown> {
  const compiled: Record<string, unknown> = {};

  if (tc.days_per_week) {
    compiled.min_days_per_week = tc.days_per_week[0];
    compiled.max_days_per_week = tc.days_per_week[1];
  }

  if (tc.minutes_per_day) {
    compiled.min_minutes_per_day = tc.minutes_per_day[0];
    compiled.max_minutes_per_day = tc.minutes_per_day[1];
  }

  return compiled;
}

// ---------------------------------------------------------------------------
// Personalization
// ---------------------------------------------------------------------------

function compilePersonalization(
  pers: Personalization | null,
  ctx: CompileContext,
): Record<string, unknown> {
  if (!pers) return { inputs: [], rules: [] };

  return {
    inputs: ctx.withSegment("inputs", undefined, () =>
      compileInputs(pers.inputs ?? [], ctx),
    ),
    rules: ctx.withSegment("rules", undefined, () =>
      compileRules(pers.rules ?? [], ctx),
    ),
  };
}

function compileInputs(inputs: Input[], ctx: CompileContext): Record<string, unknown>[] {
  return inputs.map((input, i) =>
    ctx.withSegment(i, input, () => compileInput(input, i + 1)),
  );
}

function compileInput(input: Input, index: number): Record<string, unknown> {
  const compiled: Record<string, unknown> = {
    id: input.name ?? `input_${index}`,
    type: input.type ?? "string",
    source: input.source ?? "questionnaire",
  };

  if (input.label) {
    compiled.label = input.label;
  }
  if (input.options && input.options.length > 0) {
    compiled.options = input.options;
  }

  return compiled;
}

function compileRules(rules: Rule[], ctx: CompileContext): Record<string, unknown>[] {
  return rules.map((rule, i) =>
    ctx.withSegment(i, rule, () => compileRule(rule, i + 1)),
  );
}

function compileRule(rule: Rule, index: number): Record<string, unknown> {
  return {
    id: `rule_${index}`,
    condition: compileCondition(rule.condition),
    actions: rule.actions.map(compileAction),
  };
}

function compileCondition(cond: Condition): Record<string, unknown> {
  if (cond.type === "compound") {
    return {
      operator: cond.operator!,
      conditions: (cond.conditions ?? []).map((c) => ({
        field: c.field,
        op: c.op!,
        value: c.value,
      })),
    };
  }

  // simple
  return {
    field: cond.field,
    op: cond.op!,
    value: cond.value,
  };
}

function compileAction(action: Action): Record<string, unknown> {
  const base: Record<string, unknown> = { type: action.type };
  const params = action.params ?? {};

  for (const [k, v] of Object.entries(params)) {
    base[k] = v;
  }

  return base;
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

function compilePhases(
  phases: Phase[],
  ctx: CompileContext,
): Record<string, unknown>[] {
  return phases.map((phase, i) =>
    ctx.withSegment(i, phase, () => compilePhase(phase, i + 1, ctx)),
  );
}

function compilePhase(
  phase: Phase,
  index: number,
  ctx: CompileContext,
): Record<string, unknown> {
  const compiled: Record<string, unknown> = {
    id: `phase_${index}`,
    name: phase.name,
    order: index,
  };

  if (phase.type) {
    compiled.type = phase.type;
  }
  if (phase.description) {
    compiled.description = phase.description;
  }
  if (phase.duration) {
    compiled.duration = compileDuration(phase.duration);
  }
  if (phase.weeks && phase.weeks.length > 0) {
    compiled.weeks = ctx.withSegment("weeks", undefined, () =>
      compileWeeks(phase.weeks, ctx),
    );
  }

  return compiled;
}

// ---------------------------------------------------------------------------
// Weeks
// ---------------------------------------------------------------------------

function compileWeeks(weeks: Week[], ctx: CompileContext): Record<string, unknown>[] {
  return weeks.map((week, i) =>
    ctx.withSegment(i, week, () => compileWeek(week, ctx)),
  );
}

function compileWeek(week: Week, ctx: CompileContext): Record<string, unknown> {
  const compiled: Record<string, unknown> = {
    id: `week_${week.number}`,
    name: week.name ?? `Week ${week.number}`,
    order: week.number,
  };

  if (week.is_deload === true) {
    compiled.is_deload = true;
  }

  if (week.days && week.days.length > 0) {
    compiled.days = ctx.withSegment("days", undefined, () =>
      compileDays(week.days, ctx),
    );
  }

  return compiled;
}

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

function compileDays(days: Day[], ctx: CompileContext): Record<string, unknown>[] {
  return days.map((day, i) =>
    ctx.withSegment(i, day, () => compileDay(day, i + 1, ctx)),
  );
}

function compileDay(
  day: Day,
  index: number,
  ctx: CompileContext,
): Record<string, unknown> {
  const compiled: Record<string, unknown> = {
    id: `day_${index}`,
    day_of_week: dayNameToNumber(day.day_name),
    type: day.day_type ?? "training",
  };

  if (day.label) {
    compiled.name = day.label;
  }
  if (day.duration) {
    const mins = durationToMinutes(day.duration);
    if (mins !== null) {
      compiled.estimated_duration_minutes = mins;
    }
  }
  if (day.blocks && day.blocks.length > 0) {
    compiled.blocks = ctx.withSegment("blocks", undefined, () =>
      compileBlocks(day.blocks, ctx),
    );
  }

  return compiled;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function compileBlocks(blocks: Block[], ctx: CompileContext): Record<string, unknown>[] {
  return blocks.map((block, i) =>
    ctx.withSegment(i, block, () => compileBlock(block, i + 1, ctx)),
  );
}

function compileBlock(
  block: Block,
  index: number,
  ctx: CompileContext,
): Record<string, unknown> {
  const compiled: Record<string, unknown> = {
    id: `${block.type}_block`,
    type: block.type,
    order: index,
  };

  if (block.structure) {
    compiled.structure = block.structure;
  }
  if (block.rounds != null) {
    compiled.rounds = block.rounds;
  }
  if (block.rest_between_rounds) {
    compiled.rest_between_rounds = compileDuration(block.rest_between_rounds);
  }
  if (block.activities && block.activities.length > 0) {
    compiled.activities = ctx.withSegment("activities", undefined, () =>
      block.activities.map((act, i) =>
        ctx.withSegment(i, act, () => compileActivity(act, i + 1, ctx)),
      ),
    );
  }

  return compiled;
}

// ---------------------------------------------------------------------------
// Activities (dispatch on kind)
// ---------------------------------------------------------------------------

function compileActivity(
  activity: Activity,
  index: number,
  ctx: CompileContext,
): Record<string, unknown> {
  switch (activity.kind) {
    case "exercise":
      return compileExercise(activity, index, ctx);
    case "cardio":
      return compileCardio(activity, index, ctx);
    case "nutrition":
      return compileNutrition(activity, index, ctx);
    case "meditation":
      return compileMeditation(activity, index, ctx);
    case "recovery":
      return compileRecovery(activity, index, ctx);
    case "habit":
      return compileHabit(activity, index, ctx);
    case "simple":
      return compileSimpleActivity(activity, index);
    case "sub_plan":
      return compileSubPlan(activity, index);
  }
}

function compileSubPlan(
  sp: import("./types.js").SubPlan,
  index: number,
): Record<string, unknown> {
  return compact({
    id: `sub_plan_${index}`,
    type: "sub_plan",
    name: sp.name ?? undefined,
    sub_plan_ref: sp.sub_plan_ref,
  });
}

// ---------------------------------------------------------------------------
// Exercise
// ---------------------------------------------------------------------------

function compileExercise(
  ex: Exercise,
  index: number,
  ctx: CompileContext,
): Record<string, unknown> {
  const compiled: Record<string, unknown> = {
    id: `exercise_${index}`,
    type: "exercise",
    exercise_ref: ex.exercise_ref,
    name: ex.name ?? humanise(ex.exercise_ref),
  };

  // Build prescription. The prescription is a synthetic group (no AST node
  // of its own); the activity's range covers it. Register the segment so
  // sub-pointers like prescription/weight resolve.
  const prescription = ctx.withSegment("prescription", ex, () => {
    const p: Record<string, unknown> = {};

    if (ex.sets != null) {
      p.sets = ex.sets;
    }

    const reps = compileReps(ex.reps);
    if (reps) {
      p.reps = reps;
    }

    if (ex.rest) {
      p.rest = compileDuration(ex.rest);
    }
    if (ex.tempo) {
      p.tempo = normalizeTempo(ex.tempo);
    }
    if (ex.weight) {
      p.weight = ctx.withSegment("weight", ex.weight, () => compileWeight(ex.weight!));
    }
    return p;
  });

  if (Object.keys(prescription).length > 0) {
    // Infer prescription.type per the canonical Elixir validator heuristic:
    //   sets/reps -> sets_reps, duration -> time, distance -> distance.
    // ExerciseActivity instances produced from main-block lines always carry
    // sets/reps (timed warmup/cooldown exercises take a separate path that
    // emits prescription.type = "time" directly).
    prescription.type = "sets_reps";
    compiled.prescription = prescription;
  }

  // Intensity markers
  if (ex.rpe != null) {
    compiled.target_rpe = ex.rpe;
  }
  if (ex.rir != null) {
    compiled.target_rir = ex.rir;
  }

  // Muscle / movement-pattern tagging (schema v1.3.0+)
  if (ex.primary_muscles && ex.primary_muscles.length > 0) {
    compiled.primary_muscles = ex.primary_muscles;
  }
  if (ex.secondary_muscles && ex.secondary_muscles.length > 0) {
    compiled.secondary_muscles = ex.secondary_muscles;
  }
  if (ex.movement_pattern) {
    compiled.movement_pattern = ex.movement_pattern;
  }

  return compiled;
}

// ---------------------------------------------------------------------------
// Reps compilation
// ---------------------------------------------------------------------------

function compileReps(reps: RepsSpec | null | undefined): Record<string, unknown> | null {
  if (reps == null) return null;

  if (typeof reps === "number") {
    return { target: reps };
  }

  if (Array.isArray(reps)) {
    if (reps.length === 3) {
      return { min: reps[0], max: reps[1], target: reps[2] };
    }
    if (reps.length === 2) {
      return { min: reps[0], max: reps[1] };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Cardio
// ---------------------------------------------------------------------------

function compileCardio(
  cardio: Cardio,
  index: number,
  ctx: CompileContext,
): Record<string, unknown> {
  const compiled: Record<string, unknown> = {
    id: `cardio_${index}`,
    type: "cardio",
    name: humanise(cardio.modality),
    modality: cardio.modality,
  };

  compiled.prescription = ctx.withSegment("prescription", cardio, () => {
    const p: Record<string, unknown> = { type: cardio.cardio_type ?? "continuous" };

    if (cardio.total_duration) {
      p.duration = compileDuration(cardio.total_duration);
    }
    if (cardio.zone != null) {
      const intensity: Record<string, unknown> = {
        type: "heart_rate_zone",
        zone: cardio.zone,
      };
      if (cardio.intensity?.zone_model) {
        intensity.zone_model = cardio.intensity.zone_model;
      }
      p.intensity = intensity;
    }
    if (cardio.intervals) {
      p.intervals = ctx.withSegment("intervals", cardio.intervals, () =>
        compileIntervals(cardio.intervals!),
      );
    }
    return p;
  });

  // Standalone intensity (rpe/heart_rate_zone/bpm/pace) sits outside the
  // prescription block. Register it under the activity's pointer.
  if (cardio.intensity) {
    ctx.withSegment("intensity", cardio.intensity, () => null);
  }

  return compiled;
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

function compileNutrition(
  nutrition: Nutrition,
  index: number,
  ctx: CompileContext,
): Record<string, unknown> {
  const compiled: Record<string, unknown> = {
    id: `nutrition_${index}`,
    type: "nutrition",
    name: humanise(nutrition.category),
    category: nutrition.category,
  };

  const prescription = ctx.withSegment("prescription", nutrition, () => {
    const p: Record<string, unknown> = {};
    if (nutrition.macros) {
      p.macros = ctx.withSegment("macros", nutrition.macros, () =>
        compileMacros(nutrition.macros!),
      );
    }
    if (nutrition.calories) {
      const cal: Record<string, unknown> = {
        min: nutrition.calories[0],
        max: nutrition.calories[1],
      };
      if (nutrition.calories_unit && nutrition.calories_unit !== "kcal") {
        cal.unit = nutrition.calories_unit;
      }
      p.calories = cal;
    }
    if (nutrition.suggestions && nutrition.suggestions.length > 0) {
      p.suggestions = nutrition.suggestions;
    }
    return p;
  });

  if (Object.keys(prescription).length > 0) {
    compiled.prescription = prescription;
  }

  if (nutrition.timing) {
    compiled.timing = ctx.withSegment("timing", nutrition.timing, () =>
      compileTiming(nutrition.timing!),
    );
  }

  return compiled;
}

// ---------------------------------------------------------------------------
// Meditation
// ---------------------------------------------------------------------------

function compileMeditation(
  meditation: Meditation,
  index: number,
  ctx: CompileContext,
): Record<string, unknown> {
  const compiled: Record<string, unknown> = {
    id: `meditation_${index}`,
    type: "meditation",
    name: `${humanise(meditation.category)} Meditation`,
    category: meditation.category,
  };

  const prescription = ctx.withSegment("prescription", meditation, () => {
    const p: Record<string, unknown> = {};
    if (meditation.duration) {
      p.duration = compileDuration(meditation.duration);
    }
    if (meditation.guided != null) {
      p.guided = meditation.guided;
    }
    return p;
  });

  if (Object.keys(prescription).length > 0) {
    compiled.prescription = prescription;
  }

  return compiled;
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

function compileRecovery(
  recovery: Recovery,
  index: number,
  ctx: CompileContext,
): Record<string, unknown> {
  // The parser wraps cooldown stretches as Recovery activities with
  // category: "cooldown" and a placeholder duration of {value: 0, unit: "minutes"}.
  // Schema-wise the canonical category for stretches is "stretching", so
  // normalise that here. Real explicit `recovery <category>:` declarations
  // (e.g. "recovery stretching:") arrive with a non-cooldown category and are
  // left alone.
  const category =
    recovery.category === "cooldown" ? "stretching" : recovery.category;

  const compiled: Record<string, unknown> = {
    id: `recovery_${index}`,
    type: "recovery",
    name: humanise(category),
    category,
  };

  const prescription = ctx.withSegment("prescription", recovery, () => {
    const p: Record<string, unknown> = {};

    // Drop placeholder zero-duration entries (parser default for synthesised
    // cooldown wrappers). Only emit real duration values.
    if (recovery.duration && recovery.duration.value > 0) {
      p.duration = compileDuration(recovery.duration);
    }

    if (recovery.exercises && recovery.exercises.length > 0) {
      p.exercises = ctx.withSegment("exercises", undefined, () =>
        recovery.exercises!.map((ex, i) =>
          ctx.withSegment(i, ex, () => compileRecoveryExercise(ex, i + 1)),
        ),
      );
    }
    return p;
  });

  if (Object.keys(prescription).length > 0) {
    compiled.prescription = prescription;
  }

  return compiled;
}

function compileRecoveryExercise(
  ex: RecoveryExercise,
  index: number,
): Record<string, unknown> {
  const compiled: Record<string, unknown> = {
    id: `recovery_exercise_${index}`,
    type: "recovery_exercise",
    name: ex.name,
  };

  if (ex.hold_seconds != null) {
    compiled.hold_seconds = ex.hold_seconds;
  }
  if (ex.reps != null) {
    compiled.reps = ex.reps;
  }
  if (ex.sides) {
    compiled.sides = ex.sides;
  }

  return compiled;
}

// ---------------------------------------------------------------------------
// Habit
// ---------------------------------------------------------------------------

function compileHabit(
  habit: Habit,
  index: number,
  ctx: CompileContext,
): Record<string, unknown> {
  const compiled: Record<string, unknown> = {
    id: `habit_${index}`,
    type: "habit",
    name: humanise(habit.category),
    category: habit.category,
  };

  const prescription = ctx.withSegment("prescription", habit, () => {
    const p: Record<string, unknown> = {};
    if (habit.target != null) {
      const target: Record<string, unknown> = { value: habit.target };
      if (habit.target_unit) {
        target.unit = habit.target_unit;
      }
      p.target = target;
    }
    if (habit.frequency) {
      p.frequency = habit.frequency;
    }
    if (habit.reminders && habit.reminders.length > 0) {
      p.reminder_times = habit.reminders;
    }
    return p;
  });

  if (Object.keys(prescription).length > 0) {
    compiled.prescription = prescription;
  }

  return compiled;
}

// ---------------------------------------------------------------------------
// Simple activity
// ---------------------------------------------------------------------------

function compileSimpleActivity(simple: SimpleActivity, index: number): Record<string, unknown> {
  // Fix 2: timed warmup/cooldown lines like `arm_circles 2m` are parsed as
  // SimpleActivity but reference real exercises. Emit them as ExerciseActivity
  // with a time-based prescription so they validate as proper exercises.
  if (simple.duration && isKnownExercise(simple.name)) {
    return {
      id: `exercise_${simple.name}_${index}`,
      type: "exercise",
      exercise_ref: simple.name,
      name: humanise(simple.name),
      prescription: {
        type: "time",
        duration: compileDuration(simple.duration),
      },
    };
  }

  const compiled: Record<string, unknown> = {
    id: `activity_${index}`,
    type: "simple",
    name: humanise(simple.name),
  };

  if (simple.duration) {
    compiled.duration = compileDuration(simple.duration);
  }

  return compiled;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

function compileProgress(
  progress: Progress | null,
  ctx: CompileContext,
): Record<string, unknown> | null {
  if (!progress) return null;

  const compiled: Record<string, unknown> = {};

  if (progress.checkpoints && progress.checkpoints.length > 0) {
    const checkpoints = progress.checkpoints;
    compiled.checkpoints = ctx.withSegment("checkpoints", undefined, () =>
      checkpoints.map((cp, i) =>
        ctx.withSegment(i, cp, () => compileCheckpoint(cp)),
      ),
    );
  }

  if (progress.points) {
    compiled.points = ctx.withSegment("points", progress.points, () =>
      compilePointsConfig(progress.points!, ctx),
    );
  }

  // Register pointers for achievements and streaks even though the compiler
  // doesn't currently emit them into the JSON output. Useful for diagnostics.
  if (progress.achievements && progress.achievements.length > 0) {
    ctx.withSegment("achievements", undefined, () => {
      progress.achievements!.forEach((ach, i) =>
        ctx.withSegment(i, ach, () => null),
      );
      return null;
    });
  }
  if (progress.streaks) {
    ctx.withSegment("streaks", progress.streaks, () => null);
  }

  return Object.keys(compiled).length === 0 ? null : compiled;
}

function compileCheckpoint(cp: Checkpoint): Record<string, unknown> {
  const compiled: Record<string, unknown> = {
    id: generateShortId("cp"),
    name: cp.name,
  };

  if (cp.trigger && cp.trigger.type === "time") {
    compiled.at = { value: cp.trigger.every, unit: String(cp.trigger.unit_count) };
  }

  if (cp.measurements && cp.measurements.length > 0) {
    compiled.measurements = cp.measurements;
  }
  if (cp.questions && cp.questions.length > 0) {
    compiled.questions = cp.questions;
  }

  return compiled;
}

function compilePointsConfig(
  pc: PointsConfig,
  ctx: CompileContext,
): Record<string, unknown> {
  const compiled: Record<string, unknown> = {
    enabled: pc.enabled ?? false,
  };

  if (pc.rules && pc.rules.length > 0) {
    const rules = pc.rules;
    compiled.rules = ctx.withSegment("rules", undefined, () =>
      rules.map((rule: PointsRule, i: number) =>
        ctx.withSegment(i, rule, () => ({
          event: rule.activity,
          points: rule.points,
        })),
      ),
    );
  }

  return compiled;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

function compileNotifications(
  notifications: Notification[] | null | undefined,
  ctx: CompileContext,
): Record<string, unknown>[] | null {
  if (!notifications || notifications.length === 0) return null;
  return notifications.map((notif, i) =>
    ctx.withSegment(i, notif, () => compileNotification(notif)),
  );
}

function compileNotification(notif: Notification): Record<string, unknown> {
  const compiled: Record<string, unknown> = {
    id: notif.id || generateShortId("notif"),
    enabled: notif.enabled ?? false,
    message: notif.message,
  };

  if (notif.timing) {
    compiled.timing_offset = compileDuration(notif.timing.duration);
    compiled.timing_reference = notif.timing.relative_to;
  }

  return compiled;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function compileDuration(dur: Duration): Record<string, unknown> {
  return { value: dur.value, unit: dur.unit };
}

/**
 * Normalize a tempo value into the structured form when the input is a
 * recognizable 4-digit notation:
 *   "3-1-1-0"  -> { eccentric: 3, pause_bottom: 1, concentric: 1, pause_top: 0 }
 *   "3110"     -> same
 *   "30X1"     -> { eccentric: 3, pause_bottom: 0, concentric: 0, pause_top: 1, explosive_concentric: true }
 * Falls back to the original (string or already-structured object) when the
 * input does not match these shapes — schema's `Tempo` is a oneOf so both
 * forms are valid.
 */
function normalizeTempo(tempo: import("./types.js").Tempo): unknown {
  if (typeof tempo !== "string") return tempo;

  const dashed = /^(\d+)[-:](\d+|X)[-:](\d+|X)[-:](\d+|X)$/i.exec(tempo);
  const fourDigit = /^(\d|X)(\d|X)(\d|X)(\d|X)$/i.exec(tempo);
  const m = dashed ?? fourDigit;
  if (!m) return tempo;

  const ecc = parseSeg(m[1]!);
  const pauseBottom = parseSeg(m[2]!);
  const conc = parseSeg(m[3]!);
  const pauseTop = parseSeg(m[4]!);

  // The eccentric phase cannot be "X" (no explosive lowering convention).
  if (ecc.value === null) return tempo;

  const result: Record<string, unknown> = {
    eccentric: ecc.value,
    pause_bottom: pauseBottom.value ?? 0,
    concentric: conc.value ?? 0,
    pause_top: pauseTop.value ?? 0,
  };
  if (conc.explosive) {
    result.explosive_concentric = true;
  }
  return result;
}

function parseSeg(s: string): { value: number | null; explosive: boolean } {
  if (s === "X" || s === "x") return { value: null, explosive: true };
  const n = Number(s);
  if (!Number.isFinite(n)) return { value: null, explosive: false };
  return { value: n, explosive: false };
}

function compileWeight(weight: Weight): Record<string, unknown> {
  if (weight.type === "bodyweight") {
    return { type: "bodyweight" };
  }
  return compact({
    type: weight.type ?? "absolute",
    value: weight.value,
    unit: weight.unit,
  });
}

function compileIntervals(pattern: IntervalPattern): Record<string, unknown> {
  return {
    work: { duration: pattern.work_seconds },
    rest: { duration: pattern.rest_seconds },
    repeat: pattern.repeats,
  };
}

function compileMacros(macros: Macros): Record<string, unknown> {
  const compiled: Record<string, unknown> = {};

  if (macros.protein) {
    compiled.protein = {
      min: macros.protein[0],
      max: macros.protein[1],
      unit: macros.protein[2] ?? "g",
    };
  }
  if (macros.carbs) {
    compiled.carbs = {
      min: macros.carbs[0],
      max: macros.carbs[1],
      unit: macros.carbs[2] ?? "g",
    };
  }
  if (macros.fat) {
    compiled.fat = {
      min: macros.fat[0],
      max: macros.fat[1],
      unit: macros.fat[2] ?? "g",
    };
  }

  return compiled;
}

function compileTiming(timing: NutritionTiming): Record<string, unknown> {
  // Map AST timing values to schema-valid NutritionTiming output.
  // Schema enum: "relative" | "absolute".
  //   AST "after_workout"  -> { type: "relative", reference: "workout_end",   offset? }
  //   AST "before_workout" -> { type: "relative", reference: "workout_start", offset? }
  //   AST "at_time"        -> { type: "absolute", time }
  if (timing.type === "at_time") {
    const compiled: Record<string, unknown> = { type: "absolute" };
    if (timing.time) {
      compiled.time = timing.time;
    }
    return compiled;
  }

  const reference =
    timing.type === "before_workout" ? "workout_start" : "workout_end";
  const compiled: Record<string, unknown> = {
    type: "relative",
    reference,
  };
  if (timing.duration) {
    // The reference ("workout_start" / "workout_end") already carries the
    // direction. Normalize the offset magnitude to a positive duration so the
    // emitted shape matches hand-authored examples in gymbile/wpl/examples.
    const dur = timing.duration;
    compiled.offset = compileDuration({
      ...dur,
      value: Math.abs(dur.value),
    });
  }
  return compiled;
}

// ---------------------------------------------------------------------------
// Unit conversions
// ---------------------------------------------------------------------------

function durationToDays(dur: Duration): number | null {
  switch (dur.unit) {
    case "weeks":
      return Math.trunc(dur.value * 7);
    case "days":
      return Math.trunc(dur.value);
    default:
      return null;
  }
}

function durationToMinutes(dur: Duration): number | null {
  switch (dur.unit) {
    case "minutes":
      return Math.trunc(dur.value);
    case "hours":
      return Math.trunc(dur.value * 60);
    case "seconds":
      return Math.trunc(dur.value / 60);
    default:
      return null;
  }
}

function dayNameToNumber(name: string | number): number {
  if (typeof name === "number") return name;

  switch (name.toLowerCase()) {
    case "monday":
      return 1;
    case "tuesday":
      return 2;
    case "wednesday":
      return 3;
    case "thursday":
      return 4;
    case "friday":
      return 5;
    case "saturday":
      return 6;
    case "sunday":
      return 7;
    default:
      return 1;
  }
}

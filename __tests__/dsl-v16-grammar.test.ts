// ---------------------------------------------------------------------------
// DSL grammar tests for WPL 1.6.0 features (parser/compiler path)
// Each describe block covers one feature gap. Tests use the full DSL syntax
// via compileWplAi, exercising the lexer → parser → compiler pipeline.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { compileWplAi } from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAN_HEADER = `\
PLAN "Test Plan"
TYPE workout
`;

const PHASES_HEADER = `\
PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training 60m:
`;

/** Compile a full plan string and assert success, returning the JSON plan object. */
function compilePlanOk(source: string): Record<string, unknown> {
  const result = compileWplAi(source);
  if (!result.ok) {
    throw new Error(
      `Expected compilation to succeed but got errors:\n${result.formatted}`,
    );
  }
  return result.json.plan as Record<string, unknown>;
}

/** Build a full DSL source with a REQUIRES block. */
function withRequires(requiresBody: string): string {
  return `${PLAN_HEADER}\nREQUIRES\n${requiresBody}\n\n${PHASES_HEADER}        main:\n`;
}

/** Build a full DSL source with a main block body. */
function withMainBlock(blockBody: string): string {
  return `${PLAN_HEADER}\n${PHASES_HEADER}        main:\n${blockBody}\n`;
}

/** Build a full DSL source with a cooldown block body. */
function withCooldownBlock(blockBody: string): string {
  return `${PLAN_HEADER}\n${PHASES_HEADER}        cooldown:\n${blockBody}\n`;
}

/** Build a full DSL source with a recovery block body. */
function withRecoveryBlock(blockBody: string): string {
  return `${PLAN_HEADER}\n${PHASES_HEADER}        cooldown:\n${blockBody}\n`;
}

/** Build a full DSL source with a PROGRESS section. */
function withProgress(progressBody: string): string {
  return `${PLAN_HEADER}\n${PHASES_HEADER}        main:\n          push_up 3x10\n\nPROGRESS\n${progressBody}\n`;
}

/** Extract the first activity from the first block of the first day. */
function getFirstActivity(
  plan: Record<string, unknown>,
  blockIndex = 0,
): Record<string, unknown> {
  const phase = (plan.phases as Array<Record<string, unknown>>)[0]!;
  const week = (phase.weeks as Array<Record<string, unknown>>)[0]!;
  const day = (week.days as Array<Record<string, unknown>>)[0]!;
  const block = (day.blocks as Array<Record<string, unknown>>)[blockIndex]!;
  return (block.activities as Array<Record<string, unknown>>)[0]!;
}

// ===========================================================================
// 1. Contraindication: severity + require_clearance action
// ===========================================================================

describe("Feature 1 — Contraindication severity + require_clearance (DSL)", () => {
  it("parses severity high and require_clearance action from DSL", () => {
    const src = withRequires(
      "  contraindication high_blood_pressure severity high action require_clearance\n",
    );
    const plan = compilePlanOk(src);
    const req = plan.requirements as Record<string, unknown>;
    const ci = (req.contraindications as Array<Record<string, unknown>>)[0]!;
    expect(ci.condition).toBe("high_blood_pressure");
    expect(ci.severity).toBe("high");
    expect(ci.action).toBe("require_clearance");
  });

  it("parses severity moderate with existing modify action", () => {
    const src = withRequires(
      "  contraindication knee_pain severity moderate action modify\n",
    );
    const plan = compilePlanOk(src);
    const req = plan.requirements as Record<string, unknown>;
    const ci = (req.contraindications as Array<Record<string, unknown>>)[0]!;
    expect(ci.condition).toBe("knee_pain");
    expect(ci.severity).toBe("moderate");
    expect(ci.action).toBe("modify");
  });

  it("parses severity low with exclude action", () => {
    const src = withRequires(
      "  contraindication mild_arthritis severity low action exclude\n",
    );
    const plan = compilePlanOk(src);
    const req = plan.requirements as Record<string, unknown>;
    const ci = (req.contraindications as Array<Record<string, unknown>>)[0]!;
    expect(ci.condition).toBe("mild_arthritis");
    expect(ci.severity).toBe("low");
    expect(ci.action).toBe("exclude");
  });

  it("back-compat: contraindication without severity still works (old DSL)", () => {
    // Old form: contraindication <name> -> <action>
    const src = withRequires(
      "  contraindication lower_back -> modify\n",
    );
    const plan = compilePlanOk(src);
    const req = plan.requirements as Record<string, unknown>;
    const ci = (req.contraindications as Array<Record<string, unknown>>)[0]!;
    expect(ci.condition).toBe("lower_back");
    expect(ci.action).toBe("modify");
    expect(ci.severity).toBeUndefined();
  });

  it("emits require_clearance without severity when only action given", () => {
    const src = withRequires(
      "  contraindication heart_condition action require_clearance\n",
    );
    const plan = compilePlanOk(src);
    const req = plan.requirements as Record<string, unknown>;
    const ci = (req.contraindications as Array<Record<string, unknown>>)[0]!;
    expect(ci.action).toBe("require_clearance");
    expect(ci.severity).toBeUndefined();
  });
});

// ===========================================================================
// 2. Reps.amrap flag
// ===========================================================================

describe("Feature 2 — Reps.amrap (DSL)", () => {
  it("parses 1xAMRAP (uppercase) and emits amrap: true in reps", () => {
    const src = withMainBlock("          push_up 1xAMRAP rpe 9\n");
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    const reps = rx.reps as Record<string, unknown>;
    expect(reps.amrap).toBe(true);
  });

  it("parses 3xAMRAP and emits sets=3 with amrap: true", () => {
    const src = withMainBlock("          bench_press 3xAMRAP weight 80% rm\n");
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    expect(rx.sets).toBe(3);
    const reps = rx.reps as Record<string, unknown>;
    expect(reps.amrap).toBe(true);
  });

  it("parses lowercase amrap token", () => {
    const src = withMainBlock("          squat 1x amrap\n");
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    const reps = rx.reps as Record<string, unknown>;
    expect(reps.amrap).toBe(true);
  });

  it("normal reps still work (no amrap flag emitted)", () => {
    const src = withMainBlock("          push_up 3x10\n");
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    const reps = rx.reps as Record<string, unknown>;
    expect(reps.amrap).toBeUndefined();
    expect(reps.target).toBe(10);
  });
});

// ===========================================================================
// 3. ExercisePrescription.to_failure
// ===========================================================================

describe("Feature 3 — ExercisePrescription.to_failure (DSL)", () => {
  it("emits to_failure: true when 'to_failure' modifier is present", () => {
    const src = withMainBlock(
      "          bench_press 3x6 weight 80% rm to_failure rest 120 seconds\n",
    );
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    expect(rx.to_failure).toBe(true);
  });

  it("emits to_failure without any other modifiers", () => {
    const src = withMainBlock("          push_up 3x10 to_failure\n");
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    expect(rx.to_failure).toBe(true);
  });

  it("to_failure can appear before rpe", () => {
    const src = withMainBlock("          squat 4x8 to_failure rpe 9\n");
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    expect(rx.to_failure).toBe(true);
    expect(act.target_rpe).toBe(9);
  });

  it("without to_failure the field is absent", () => {
    const src = withMainBlock("          push_up 3x10 rpe 7\n");
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    expect(rx.to_failure).toBeUndefined();
  });
});

// ===========================================================================
// 4. Weight.metric qualifier
// ===========================================================================

describe("Feature 4 — Weight.metric qualifier (DSL)", () => {
  it("parses 'weight 80% rm metric training_max' and emits metric field", () => {
    const src = withMainBlock(
      "          squat 3x5 weight 80% rm metric training_max\n",
    );
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    const wt = rx.weight as Record<string, unknown>;
    expect(wt.type).toBe("percentage_1rm");
    expect(wt.value).toBe(80);
    expect(wt.metric).toBe("training_max");
  });

  it("parses metric e1rm (canonical: e1RM)", () => {
    const src = withMainBlock(
      "          deadlift 3x3 weight 90% rm metric e1rm\n",
    );
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    const wt = rx.weight as Record<string, unknown>;
    expect(wt.metric).toBe("e1RM");
  });

  it("parses metric 1rm (canonical: 1RM)", () => {
    const src = withMainBlock(
      "          squat 5x5 weight 75% rm metric 1rm\n",
    );
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    const wt = rx.weight as Record<string, unknown>;
    expect(wt.metric).toBe("1RM");
  });

  it("parses metric daily_max", () => {
    const src = withMainBlock(
      "          bench_press 3x3 weight 85% rm metric daily_max\n",
    );
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    const wt = rx.weight as Record<string, unknown>;
    expect(wt.metric).toBe("daily_max");
  });

  it("weight without metric does not emit metric field", () => {
    const src = withMainBlock("          squat 3x5 weight 80% rm\n");
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    const wt = rx.weight as Record<string, unknown>;
    expect(wt.metric).toBeUndefined();
  });
});

// ===========================================================================
// 5. RecoveryExercise extensions: modality, pnf, intensity_rpe, body_part
// ===========================================================================

describe("Feature 5 — RecoveryExercise modality/pnf/intensity_rpe/body_part (DSL)", () => {
  /**
   * In a recovery activity block, each exercise line has the form:
   *   <name> <hold>s x<reps> [sides <both|left|right>] [modality <enum>] [intensity <n>] [body <text>]
   * Followed optionally by an indented pnf block:
   *   pnf <contract>s contract <relax>s relax <n> contractions
   */
  function withRecoveryActivity(exerciseLine: string, pnfLine?: string): string {
    const pnf = pnfLine
      ? `            ${pnfLine}\n`
      : "";
    return `${PLAN_HEADER}\n${PHASES_HEADER}        cooldown:\n          recovery stretching:\n            ${exerciseLine}\n${pnf}`;
  }

  it("parses modality static_stretch", () => {
    const src = withRecoveryActivity(
      "hip_flexor_stretch 30s x2 sides both modality static_stretch",
    );
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    const ex = (rx.exercises as Array<Record<string, unknown>>)[0]!;
    expect(ex.modality).toBe("static_stretch");
  });

  it("parses modality dynamic_stretch", () => {
    const src = withRecoveryActivity(
      "leg_swing 10s x10 modality dynamic_stretch",
    );
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    const ex = (rx.exercises as Array<Record<string, unknown>>)[0]!;
    expect(ex.modality).toBe("dynamic_stretch");
  });

  it("parses intensity_rpe from 'intensity N' keyword", () => {
    const src = withRecoveryActivity(
      "hamstring_stretch 30s x3 modality static_stretch intensity 6",
    );
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    const ex = (rx.exercises as Array<Record<string, unknown>>)[0]!;
    expect(ex.intensity_rpe).toBe(6);
  });

  it("parses body_part from 'body <token>' keyword", () => {
    const src = withRecoveryActivity(
      "pigeon_pose 45s x2 body hip_flexors",
    );
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    const ex = (rx.exercises as Array<Record<string, unknown>>)[0]!;
    expect(ex.body_part).toBe("hip_flexors");
  });

  it("parses all modifiers together: modality + intensity + body", () => {
    const src = withRecoveryActivity(
      "hip_flexor_stretch 30s x2 sides both modality pnf intensity 6 body hip_flexors",
    );
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    const ex = (rx.exercises as Array<Record<string, unknown>>)[0]!;
    expect(ex.modality).toBe("pnf");
    expect(ex.intensity_rpe).toBe(6);
    expect(ex.body_part).toBe("hip_flexors");
  });

  it("parses pnf block continuation line", () => {
    const src = withRecoveryActivity(
      "hip_flexor_stretch 30s x2 sides both modality pnf intensity 6 body hip_flexors",
      "pnf 6s contract 20s relax 3 contractions",
    );
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    const ex = (rx.exercises as Array<Record<string, unknown>>)[0]!;
    const pnf = ex.pnf as Record<string, unknown>;
    expect(pnf).toBeDefined();
    expect(pnf.contraction_seconds).toBe(6);
    expect(pnf.relax_seconds).toBe(20);
    expect(pnf.contractions).toBe(3);
  });

  it("recovery exercise without new modifiers still works (back-compat)", () => {
    const src = withRecoveryActivity("hamstring_stretch 30s x2 sides both");
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    const ex = (rx.exercises as Array<Record<string, unknown>>)[0]!;
    expect(ex.modality).toBeUndefined();
    expect(ex.intensity_rpe).toBeUndefined();
    expect(ex.pnf).toBeUndefined();
    expect(ex.body_part).toBeUndefined();
  });
});

// ===========================================================================
// 6. Checkpoint.measurements typed MeasurementSpec
// ===========================================================================

describe("Feature 6 — Checkpoint typed MeasurementSpec (DSL)", () => {
  it("parses bare metric token as typed MeasurementSpec", () => {
    const src = withProgress(
      `  CHECKPOINT "Baseline":\n    at 0 weeks\n    measure:\n      body_weight_kg\n`,
    );
    const plan = compilePlanOk(src);
    const progress = plan.progress as Record<string, unknown>;
    const cp = (progress.checkpoints as Array<Record<string, unknown>>)[0]!;
    const m = (cp.measurements as Array<unknown>)[0] as Record<string, unknown>;
    expect(m.metric).toBe("body_weight_kg");
  });

  it("parses questionnaire metric with questionnaire field and note", () => {
    const src = withProgress(
      `  CHECKPOINT "Week 4":\n    at 4 weeks\n    measure:\n      questionnaire_score questionnaire psqi note "sleep quality"\n`,
    );
    const plan = compilePlanOk(src);
    const progress = plan.progress as Record<string, unknown>;
    const cp = (progress.checkpoints as Array<Record<string, unknown>>)[0]!;
    const m = (cp.measurements as Array<unknown>)[0] as Record<string, unknown>;
    expect(m.metric).toBe("questionnaire_score");
    expect(m.questionnaire).toBe("psqi");
    expect(m.note).toBe("sleep quality");
  });

  it("preserves quoted string items as plain strings (back-compat)", () => {
    const src = withProgress(
      `  CHECKPOINT "Baseline":\n    at 0 weeks\n    measure:\n      "photos"\n      "body_fat"\n`,
    );
    const plan = compilePlanOk(src);
    const progress = plan.progress as Record<string, unknown>;
    const cp = (progress.checkpoints as Array<Record<string, unknown>>)[0]!;
    const measurements = cp.measurements as Array<unknown>;
    expect(measurements[0]).toBe("photos");
    expect(measurements[1]).toBe("body_fat");
  });

  it("mixes typed spec and plain strings", () => {
    const src = withProgress(
      `  CHECKPOINT "Mixed":\n    at 4 weeks\n    measure:\n      body_weight_kg\n      "photos"\n      hrv_rmssd_ms\n`,
    );
    const plan = compilePlanOk(src);
    const progress = plan.progress as Record<string, unknown>;
    const cp = (progress.checkpoints as Array<Record<string, unknown>>)[0]!;
    const measurements = cp.measurements as Array<unknown>;
    expect(measurements).toHaveLength(3);
    const first = measurements[0] as Record<string, unknown>;
    expect(first.metric).toBe("body_weight_kg");
    expect(measurements[1]).toBe("photos");
    const third = measurements[2] as Record<string, unknown>;
    expect(third.metric).toBe("hrv_rmssd_ms");
  });

  it("parses dash-prefixed typed MeasurementSpec with questionnaire and note", () => {
    const src = withProgress(
      `  CHECKPOINT "Month 1":\n    at 4 weeks\n    measure:\n      - body_weight_kg\n      - waist_cm\n      - questionnaire_score questionnaire psqi note "sleep quality"\n`,
    );
    const plan = compilePlanOk(src);
    const progress = plan.progress as Record<string, unknown>;
    const cp = (progress.checkpoints as Array<Record<string, unknown>>)[0]!;
    const measurements = cp.measurements as Array<unknown>;
    expect(measurements).toHaveLength(3);
    const first = measurements[0] as Record<string, unknown>;
    expect(first.metric).toBe("body_weight_kg");
    const second = measurements[1] as Record<string, unknown>;
    expect(second.metric).toBe("waist_cm");
    const third = measurements[2] as Record<string, unknown>;
    expect(third.metric).toBe("questionnaire_score");
    expect(third.questionnaire).toBe("psqi");
    expect(third.note).toBe("sleep quality");
  });

  it("parses dash-prefixed bare metric tokens as typed MeasurementSpec", () => {
    const src = withProgress(
      `  CHECKPOINT "Baseline":\n    at 0 weeks\n    measure:\n      - body_weight_kg\n      - hrv_rmssd_ms\n`,
    );
    const plan = compilePlanOk(src);
    const progress = plan.progress as Record<string, unknown>;
    const cp = (progress.checkpoints as Array<Record<string, unknown>>)[0]!;
    const measurements = cp.measurements as Array<unknown>;
    expect(measurements).toHaveLength(2);
    const first = measurements[0] as Record<string, unknown>;
    expect(first.metric).toBe("body_weight_kg");
    const second = measurements[1] as Record<string, unknown>;
    expect(second.metric).toBe("hrv_rmssd_ms");
  });
});

// ===========================================================================
// 7. Cardio intensity target bpm range emission
// ===========================================================================

describe("Feature 7 — Cardio intensity bpm min/max emission (compiler)", () => {
  it("emits intensity.target.min_bpm and max_bpm from bpm MIN..MAX", () => {
    const src = `${PLAN_HEADER}\n${PHASES_HEADER}        main:\n          cardio running continuous:\n            total 30 minutes\n            intensity bpm 150..170\n`;
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    const intensity = rx.intensity as Record<string, unknown>;
    expect(intensity).toBeDefined();
    const target = intensity.target as Record<string, unknown>;
    expect(target).toBeDefined();
    expect(target.min_bpm).toBe(150);
    expect(target.max_bpm).toBe(170);
  });

  it("does not emit target when only zone is specified", () => {
    const src = `${PLAN_HEADER}\n${PHASES_HEADER}        main:\n          cardio running continuous:\n            total 30 minutes\n            zone 2\n`;
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    const intensity = rx.intensity as Record<string, unknown>;
    // Zone intensity uses zone field, not target
    expect(intensity?.zone).toBe(2);
    expect(intensity?.target).toBeUndefined();
  });

  it("bpm 140..160 compiles to correct min/max values", () => {
    const src = `${PLAN_HEADER}\n${PHASES_HEADER}        main:\n          cardio cycling continuous:\n            total 45 minutes\n            intensity bpm 140..160\n`;
    const plan = compilePlanOk(src);
    const act = getFirstActivity(plan);
    const rx = act.prescription as Record<string, unknown>;
    const intensity = rx.intensity as Record<string, unknown>;
    const target = intensity.target as Record<string, unknown>;
    expect(target.min_bpm).toBe(140);
    expect(target.max_bpm).toBe(160);
  });
});

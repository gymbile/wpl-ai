// Coverage for DSL syntax added alongside schema v1.6.0:
// - Contraindication.severity + require_clearance action
// - Reps.amrap flag
// - ExercisePrescription.to_failure flag
// - Weight.metric for percentage_1rm
// - Checkpoint.measurements as typed MeasurementSpec objects
// - RecoveryExercise.modality + pnf + intensity_rpe + body_part
// - Version "1.6.0" emitted in compiled output

import { describe, expect, it } from "vitest";
import { compile } from "../src/compiler.js";
import type {
  Document,
  Exercise,
  RecoveryExercise,
  Recovery,
  Checkpoint,
  MeasurementSpec,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// Minimal Document factory
// ---------------------------------------------------------------------------

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    header: {
      name: "v1.6 test",
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
    progress: null,
    notifications: null,
    rendering: null,
    ...overrides,
  };
}

function compilePlan(doc: Document): Record<string, unknown> {
  const result = compile(doc);
  if (!result.ok) {
    throw new Error(`compile failed: ${JSON.stringify(result.errors, null, 2)}`);
  }
  return result.json.plan as Record<string, unknown>;
}

function getActivity(
  doc: Document,
  blockIndex: number,
  actIndex: number,
): Record<string, unknown> {
  const result = compile(doc);
  if (!result.ok) throw new Error("compile failed");
  const plan = result.json.plan as Record<string, unknown>;
  const phase = (plan.phases as Array<Record<string, unknown>>)[0];
  const week = (phase.weeks as Array<Record<string, unknown>>)[0];
  const day = (week.days as Array<Record<string, unknown>>)[0];
  const block = (day.blocks as Array<Record<string, unknown>>)[blockIndex];
  return (block.activities as Array<Record<string, unknown>>)[actIndex];
}

function makeDocWithExercise(exFields: Partial<Exercise>): Document {
  return makeDoc({
    phases: [
      {
        name: "P1",
        type: null,
        duration: { value: 1, unit: "weeks" },
        goals: null,
        description: null,
        weeks: [
          {
            number: 1,
            name: null,
            is_deload: null,
            days: [
              {
                day_name: "monday",
                day_type: "training",
                duration: { value: 60, unit: "minutes" },
                label: null,
                schedule: null,
                notes: null,
                blocks: [
                  {
                    type: "main",
                    structure: null,
                    rounds: null,
                    rest_between_rounds: null,
                    activities: [
                      {
                        kind: "exercise",
                        exercise_ref: "squat",
                        name: null,
                        sets: 3,
                        reps: 5,
                        reps_amrap: null,
                        rpe: null,
                        rir: null,
                        tempo: null,
                        rest: null,
                        weight: null,
                        to_failure: null,
                        primary_muscles: null,
                        secondary_muscles: null,
                        movement_pattern: null,
                        ...exFields,
                      } as Exercise,
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// 1. Version
// ---------------------------------------------------------------------------

describe("v1.6.0 version bump", () => {
  it("emits version 1.6.0 in compiled output", () => {
    const result = compile(makeDoc());
    if (!result.ok) throw new Error("compile failed");
    expect(result.json.version).toBe("1.6.0");
  });
});

// ---------------------------------------------------------------------------
// 2. Contraindication: severity + require_clearance
// ---------------------------------------------------------------------------

describe("v1.6.0 Contraindication enhancements", () => {
  it("emits severity field when provided", () => {
    const doc = makeDoc({
      requirements: {
        age_range: null,
        fitness_levels: null,
        equipment: null,
        time_commitment: null,
        contraindications: [
          {
            condition: "lower_back_injury",
            action: "modify",
            severity: "high",
            affects: null,
          },
        ],
      },
    });
    const plan = compilePlan(doc);
    const req = plan.requirements as Record<string, unknown>;
    const ci = (req.contraindications as Array<Record<string, unknown>>)[0];
    expect(ci.severity).toBe("high");
    expect(ci.action).toBe("modify");
  });

  it("emits require_clearance action", () => {
    const doc = makeDoc({
      requirements: {
        age_range: null,
        fitness_levels: null,
        equipment: null,
        time_commitment: null,
        contraindications: [
          {
            condition: "icd10:I50",
            action: "require_clearance",
            severity: "moderate",
            affects: null,
          },
        ],
      },
    });
    const plan = compilePlan(doc);
    const req = plan.requirements as Record<string, unknown>;
    const ci = (req.contraindications as Array<Record<string, unknown>>)[0];
    expect(ci.action).toBe("require_clearance");
    expect(ci.severity).toBe("moderate");
  });

  it("does not emit severity when not provided", () => {
    const doc = makeDoc({
      requirements: {
        age_range: null,
        fitness_levels: null,
        equipment: null,
        time_commitment: null,
        contraindications: [
          {
            condition: "knee_pain",
            action: "exclude",
            affects: null,
          },
        ],
      },
    });
    const plan = compilePlan(doc);
    const req = plan.requirements as Record<string, unknown>;
    const ci = (req.contraindications as Array<Record<string, unknown>>)[0];
    expect(ci.severity).toBeUndefined();
    expect(ci.action).toBe("exclude");
  });
});

// ---------------------------------------------------------------------------
// 3. Reps.amrap
// ---------------------------------------------------------------------------

describe("v1.6.0 Reps.amrap", () => {
  it("emits amrap: true in prescription.reps when reps_amrap is set", () => {
    const doc = makeDocWithExercise({ reps_amrap: true });
    const act = getActivity(doc, 0, 0);
    const rx = act.prescription as Record<string, unknown>;
    const reps = rx.reps as Record<string, unknown>;
    expect(reps.amrap).toBe(true);
    expect(reps.target).toBe(5);
  });

  it("does not emit amrap when reps_amrap is false", () => {
    const doc = makeDocWithExercise({ reps_amrap: false });
    const act = getActivity(doc, 0, 0);
    const rx = act.prescription as Record<string, unknown>;
    const reps = rx.reps as Record<string, unknown>;
    expect(reps.amrap).toBeUndefined();
  });

  it("does not emit amrap when reps_amrap is null", () => {
    const doc = makeDocWithExercise({ reps_amrap: null });
    const act = getActivity(doc, 0, 0);
    const rx = act.prescription as Record<string, unknown>;
    const reps = rx.reps as Record<string, unknown>;
    expect(reps.amrap).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. ExercisePrescription.to_failure
// ---------------------------------------------------------------------------

describe("v1.6.0 ExercisePrescription.to_failure", () => {
  it("emits to_failure: true in prescription when set", () => {
    const doc = makeDocWithExercise({ to_failure: true });
    const act = getActivity(doc, 0, 0);
    const rx = act.prescription as Record<string, unknown>;
    expect(rx.to_failure).toBe(true);
  });

  it("does not emit to_failure when false", () => {
    const doc = makeDocWithExercise({ to_failure: false });
    const act = getActivity(doc, 0, 0);
    const rx = act.prescription as Record<string, unknown>;
    expect(rx.to_failure).toBeUndefined();
  });

  it("does not emit to_failure when null", () => {
    const doc = makeDocWithExercise({ to_failure: null });
    const act = getActivity(doc, 0, 0);
    const rx = act.prescription as Record<string, unknown>;
    expect(rx.to_failure).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Weight.metric for percentage_1rm
// ---------------------------------------------------------------------------

describe("v1.6.0 Weight.metric", () => {
  it("emits metric field for percentage_1rm weight", () => {
    const doc = makeDocWithExercise({
      weight: {
        type: "percentage_1rm",
        value: 85,
        unit: null,
        metric: "e1RM",
      },
    });
    const act = getActivity(doc, 0, 0);
    const rx = act.prescription as Record<string, unknown>;
    const wt = rx.weight as Record<string, unknown>;
    expect(wt.type).toBe("percentage_1rm");
    expect(wt.value).toBe(85);
    expect(wt.metric).toBe("e1RM");
  });

  it("emits training_max metric", () => {
    const doc = makeDocWithExercise({
      weight: {
        type: "percentage_1rm",
        value: 90,
        unit: null,
        metric: "training_max",
      },
    });
    const act = getActivity(doc, 0, 0);
    const rx = act.prescription as Record<string, unknown>;
    const wt = rx.weight as Record<string, unknown>;
    expect(wt.metric).toBe("training_max");
  });

  it("does not emit metric when not provided", () => {
    const doc = makeDocWithExercise({
      weight: {
        type: "percentage_1rm",
        value: 75,
        unit: null,
      },
    });
    const act = getActivity(doc, 0, 0);
    const rx = act.prescription as Record<string, unknown>;
    const wt = rx.weight as Record<string, unknown>;
    expect(wt.metric).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Checkpoint.measurements as typed MeasurementSpec
// ---------------------------------------------------------------------------

describe("v1.6.0 Checkpoint MeasurementSpec", () => {
  function makeDocWithCheckpoint(
    measurements: (string | MeasurementSpec)[],
  ): Document {
    return makeDoc({
      progress: {
        checkpoints: [
          {
            name: "Week 4 check",
            trigger: { type: "time", every: 4, unit_count: 1 },
            measurements,
            questions: null,
          } as Checkpoint,
        ],
        points: null,
        achievements: null,
        streaks: null,
      },
    });
  }

  it("emits typed MeasurementSpec items alongside plain strings", () => {
    const doc = makeDocWithCheckpoint([
      "photos",
      {
        metric: "body_weight_kg",
        unit: "kg",
        note: "weigh before breakfast",
      } as MeasurementSpec,
      {
        metric: "questionnaire_score",
        questionnaire: "phq9",
      } as MeasurementSpec,
    ]);
    const result = compile(doc);
    if (!result.ok) throw new Error("compile failed");
    const plan = result.json.plan as Record<string, unknown>;
    const progress = plan.progress as Record<string, unknown>;
    const checkpoints = progress.checkpoints as Array<Record<string, unknown>>;
    const measurements = checkpoints[0].measurements as Array<unknown>;

    expect(measurements).toHaveLength(3);
    // First item is a plain string (back-compat)
    expect(measurements[0]).toBe("photos");
    // Second item is a typed MeasurementSpec
    const spec1 = measurements[1] as Record<string, unknown>;
    expect(spec1.metric).toBe("body_weight_kg");
    expect(spec1.unit).toBe("kg");
    expect(spec1.note).toBe("weigh before breakfast");
    // Third item is a questionnaire measurement
    const spec2 = measurements[2] as Record<string, unknown>;
    expect(spec2.metric).toBe("questionnaire_score");
    expect(spec2.questionnaire).toBe("phq9");
  });

  it("emits all plain strings when no MeasurementSpec provided", () => {
    const doc = makeDocWithCheckpoint(["weight", "body_fat"]);
    const result = compile(doc);
    if (!result.ok) throw new Error("compile failed");
    const plan = result.json.plan as Record<string, unknown>;
    const progress = plan.progress as Record<string, unknown>;
    const checkpoints = progress.checkpoints as Array<Record<string, unknown>>;
    const measurements = checkpoints[0].measurements as Array<unknown>;
    expect(measurements).toEqual(["weight", "body_fat"]);
  });
});

// ---------------------------------------------------------------------------
// 7. RecoveryExercise: modality, intensity_rpe, pnf, body_part
// ---------------------------------------------------------------------------

describe("v1.6.0 RecoveryExercise enhancements", () => {
  function makeDocWithRecovery(exFields: Partial<RecoveryExercise>): Document {
    const ex: RecoveryExercise = {
      name: "hamstring stretch",
      hold_seconds: 30,
      reps: 2,
      sides: "both",
      ...exFields,
    };

    return makeDoc({
      phases: [
        {
          name: "P1",
          type: null,
          duration: { value: 1, unit: "weeks" },
          goals: null,
          description: null,
          weeks: [
            {
              number: 1,
              name: null,
              is_deload: null,
              days: [
                {
                  day_name: "monday",
                  day_type: "training",
                  duration: { value: 60, unit: "minutes" },
                  label: null,
                  schedule: null,
                  notes: null,
                  blocks: [
                    {
                      type: "cooldown",
                      structure: null,
                      rounds: null,
                      rest_between_rounds: null,
                      activities: [
                        {
                          kind: "recovery",
                          category: "stretching",
                          duration: { value: 10, unit: "minutes" },
                          exercises: [ex],
                        } as Recovery,
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  }

  it("emits modality field on recovery exercise", () => {
    const doc = makeDocWithRecovery({ modality: "static_stretch" });
    const act = getActivity(doc, 0, 0);
    const rx = act.prescription as Record<string, unknown>;
    const exercises = rx.exercises as Array<Record<string, unknown>>;
    expect(exercises[0].modality).toBe("static_stretch");
  });

  it("emits smr_foam_roll modality", () => {
    const doc = makeDocWithRecovery({ modality: "smr_foam_roll" });
    const act = getActivity(doc, 0, 0);
    const rx = act.prescription as Record<string, unknown>;
    const exercises = rx.exercises as Array<Record<string, unknown>>;
    expect(exercises[0].modality).toBe("smr_foam_roll");
  });

  it("emits intensity_rpe on recovery exercise", () => {
    const doc = makeDocWithRecovery({ modality: "static_stretch", intensity_rpe: 6 });
    const act = getActivity(doc, 0, 0);
    const rx = act.prescription as Record<string, unknown>;
    const exercises = rx.exercises as Array<Record<string, unknown>>;
    expect(exercises[0].intensity_rpe).toBe(6);
  });

  it("emits pnf block on recovery exercise", () => {
    const doc = makeDocWithRecovery({
      modality: "pnf",
      pnf: { contraction_seconds: 6, relax_seconds: 30, contractions: 3 },
    });
    const act = getActivity(doc, 0, 0);
    const rx = act.prescription as Record<string, unknown>;
    const exercises = rx.exercises as Array<Record<string, unknown>>;
    const pnf = exercises[0].pnf as Record<string, unknown>;
    expect(pnf.contraction_seconds).toBe(6);
    expect(pnf.relax_seconds).toBe(30);
    expect(pnf.contractions).toBe(3);
  });

  it("emits body_part on recovery exercise", () => {
    const doc = makeDocWithRecovery({ body_part: "thoracic_spine" });
    const act = getActivity(doc, 0, 0);
    const rx = act.prescription as Record<string, unknown>;
    const exercises = rx.exercises as Array<Record<string, unknown>>;
    expect(exercises[0].body_part).toBe("thoracic_spine");
  });

  it("does not emit modality when not provided", () => {
    const doc = makeDocWithRecovery({});
    const act = getActivity(doc, 0, 0);
    const rx = act.prescription as Record<string, unknown>;
    const exercises = rx.exercises as Array<Record<string, unknown>>;
    expect(exercises[0].modality).toBeUndefined();
    expect(exercises[0].intensity_rpe).toBeUndefined();
    expect(exercises[0].pnf).toBeUndefined();
    expect(exercises[0].body_part).toBeUndefined();
  });
});

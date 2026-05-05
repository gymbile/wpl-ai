// ---------------------------------------------------------------------------
// Regression tests for the 5 corpus-driven bugs fixed in 1.10.1
// Each test is named after the bug it pins.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { tokenize } from "../src/lexer.js";
import { parse } from "../src/parser.js";
import { compile } from "../src/compiler.js";
import type { Habit, Exercise, Recovery } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseOk(src: string) {
  const lexResult = tokenize(src);
  if (!lexResult.ok) {
    throw new Error(
      `lex failed: ${lexResult.errors.map((e) => e.message).join("; ")}`,
    );
  }
  const result = parse(lexResult.tokens);
  if (!result.ok) {
    throw new Error(
      `parse failed: ${result.errors.map((e) => e.message).join("; ")}`,
    );
  }
  return result.document;
}

function compilePlan(src: string): Record<string, unknown> {
  const doc = parseOk(src);
  const result = compile(doc);
  if (!result.ok) {
    throw new Error(
      `compile failed: ${result.errors.map((e) => e.message).join("; ")}`,
    );
  }
  return result.json.plan as Record<string, unknown>;
}

function firstActivity(plan: Record<string, unknown>): Record<string, unknown> {
  const phase = (plan.phases as Array<Record<string, unknown>>)[0];
  const week = (phase.weeks as Array<Record<string, unknown>>)[0];
  const day = (week.days as Array<Record<string, unknown>>)[0];
  const block = (day.blocks as Array<Record<string, unknown>>)[0];
  return (block.activities as Array<Record<string, unknown>>)[0];
}

// ---------------------------------------------------------------------------
// Bug 1: bodyweight keyword in exercise modifier chain not recognized
// ---------------------------------------------------------------------------

describe("Bug 1 — bodyweight keyword as exercise weight modifier", () => {
  const src = `\
PLAN "Bodyweight Test"
TYPE workout
VISIBILITY public

GOALS

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training:
        main straight_sets:
          pull_up 3x8 bodyweight
`;

  it("emits weight: { type: 'bodyweight' } for `pull_up 3x8 bodyweight`", () => {
    const plan = compilePlan(src);
    const activity = firstActivity(plan);
    const prescription = activity.prescription as Record<string, unknown>;
    expect(prescription.weight).toEqual({ type: "bodyweight" });
    expect(prescription.sets).toBe(3);
    expect((prescription.reps as Record<string, unknown>).target).toBe(8);
  });

  it("parser AST contains weight.type = bodyweight", () => {
    const doc = parseOk(src);
    const ex = doc.phases![0].weeks[0].days[0].blocks[0].activities[0] as Exercise;
    expect(ex.weight?.type).toBe("bodyweight");
  });
});

// ---------------------------------------------------------------------------
// Bug 2: Habit without explicit target must NOT emit target field
// ---------------------------------------------------------------------------

describe("Bug 2 — habit without target omits target in prescription", () => {
  const src = `\
PLAN "Habit No Target"
TYPE workout
VISIBILITY public

GOALS

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training:
        main:
          habit hydration:
            frequency daily
`;

  it("prescription has no target field when target is absent", () => {
    const plan = compilePlan(src);
    const activity = firstActivity(plan);
    expect(activity.type).toBe("habit");
    const prescription = activity.prescription as Record<string, unknown>;
    expect(prescription.frequency).toBe("daily");
    expect(Object.prototype.hasOwnProperty.call(prescription, "target")).toBe(
      false,
    );
  });

  it("parser produces target=null when no target keyword is present", () => {
    const doc = parseOk(src);
    const habit =
      doc.phases![0].weeks[0].days[0].blocks[0].activities[0] as Habit;
    expect(habit.target).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bug 3: LANGUAGE directive must be respected (not hard-coded to "en")
// ---------------------------------------------------------------------------

describe("Bug 3 — LANGUAGE directive is passed through to compiled output", () => {
  it("LANGUAGE es produces metadata.language = 'es'", () => {
    const plan = compilePlan(
      `PLAN "Spanish"\nTYPE workout\nLANGUAGE es\n\nPHASES\n  PHASE "P" (1 weeks):\n    WEEK 1:\n      DAY Monday training:\n        main:\n`,
    );
    const metadata = plan.metadata as Record<string, unknown>;
    expect(metadata.language).toBe("es");
  });

  it("omitting LANGUAGE defaults to 'en'", () => {
    const plan = compilePlan(
      `PLAN "Default"\nTYPE workout\n\nPHASES\n  PHASE "P" (1 weeks):\n    WEEK 1:\n      DAY Monday training:\n        main:\n`,
    );
    const metadata = plan.metadata as Record<string, unknown>;
    expect(metadata.language).toBe("en");
  });

  it("parser AST stores the parsed language code", () => {
    const doc = parseOk(`PLAN "A"\nTYPE workout\nLANGUAGE pt`);
    expect(doc.header.language).toBe("pt");
  });
});

// ---------------------------------------------------------------------------
// Bug 4: 1xAMRAP must emit reps: { amrap: true } without a phantom target: 0
// ---------------------------------------------------------------------------

describe("Bug 4 — 1xAMRAP emits reps: { amrap: true } with no target field", () => {
  const amrapSrc = `\
PLAN "AMRAP Test"
TYPE workout

PHASES
  PHASE "P" (1 weeks):
    WEEK 1:
      DAY Monday training:
        main straight_sets:
          squat 1xAMRAP
`;

  it("1xAMRAP prescription has reps.amrap=true and no reps.target", () => {
    const plan = compilePlan(amrapSrc);
    const activity = firstActivity(plan);
    const prescription = activity.prescription as Record<string, unknown>;
    const reps = prescription.reps as Record<string, unknown>;
    expect(reps.amrap).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(reps, "target")).toBe(false);
  });

  it("3xAMRAP sets=3 with no reps.target", () => {
    const src = amrapSrc.replace("1xAMRAP", "3xAMRAP");
    const plan = compilePlan(src);
    const activity = firstActivity(plan);
    const prescription = activity.prescription as Record<string, unknown>;
    expect(prescription.sets).toBe(3);
    const reps = prescription.reps as Record<string, unknown>;
    expect(reps.amrap).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(reps, "target")).toBe(false);
  });

  it("ordinary reps still produce reps.target", () => {
    const src = amrapSrc.replace("1xAMRAP", "3x10");
    const plan = compilePlan(src);
    const activity = firstActivity(plan);
    const prescription = activity.prescription as Record<string, unknown>;
    const reps = prescription.reps as Record<string, unknown>;
    expect(reps.target).toBe(10);
    expect(Object.prototype.hasOwnProperty.call(reps, "amrap")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bug 5: `modality foam_roll` in recovery must attach as modality, not new exercise
// ---------------------------------------------------------------------------

describe("Bug 5 — foam_roll resolves to smr_foam_roll modality (not phantom exercise)", () => {
  const src = `\
PLAN "Foam Roll Test"
TYPE workout
VISIBILITY public

GOALS

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Tuesday active_recovery:
        cooldown:
          recovery stretching:
            hamstring_stretch 30s x3 modality foam_roll
`;

  it("only one activity in the block (no phantom foam_roll exercise)", () => {
    const plan = compilePlan(src);
    const phase = (plan.phases as Array<Record<string, unknown>>)[0];
    const week = (phase.weeks as Array<Record<string, unknown>>)[0];
    const day = (week.days as Array<Record<string, unknown>>)[0];
    const block = (day.blocks as Array<Record<string, unknown>>)[0];
    const activities = block.activities as Array<Record<string, unknown>>;
    expect(activities).toHaveLength(1);
    expect(activities[0].type).toBe("recovery");
  });

  it("modality foam_roll resolves to smr_foam_roll on the exercise in compiled output", () => {
    const plan = compilePlan(src);
    const phase = (plan.phases as Array<Record<string, unknown>>)[0];
    const week = (phase.weeks as Array<Record<string, unknown>>)[0];
    const day = (week.days as Array<Record<string, unknown>>)[0];
    const block = (day.blocks as Array<Record<string, unknown>>)[0];
    const recovery = (block.activities as Array<Record<string, unknown>>)[0];
    // exercises are nested inside prescription
    const prescription = recovery.prescription as Record<string, unknown>;
    const exercises = prescription.exercises as Array<Record<string, unknown>>;
    expect(exercises[0].modality).toBe("smr_foam_roll");
  });

  it("parser AST has modality=smr_foam_roll on the RecoveryExercise node", () => {
    const doc = parseOk(src);
    const recovery = doc.phases![0].weeks[0].days[0].blocks[0]
      .activities[0] as Recovery;
    expect(recovery.exercises[0].modality).toBe("smr_foam_roll");
  });
});

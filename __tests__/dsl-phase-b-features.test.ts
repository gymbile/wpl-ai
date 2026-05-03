// Coverage for Phase B DSL syntax (per-plan config-style additions):
// - ATHLETE_THRESHOLDS top-level section
// - weight N% bw  (percentage_bodyweight)
// - cardio  zone N model M  (intensity.zone_model)
// - macros with g_per_kg unit
// - calories with kcal_per_kg / multiplier_of_tdee unit

import { describe, expect, it } from "vitest";
import { compile } from "../src/compiler.js";
import { parse } from "../src/parser.js";
import { tokenize } from "../src/lexer.js";

function compileSource(source: string): Record<string, unknown> {
  const tokens = tokenize(source);
  const parsed = parse(tokens.tokens);
  if (!parsed.ok || !parsed.document) {
    throw new Error(`parse failed: ${JSON.stringify(parsed.errors, null, 2)}`);
  }
  const compiled = compile(parsed.document);
  if (!compiled.ok) {
    throw new Error(`compile failed: ${JSON.stringify(compiled.errors, null, 2)}`);
  }
  return compiled.json;
}

const ATHLETE_THRESHOLDS_SOURCE = `PLAN "Phase B — Athlete Thresholds"
TYPE workout
VISIBILITY private

GOALS
  GOAL primary strength:
    name "Demo"

ATHLETE_THRESHOLDS
  hr_max 188 bpm
  lthr 168 bpm
  resting_hr 48
  ftp 285 watts
  body_weight 72 kg
  one_rm squat 140 kg
  one_rm bench_press 100 kg

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "D1":
        main straight_sets:
          squat 3x5`;

const PER_BW_LOAD_SOURCE = `PLAN "Phase B — Percentage Bodyweight"
TYPE workout
VISIBILITY private

GOALS
  GOAL primary strength:
    name "Demo"

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "D1":
        main straight_sets:
          goblet_squat 3x12 weight 33% bw`;

const CARDIO_ZONE_MODEL_SOURCE = `PLAN "Phase B — Cardio Zone Model"
TYPE workout
VISIBILITY private

GOALS
  GOAL primary endurance:
    name "Demo"

PHASES
  PHASE "Polarized" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Z1":
        main:
          cardio running continuous:
            total 60 minutes
            zone 1 model hr_3_zone_seiler`;

const MACROS_PER_KG_SOURCE = `PLAN "Phase B — Per-kg Macros"
TYPE nutrition
VISIBILITY private

GOALS
  GOAL primary nutrition:
    name "Demo"

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday rest "D1":
        nutrition:
          nutrition daily_target:
            protein 1.6 .. 2.2 g_per_kg
            carbs 4 .. 6 g_per_kg
            fat 0.7 .. 1.0 g_per_kg
            calories 0.95 .. 1.05 multiplier_of_tdee`;

describe("DSL Phase B features", () => {
  it("parses ATHLETE_THRESHOLDS into plan.athlete_thresholds", () => {
    const json = compileSource(ATHLETE_THRESHOLDS_SOURCE);
    const at = (json.plan as { athlete_thresholds: Record<string, unknown> })
      .athlete_thresholds;
    expect(at).toBeDefined();
    expect(at.hr_max_bpm).toBe(188);
    expect(at.lthr_bpm).toBe(168);
    expect(at.resting_hr_bpm).toBe(48);
    expect(at.ftp_watts).toBe(285);
    expect(at.body_weight_kg).toBe(72);
    expect(at.one_rm).toEqual([
      { exercise_ref: "squat", value: 140, unit: "kg" },
      { exercise_ref: "bench_press", value: 100, unit: "kg" },
    ]);
  });

  it("emits weight type 'percentage_bodyweight' for `weight N% bw`", () => {
    const json = compileSource(PER_BW_LOAD_SOURCE);
    const day = (json.plan as { phases: Array<Record<string, unknown>> }).phases[0]
      .weeks as Array<Record<string, unknown>>;
    const blocks = (day[0].days as Array<Record<string, unknown>>)[0]
      .blocks as Array<Record<string, unknown>>;
    const main = blocks.find((b) => b.type === "main")!;
    const ex = (main.activities as Array<Record<string, unknown>>)[0];
    const w = (ex.prescription as { weight: Record<string, unknown> }).weight;
    expect(w.type).toBe("percentage_bodyweight");
    expect(w.value).toBe(33);
  });

  it("emits intensity.zone_model for `zone N model M`", () => {
    const json = compileSource(CARDIO_ZONE_MODEL_SOURCE);
    const day = (json.plan as { phases: Array<Record<string, unknown>> }).phases[0]
      .weeks as Array<Record<string, unknown>>;
    const blocks = (day[0].days as Array<Record<string, unknown>>)[0]
      .blocks as Array<Record<string, unknown>>;
    const main = blocks.find((b) => b.type === "main")!;
    const cardio = (main.activities as Array<Record<string, unknown>>)[0];
    const intensity = (cardio.prescription as { intensity: Record<string, unknown> })
      .intensity;
    expect(intensity.type).toBe("heart_rate_zone");
    expect(intensity.zone).toBe(1);
    expect(intensity.zone_model).toBe("hr_3_zone_seiler");
  });

  it("emits per-kg macro units and multiplier_of_tdee calorie unit", () => {
    const json = compileSource(MACROS_PER_KG_SOURCE);
    const day = (json.plan as { phases: Array<Record<string, unknown>> }).phases[0]
      .weeks as Array<Record<string, unknown>>;
    const blocks = (day[0].days as Array<Record<string, unknown>>)[0]
      .blocks as Array<Record<string, unknown>>;
    const nutritionBlock = blocks.find((b) => b.type === "nutrition")!;
    const act = (nutritionBlock.activities as Array<Record<string, unknown>>)[0];
    const rx = act.prescription as Record<string, unknown>;
    const macros = rx.macros as Record<string, Record<string, unknown>>;

    expect(macros.protein).toEqual({ min: 1.6, max: 2.2, unit: "g_per_kg" });
    expect(macros.carbs).toEqual({ min: 4, max: 6, unit: "g_per_kg" });
    expect(macros.fat).toEqual({ min: 0.7, max: 1, unit: "g_per_kg" });

    expect(rx.calories).toEqual({
      min: 0.95,
      max: 1.05,
      unit: "multiplier_of_tdee",
    });
  });
});

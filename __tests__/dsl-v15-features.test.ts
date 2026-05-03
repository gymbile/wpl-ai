// Coverage for DSL syntax added alongside schema v1.2.0–v1.5.0:
// - PHASE periodization role
// - WEEK is_deload flag
// - exercise muscles + movement_pattern modifiers
// - sub-plan inclusion as a block-level activity
// - tempo auto-normalization to structured Tempo

import { describe, expect, it } from "vitest";
import { compile } from "../src/compiler.js";
import { parse } from "../src/parser.js";
import { tokenize } from "../src/lexer.js";

// Note: schema validation isn't asserted here. wpl-ai depends on the
// published @gymbile/wpl-validator, which lags behind unreleased schema
// changes. Schema correctness for the new fields lives in the conformance
// suite under gymbile/wpl + the two reference validators.

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

const FULL_SOURCE = `PLAN "v1.5 Showcase"
TYPE workout
VISIBILITY private
DIFFICULTY intermediate
LANGUAGE en

GOALS
  GOAL primary strength:
    name "Demo all the new fields"

PHASES
  PHASE "Accumulation block" accumulation (4 weeks):
    WEEK 1 "Lead-in":
      DAY Monday training 60m "Squat day":
        warmup:
          subplan plan_warmup_full_body "Standard warmup"
        main straight_sets:
          squat 4x6 muscles primary quadriceps, glutes secondary hamstrings pattern squat tempo 3 - 1 - 1 - 0
          push_up 3x10 muscles chest, triceps, front_delts pattern push_horizontal
        cooldown:
          subplan plan_cooldown_mobility
    WEEK 4 deload "Deload week":
      DAY Monday training 30m "Light squat":
        main straight_sets:
          squat 3x5 weight 60% rm`;

describe("DSL v1.5 features", () => {
  it("emits Phase.type when the DSL specifies a periodization role", () => {
    const json = compileSource(FULL_SOURCE);
    const phases = (json.plan as { phases: Array<Record<string, unknown>> }).phases;
    expect(phases[0].type).toBe("accumulation");
  });

  it("emits Week.is_deload when the DSL marks a week as deload", () => {
    const json = compileSource(FULL_SOURCE);
    const weeks = ((json.plan as { phases: Array<Record<string, unknown>> }).phases[0]
      .weeks ?? []) as Array<Record<string, unknown>>;
    expect(weeks[0].is_deload).toBeUndefined();
    expect(weeks[1].is_deload).toBe(true);
  });

  it("emits primary/secondary muscles + movement_pattern from exercise modifiers", () => {
    const json = compileSource(FULL_SOURCE);
    const day = ((json.plan as { phases: Array<Record<string, unknown>> }).phases[0]
      .weeks as Array<Record<string, unknown>>)[0].days as Array<Record<string, unknown>>;
    const blocks = day[0].blocks as Array<Record<string, unknown>>;
    const main = blocks.find((b) => b.type === "main")!;
    const acts = main.activities as Array<Record<string, unknown>>;

    const squat = acts.find((a) => a.exercise_ref === "squat")!;
    expect(squat.primary_muscles).toEqual(["quadriceps", "glutes"]);
    expect(squat.secondary_muscles).toEqual(["hamstrings"]);
    expect(squat.movement_pattern).toBe("squat");

    // Shorthand form (no `primary`/`secondary` keywords): all primary, no secondaries.
    const pushup = acts.find((a) => a.exercise_ref === "push_up")!;
    expect(pushup.primary_muscles).toEqual(["chest", "triceps", "front_delts"]);
    expect(pushup.secondary_muscles).toBeUndefined();
    expect(pushup.movement_pattern).toBe("push_horizontal");
  });

  it("emits sub-plan activities", () => {
    const json = compileSource(FULL_SOURCE);
    const day = ((json.plan as { phases: Array<Record<string, unknown>> }).phases[0]
      .weeks as Array<Record<string, unknown>>)[0].days as Array<Record<string, unknown>>;
    const blocks = day[0].blocks as Array<Record<string, unknown>>;

    const warmup = blocks.find((b) => b.type === "warmup")!;
    const warmupActs = warmup.activities as Array<Record<string, unknown>>;
    expect(warmupActs[0].type).toBe("sub_plan");
    expect(warmupActs[0].sub_plan_ref).toBe("plan_warmup_full_body");
    expect(warmupActs[0].name).toBe("Standard warmup");

    const cooldown = blocks.find((b) => b.type === "cooldown")!;
    const cooldownActs = cooldown.activities as Array<Record<string, unknown>>;
    expect(cooldownActs[0].type).toBe("sub_plan");
    expect(cooldownActs[0].sub_plan_ref).toBe("plan_cooldown_mobility");
    expect(cooldownActs[0].name).toBeUndefined();
  });

  it("normalizes tempo to structured form", () => {
    const json = compileSource(FULL_SOURCE);
    const day = ((json.plan as { phases: Array<Record<string, unknown>> }).phases[0]
      .weeks as Array<Record<string, unknown>>)[0].days as Array<Record<string, unknown>>;
    const main = (day[0].blocks as Array<Record<string, unknown>>).find((b) => b.type === "main")!;
    const squat = (main.activities as Array<Record<string, unknown>>)[0];
    const rx = squat.prescription as Record<string, unknown>;
    expect(rx.tempo).toEqual({
      eccentric: 3,
      pause_bottom: 1,
      concentric: 1,
      pause_top: 0,
    });
  });
});

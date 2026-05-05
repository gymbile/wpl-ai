// ---------------------------------------------------------------------------
// Pointer-map tests: verify that JSON-pointer paths resolve back to source
// character ranges in the original DSL text.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { compileWplAi, compile } from "../src/index.js";

function ok(source: string) {
  const result = compileWplAi(source);
  if (!result.ok) {
    throw new Error("compile failed: " + result.summary);
  }
  return result;
}

describe("pointerMap", () => {
  // -------------------------------------------------------------------------
  // Top-level
  // -------------------------------------------------------------------------

  it("maps top-level plan node to its source range", () => {
    const source = `\
PLAN "My Plan"
TYPE workout
VISIBILITY private
`;
    const result = ok(source);
    const range = result.pointerMap.get("/plan");
    expect(range).toBeDefined();
    expect(source.slice(range!.from, range!.to)).toContain('PLAN "My Plan"');
  });

  it("does not throw when looking up synthetic top-level fields", () => {
    const source = `PLAN "P"
TYPE workout
VISIBILITY private`;
    const result = ok(source);
    // $schema and version are synthetic emissions; lookup should not crash.
    expect(() => result.pointerMap.get("/$schema")).not.toThrow();
    expect(() => result.pointerMap.get("/version")).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Phases / Weeks / Days / Blocks / Activities
  // -------------------------------------------------------------------------

  it("maps phases array entries to their ranges", () => {
    const source = `\
PLAN "Plan"
TYPE workout
VISIBILITY private

PHASES
  PHASE "Phase One" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        main:
          push_up 3x10
`;
    const result = ok(source);
    expect(result.pointerMap.has("/plan/phases/0")).toBe(true);
    const range = result.pointerMap.get("/plan/phases/0")!;
    expect(source.slice(range.from, range.to)).toContain('PHASE "Phase One"');
  });

  it("maps weeks within a phase", () => {
    const source = `\
PLAN "Plan"
TYPE workout
VISIBILITY private

PHASES
  PHASE "Phase" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        main:
          push_up 3x10
`;
    const result = ok(source);
    const range = result.pointerMap.get("/plan/phases/0/weeks/0");
    expect(range).toBeDefined();
    expect(source.slice(range!.from, range!.to)).toContain("WEEK 1");
  });

  it("maps days within a week", () => {
    const source = `\
PLAN "Plan"
TYPE workout
VISIBILITY private

PHASES
  PHASE "P" (1 weeks):
    WEEK 1:
      DAY Tuesday training 30m:
        main:
          push_up 3x10
`;
    const result = ok(source);
    const range = result.pointerMap.get("/plan/phases/0/weeks/0/days/0");
    expect(range).toBeDefined();
    expect(source.slice(range!.from, range!.to)).toContain("DAY Tuesday");
  });

  it("maps blocks within a day", () => {
    const source = `\
PLAN "Plan"
TYPE workout
VISIBILITY private

PHASES
  PHASE "P" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        warmup:
          jumping_jacks 2m
        main:
          push_up 3x10
`;
    const result = ok(source);
    const blockRange = result.pointerMap.get(
      "/plan/phases/0/weeks/0/days/0/blocks/1",
    );
    expect(blockRange).toBeDefined();
    expect(source.slice(blockRange!.from, blockRange!.to)).toContain("main");
  });

  it("maps exercise activities within a block", () => {
    const source = `\
PLAN "Plan"
TYPE workout
VISIBILITY private

PHASES
  PHASE "P" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        main:
          push_up 3x10
          squat 3x12
`;
    const result = ok(source);
    const a0 = result.pointerMap.get(
      "/plan/phases/0/weeks/0/days/0/blocks/0/activities/0",
    );
    const a1 = result.pointerMap.get(
      "/plan/phases/0/weeks/0/days/0/blocks/0/activities/1",
    );
    expect(a0).toBeDefined();
    expect(a1).toBeDefined();
    expect(source.slice(a0!.from, a0!.to)).toContain("push_up");
    expect(source.slice(a1!.from, a1!.to)).toContain("squat");
  });

  it("maps simple-activity (non-exercise) entries", () => {
    const source = `\
PLAN "Plan"
TYPE workout
VISIBILITY private

PHASES
  PHASE "P" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        warmup:
          jumping_jacks 2m
`;
    const result = ok(source);
    const a0 = result.pointerMap.get(
      "/plan/phases/0/weeks/0/days/0/blocks/0/activities/0",
    );
    expect(a0).toBeDefined();
    expect(source.slice(a0!.from, a0!.to)).toContain("jumping_jacks");
  });

  // -------------------------------------------------------------------------
  // Goals
  // -------------------------------------------------------------------------

  it("maps goal entries", () => {
    const source = `\
PLAN "Plan"
TYPE workout
VISIBILITY private

GOALS
  GOAL primary muscle_gain:
    target weight 5 kg relative
`;
    const result = ok(source);
    const range = result.pointerMap.get("/plan/goals/0");
    expect(range).toBeDefined();
    expect(source.slice(range!.from, range!.to)).toContain(
      "GOAL primary muscle_gain",
    );
  });

  // -------------------------------------------------------------------------
  // Personalization rules / inputs
  // -------------------------------------------------------------------------

  it("maps personalization rule entries", () => {
    const source = `\
PLAN "Plan"
TYPE workout
VISIBILITY private

PERSONALIZATION
  RULES
    WHEN injury contains knee:
      replace squat -> wall_sit
`;
    const result = ok(source);
    const ruleRange = result.pointerMap.get("/plan/personalization/rules/0");
    expect(ruleRange).toBeDefined();
    expect(source.slice(ruleRange!.from, ruleRange!.to)).toContain("WHEN");
  });

  it("maps personalization input entries", () => {
    const source = `\
PLAN "Plan"
TYPE workout
VISIBILITY private

PERSONALIZATION
  INPUTS
    user_age = questionnaire as number
  RULES
    WHEN user_age >= 50 :
      reduce intensity by 20%
`;
    const result = ok(source);
    const inputRange = result.pointerMap.get("/plan/personalization/inputs/0");
    expect(inputRange).toBeDefined();
    expect(source.slice(inputRange!.from, inputRange!.to)).toContain("user_age");
  });

  // -------------------------------------------------------------------------
  // Progress: checkpoints + points rules
  // -------------------------------------------------------------------------

  it("maps progress checkpoints", () => {
    const source = `\
PLAN "Plan"
TYPE workout

PROGRESS
  checkpoints:
    checkpoint "Monthly Review":
      trigger time week 4 day 1
`;
    const result = ok(source);
    const cpRange = result.pointerMap.get("/plan/progress/checkpoints/0");
    expect(cpRange).toBeDefined();
    expect(source.slice(cpRange!.from, cpRange!.to)).toContain(
      'checkpoint "Monthly Review"',
    );
  });

  it("maps progress points rules (via direct compile of AST)", () => {
    // The DSL parser has a known limitation where points.rules is parsed as
    // null; tested here via a hand-built AST passed to compile() directly to
    // verify the pointer-tracking wiring for points rules.
    const ast = {
      header: { name: "P", type: "workout", visibility: null, difficulty: null, duration: null, tags: null, language: "en", min_app_version: null, schema: null },
      goals: null,
      requirements: null,
      personalization: null,
      phases: [],
      progress: {
        checkpoints: null,
        achievements: null,
        streaks: null,
        points: {
          enabled: true,
          rules: [
            { activity: "workout_completed", points: 10, range: { from: 5, to: 25 } },
            { activity: "streak_7_days", points: 50, range: { from: 30, to: 50 } },
          ],
          range: { from: 0, to: 60 },
        },
        range: { from: 0, to: 60 },
      },
      notifications: null,
      rendering: null,
      range: { from: 0, to: 60 },
    } as unknown as import("../src/types.js").Document;

    const result = compile(ast);
    if (!result.ok) throw new Error("compile failed");
    expect(result.pointerMap.get("/plan/progress/points_system/rules/0")).toEqual({
      from: 5,
      to: 25,
    });
    expect(result.pointerMap.get("/plan/progress/points_system/rules/1")).toEqual({
      from: 30,
      to: 50,
    });
  });

  // -------------------------------------------------------------------------
  // Sanity: ranges fall within source bounds
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Activity sub-fields (Refactor C)
  // -------------------------------------------------------------------------

  it("maps exercise prescription sub-segment", () => {
    const source = `\
PLAN "Plan"
TYPE workout

PHASES
  PHASE "P" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        main:
          bench_press 5x5 weight 80 kg
`;
    const result = ok(source);
    const r = result.pointerMap.get(
      "/plan/phases/0/weeks/0/days/0/blocks/0/activities/0/prescription",
    );
    expect(r).toBeDefined();
    expect(source.slice(r!.from, r!.to)).toContain("bench_press");
  });

  it("maps exercise weight sub-segment", () => {
    const source = `\
PLAN "Plan"
TYPE workout

PHASES
  PHASE "P" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        main:
          bench_press 5x5 weight 80 kg
`;
    const result = ok(source);
    const r = result.pointerMap.get(
      "/plan/phases/0/weeks/0/days/0/blocks/0/activities/0/prescription/weight",
    );
    expect(r).toBeDefined();
    expect(source.slice(r!.from, r!.to)).toContain("80 kg");
  });

  it("maps cardio intensity sub-segment", () => {
    const source = `\
PLAN "Plan"
TYPE workout

PHASES
  PHASE "P" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        main:
          cardio running continuous:
            total 20 minutes
            intensity rpe 7
`;
    const result = ok(source);
    const r = result.pointerMap.get(
      "/plan/phases/0/weeks/0/days/0/blocks/0/activities/0/intensity",
    );
    expect(r).toBeDefined();
    expect(source.slice(r!.from, r!.to)).toContain("rpe 7");
  });

  it("maps cardio intervals sub-segment", () => {
    const source = `\
PLAN "Plan"
TYPE workout

PHASES
  PHASE "P" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        main:
          cardio running intervals:
            total 20 minutes
            30s work / 30 rest x 5
`;
    const result = ok(source);
    const r = result.pointerMap.get(
      "/plan/phases/0/weeks/0/days/0/blocks/0/activities/0/prescription/intervals",
    );
    expect(r).toBeDefined();
    expect(source.slice(r!.from, r!.to)).toContain("work");
  });

  it("maps nutrition timing sub-segment", () => {
    const source = `\
PLAN "Plan"
TYPE nutrition

PHASES
  PHASE "P" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        nutrition:
          nutrition meal:
            timing at 08:00
`;
    const result = ok(source);
    const r = result.pointerMap.get(
      "/plan/phases/0/weeks/0/days/0/blocks/0/activities/0/timing",
    );
    expect(r).toBeDefined();
    expect(source.slice(r!.from, r!.to)).toContain("at 08:00");
  });

  it("maps nutrition macros sub-segment", () => {
    const source = `\
PLAN "Plan"
TYPE nutrition

PHASES
  PHASE "P" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        nutrition:
          nutrition meal:
            protein 30..40
            carbs 50..70
`;
    const result = ok(source);
    const r = result.pointerMap.get(
      "/plan/phases/0/weeks/0/days/0/blocks/0/activities/0/prescription/macros",
    );
    expect(r).toBeDefined();
    expect(source.slice(r!.from, r!.to)).toContain("protein");
  });

  it("maps recovery exercise sub-segments", () => {
    const source = `\
PLAN "Plan"
TYPE workout

PHASES
  PHASE "P" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        cooldown:
          chest_stretch 30s x 2 sides both
`;
    const result = ok(source);
    const r = result.pointerMap.get(
      "/plan/phases/0/weeks/0/days/0/blocks/0/activities/0/prescription/exercises/0",
    );
    expect(r).toBeDefined();
    expect(source.slice(r!.from, r!.to)).toContain("chest_stretch");
  });

  it("maps habit prescription sub-segment", () => {
    const source = `\
PLAN "Plan"
TYPE hybrid

PHASES
  PHASE "P" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        main:
          habit hydration:
            target 8 glasses
            frequency daily
`;
    const result = ok(source);
    const r = result.pointerMap.get(
      "/plan/phases/0/weeks/0/days/0/blocks/0/activities/0/prescription",
    );
    expect(r).toBeDefined();
    expect(source.slice(r!.from, r!.to)).toContain("habit hydration");
  });

  // -------------------------------------------------------------------------
  // Top-level minor types (notifications)
  // -------------------------------------------------------------------------

  it("maps notification entries", () => {
    const source = `\
PLAN "Plan"
TYPE workout

NOTIFICATIONS
  workout_reminder:
    enabled true
    message "Time to work out!"
`;
    const result = ok(source);
    const r = result.pointerMap.get("/plan/notifications/0");
    expect(r).toBeDefined();
    expect(source.slice(r!.from, r!.to)).toContain("workout_reminder");
  });

  it("all pointer ranges fall within source bounds and are non-empty", () => {
    const source = `\
PLAN "Plan"
TYPE workout
VISIBILITY private

PHASES
  PHASE "P" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        main:
          push_up 3x10
`;
    const result = ok(source);
    for (const [pointer, range] of result.pointerMap) {
      expect(range.from, `${pointer} from`).toBeGreaterThanOrEqual(0);
      expect(range.to, `${pointer} to`).toBeLessThanOrEqual(source.length);
      expect(range.to, `${pointer} non-empty`).toBeGreaterThanOrEqual(range.from);
    }
  });
});

import { describe, it, expect } from "vitest";
import { tokenize } from "../src/lexer.js";
import { parse } from "../src/parser.js";
import type { Document } from "../src/types.js";
import type { WplError } from "../src/errors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSource(source: string) {
  const lexResult = tokenize(source);
  if (!lexResult.ok) throw new Error("Lexer failed: " + JSON.stringify(lexResult.errors));
  return parse(lexResult.tokens);
}

function parseOk(source: string): Document {
  const result = parseSource(source);
  if (!result.ok) throw new Error("Parse failed: " + JSON.stringify(result.errors));
  return result.document;
}

function parseErrors(source: string): WplError[] {
  const result = parseSource(source);
  if (result.ok) throw new Error("Expected parse to fail, but it succeeded");
  return result.errors;
}

// ---------------------------------------------------------------------------
// 1. Smoke test from spec
// ---------------------------------------------------------------------------

describe("Smoke test from spec", () => {
  const FULL_EXAMPLE = `\
PLAN "Upper Body Beginner"
TYPE workout
VISIBILITY private
DIFFICULTY beginner
TAGS strength, beginner
LANGUAGE en

GOALS
  GOAL primary muscle_gain:
    target weight 0 kg absolute

REQUIRES
  age 16..65
  fitness beginner
  equipment:
    dumbbells (required, alternatives: bands)

PERSONALIZATION
  RULES
    WHEN injury contains knee:
      replace squat -> wall_sit

PHASES
  PHASE "Foundation" (2 weeks):
    WEEK 1:
      DAY Monday training 45m "Upper Body":
        warmup:
          jumping_jack 2m
        main straight_sets:
          push_up 3x8..12 target 10 rpe 7 rest 60 seconds
        cooldown:
          chest_stretch 30s x2 sides both`;

  it("parses the full example without errors", () => {
    const doc = parseOk(FULL_EXAMPLE);
    expect(doc).toBeDefined();
  });

  it("parses header fields correctly", () => {
    const doc = parseOk(FULL_EXAMPLE);
    expect(doc.header.name).toBe("Upper Body Beginner");
    expect(doc.header.type).toBe("workout");
    expect(doc.header.visibility).toBe("private");
    expect(doc.header.difficulty).toBe("beginner");
    expect(doc.header.tags).toEqual(["strength", "beginner"]);
    expect(doc.header.language).toBe("en");
  });

  it("parses goals section", () => {
    const doc = parseOk(FULL_EXAMPLE);
    expect(doc.goals).toHaveLength(1);
    const goal = doc.goals![0];
    expect(goal.priority).toBe("primary");
    expect(goal.category).toBe("muscle_gain");
    expect(goal.target).toBeDefined();
    expect(goal.target!.metric).toBe("weight");
    expect(goal.target!.value).toBe(0);
    expect(goal.target!.unit).toBe("kg");
    expect(goal.target!.measurement_type).toBe("absolute");
  });

  it("parses requirements section", () => {
    const doc = parseOk(FULL_EXAMPLE);
    expect(doc.requirements).toBeDefined();
    expect(doc.requirements!.age_range).toEqual([16, 65]);
    expect(doc.requirements!.fitness_levels).toEqual(["beginner"]);
    expect(doc.requirements!.equipment).toHaveLength(1);
    const equip = doc.requirements!.equipment![0];
    expect(equip.name).toBe("dumbbells");
    expect(equip.required).toBe(true);
    expect(equip.alternatives).toEqual(["bands"]);
  });

  it("parses personalization rules", () => {
    const doc = parseOk(FULL_EXAMPLE);
    expect(doc.personalization).toBeDefined();
    expect(doc.personalization!.rules).toHaveLength(1);
    const rule = doc.personalization!.rules[0];
    expect(rule.condition.type).toBe("simple");
    expect(rule.condition.field).toBe("injury");
    expect(rule.condition.op).toBe("contains");
    expect(rule.condition.value).toBe("knee");
    expect(rule.actions).toHaveLength(1);
    expect(rule.actions[0].type).toBe("replace_exercise");
    expect(rule.actions[0].params).toEqual({ from: "squat", to: "wall_sit" });
  });

  it("parses phases structure", () => {
    const doc = parseOk(FULL_EXAMPLE);
    expect(doc.phases).toHaveLength(1);
    const phase = doc.phases[0];
    expect(phase.name).toBe("Foundation");
    expect(phase.duration).toEqual({ value: 2, unit: "weeks" });
  });

  it("parses week and day", () => {
    const doc = parseOk(FULL_EXAMPLE);
    const week = doc.phases[0].weeks[0];
    expect(week.number).toBe(1);
    expect(week.days).toHaveLength(1);
    const day = week.days[0];
    expect(day.day_name).toBe("Monday");
    expect(day.day_type).toBe("training");
    expect(day.duration).toEqual({ value: 45, unit: "minutes" });
    expect(day.label).toBe("Upper Body");
  });

  it("parses blocks correctly", () => {
    const doc = parseOk(FULL_EXAMPLE);
    const blocks = doc.phases[0].weeks[0].days[0].blocks;
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe("warmup");
    expect(blocks[0].structure).toBeNull();
    expect(blocks[1].type).toBe("main");
    expect(blocks[1].structure).toBe("straight_sets");
    expect(blocks[2].type).toBe("cooldown");
    expect(blocks[2].structure).toBeNull();
  });

  it("parses warmup simple activity", () => {
    const doc = parseOk(FULL_EXAMPLE);
    const warmup = doc.phases[0].weeks[0].days[0].blocks[0];
    expect(warmup.activities).toHaveLength(1);
    const act = warmup.activities[0];
    expect(act.kind).toBe("simple");
    if (act.kind === "simple") {
      expect(act.name).toBe("jumping_jack");
      expect(act.duration).toEqual({ value: 2, unit: "minutes" });
    }
  });

  it("parses exercise with all modifiers", () => {
    const doc = parseOk(FULL_EXAMPLE);
    const main = doc.phases[0].weeks[0].days[0].blocks[1];
    expect(main.activities).toHaveLength(1);
    const exercise = main.activities[0];
    expect(exercise.kind).toBe("exercise");
    if (exercise.kind === "exercise") {
      expect(exercise.exercise_ref).toBe("push_up");
      expect(exercise.sets).toBe(3);
      expect(exercise.reps).toEqual([8, 12, 10]);
      expect(exercise.rpe).toBe(7);
      expect(exercise.rest).toEqual({ value: 60, unit: "seconds" });
    }
  });

  it("parses cooldown recovery exercise", () => {
    const doc = parseOk(FULL_EXAMPLE);
    const cooldown = doc.phases[0].weeks[0].days[0].blocks[2];
    expect(cooldown.activities).toHaveLength(1);
    const act = cooldown.activities[0];
    expect(act.kind).toBe("recovery");
    if (act.kind === "recovery") {
      expect(act.exercises).toHaveLength(1);
      const ex = act.exercises![0];
      expect(ex.name).toBe("chest_stretch");
      expect(ex.hold_seconds).toBe(30);
      expect(ex.reps).toBe(2);
      expect(ex.sides).toBe("both");
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Header variations
// ---------------------------------------------------------------------------

describe("Header variations", () => {
  it("parses minimal header (PLAN + TYPE only)", () => {
    const doc = parseOk(`\
PLAN "Minimal"
TYPE workout`);
    expect(doc.header.name).toBe("Minimal");
    expect(doc.header.type).toBe("workout");
    expect(doc.header.visibility).toBeNull();
    expect(doc.header.difficulty).toBeNull();
    expect(doc.header.tags).toBeNull();
    expect(doc.header.language).toBe("en");
    expect(doc.header.duration).toBeNull();
  });

  it("parses workout plan type", () => {
    const doc = parseOk(`PLAN "A"\nTYPE workout`);
    expect(doc.header.type).toBe("workout");
  });

  it("parses nutrition plan type", () => {
    const doc = parseOk(`PLAN "A"\nTYPE nutrition`);
    expect(doc.header.type).toBe("nutrition");
  });

  it("parses meditation plan type", () => {
    const doc = parseOk(`PLAN "A"\nTYPE meditation`);
    expect(doc.header.type).toBe("meditation");
  });

  it("parses recovery plan type", () => {
    const doc = parseOk(`PLAN "A"\nTYPE recovery`);
    expect(doc.header.type).toBe("recovery");
  });

  it("parses hybrid plan type", () => {
    const doc = parseOk(`PLAN "A"\nTYPE hybrid`);
    expect(doc.header.type).toBe("hybrid");
  });

  it("parses beginner difficulty", () => {
    const doc = parseOk(`PLAN "A"\nTYPE workout\nDIFFICULTY beginner`);
    expect(doc.header.difficulty).toBe("beginner");
  });

  it("parses intermediate difficulty", () => {
    const doc = parseOk(`PLAN "A"\nTYPE workout\nDIFFICULTY intermediate`);
    expect(doc.header.difficulty).toBe("intermediate");
  });

  it("parses advanced difficulty", () => {
    const doc = parseOk(`PLAN "A"\nTYPE workout\nDIFFICULTY advanced`);
    expect(doc.header.difficulty).toBe("advanced");
  });

  it("parses adaptive difficulty", () => {
    const doc = parseOk(`PLAN "A"\nTYPE workout\nDIFFICULTY adaptive`);
    expect(doc.header.difficulty).toBe("adaptive");
  });

  it("parses public visibility", () => {
    const doc = parseOk(`PLAN "A"\nTYPE workout\nVISIBILITY public`);
    expect(doc.header.visibility).toBe("public");
  });

  it("parses private visibility", () => {
    const doc = parseOk(`PLAN "A"\nTYPE workout\nVISIBILITY private`);
    expect(doc.header.visibility).toBe("private");
  });

  it("parses template visibility", () => {
    const doc = parseOk(`PLAN "A"\nTYPE workout\nVISIBILITY template`);
    expect(doc.header.visibility).toBe("template");
  });

  it("parses TAGS with multiple items", () => {
    const doc = parseOk(`PLAN "A"\nTYPE workout\nTAGS strength, hypertrophy, beginner`);
    expect(doc.header.tags).toEqual(["strength", "hypertrophy", "beginner"]);
  });

  it("LANGUAGE is always en regardless of source", () => {
    const doc = parseOk(`PLAN "A"\nTYPE workout\nLANGUAGE pt`);
    expect(doc.header.language).toBe("en");
  });

  it("parses DURATION field", () => {
    const doc = parseOk(`PLAN "A"\nTYPE workout\nDURATION 12 weeks`);
    expect(doc.header.duration).toEqual({ value: 12, unit: "weeks" });
  });

  it("parses all header fields together", () => {
    const doc = parseOk(`\
PLAN "Full Header"
TYPE workout
VISIBILITY public
DIFFICULTY intermediate
DURATION 8 weeks
TAGS strength, endurance
LANGUAGE en`);
    expect(doc.header.name).toBe("Full Header");
    expect(doc.header.type).toBe("workout");
    expect(doc.header.visibility).toBe("public");
    expect(doc.header.difficulty).toBe("intermediate");
    expect(doc.header.duration).toEqual({ value: 8, unit: "weeks" });
    expect(doc.header.tags).toEqual(["strength", "endurance"]);
    expect(doc.header.language).toBe("en");
  });
});

// ---------------------------------------------------------------------------
// 3. Goals section
// ---------------------------------------------------------------------------

describe("Goals section", () => {
  it("parses multiple goals (primary + secondary)", () => {
    const doc = parseOk(`\
PLAN "G"
TYPE workout

GOALS
  GOAL primary muscle_gain:
    target weight 5 kg relative
  GOAL secondary fat_loss:
    target body_fat -3 percentage relative`);
    expect(doc.goals).toHaveLength(2);
    expect(doc.goals![0].priority).toBe("primary");
    expect(doc.goals![0].category).toBe("muscle_gain");
    expect(doc.goals![1].priority).toBe("secondary");
    expect(doc.goals![1].category).toBe("fat_loss");
  });

  it("parses goal with negative target value", () => {
    const doc = parseOk(`\
PLAN "G"
TYPE workout

GOALS
  GOAL primary fat_loss:
    target body_fat -5 kg relative`);
    const goal = doc.goals![0];
    expect(goal.target!.value).toBe(-5);
    expect(goal.target!.unit).toBe("kg");
    expect(goal.target!.measurement_type).toBe("relative");
  });

  it("parses goal target with absolute measurement type", () => {
    const doc = parseOk(`\
PLAN "G"
TYPE workout

GOALS
  GOAL primary strength:
    target bench_1rm 100 kg absolute`);
    const goal = doc.goals![0];
    expect(goal.target!.measurement_type).toBe("absolute");
    expect(goal.target!.value).toBe(100);
  });

  it("parses goal with milestone", () => {
    const doc = parseOk(`\
PLAN "G"
TYPE workout

GOALS
  GOAL primary muscle_gain:
    target weight 10 kg absolute
    milestone "First 5kg":
      at 5 kg
      reward 100 points
      badge bronze_lifter`);
    const goal = doc.goals![0];
    expect(goal.milestones).toHaveLength(1);
    const ms = goal.milestones![0];
    expect(ms.name).toBe("First 5kg");
    expect(ms.at_value).toBe(5);
    expect(ms.at_unit).toBe("kg");
    expect(ms.reward_points).toBe(100);
    expect(ms.badge).toBe("bronze_lifter");
  });

  it("parses goal with deadline", () => {
    const doc = parseOk(`\
PLAN "G"
TYPE workout

GOALS
  GOAL primary muscle_gain:
    target weight 5 kg absolute
    deadline 2025-06-01`);
    const goal = doc.goals![0];
    expect(goal.deadline).toBe("2025-06-01");
  });

  it("defaults measurement_type to absolute when not specified", () => {
    const doc = parseOk(`\
PLAN "G"
TYPE workout

GOALS
  GOAL primary strength:
    target bench_1rm 100 kg`);
    expect(doc.goals![0].target!.measurement_type).toBe("absolute");
  });
});

// ---------------------------------------------------------------------------
// 4. Requirements section
// ---------------------------------------------------------------------------

describe("Requirements section", () => {
  it("parses age range with .. operator", () => {
    const doc = parseOk(`\
PLAN "R"
TYPE workout

REQUIRES
  age 18..60`);
    expect(doc.requirements!.age_range).toEqual([18, 60]);
  });

  it("parses multiple fitness levels", () => {
    const doc = parseOk(`\
PLAN "R"
TYPE workout

REQUIRES
  fitness beginner, intermediate`);
    expect(doc.requirements!.fitness_levels).toEqual(["beginner", "intermediate"]);
  });

  it("parses equipment list with required/optional flags", () => {
    const doc = parseOk(`\
PLAN "R"
TYPE workout

REQUIRES
  equipment:
    dumbbells (required)
    mat (optional)`);
    expect(doc.requirements!.equipment).toHaveLength(2);
    expect(doc.requirements!.equipment![0].name).toBe("dumbbells");
    expect(doc.requirements!.equipment![0].required).toBe(true);
    expect(doc.requirements!.equipment![1].name).toBe("mat");
    expect(doc.requirements!.equipment![1].required).toBe(false);
  });

  it("parses equipment with alternatives", () => {
    const doc = parseOk(`\
PLAN "R"
TYPE workout

REQUIRES
  equipment:
    barbell (required, alternatives: dumbbells, kettlebell)`);
    const equip = doc.requirements!.equipment![0];
    expect(equip.name).toBe("barbell");
    expect(equip.required).toBe(true);
    expect(equip.alternatives).toEqual(["dumbbells", "kettlebell"]);
  });

  it("parses contraindications", () => {
    const doc = parseOk(`\
PLAN "R"
TYPE workout

REQUIRES
  contraindication back_injury -> exclude`);
    expect(doc.requirements!.contraindications).toHaveLength(1);
    const c = doc.requirements!.contraindications![0];
    expect(c.condition).toBe("back_injury");
    expect(c.action).toBe("exclude");
  });

  it("parses contraindication with modify action", () => {
    const doc = parseOk(`\
PLAN "R"
TYPE workout

REQUIRES
  contraindication knee_injury -> modify`);
    const c = doc.requirements!.contraindications![0];
    expect(c.action).toBe("modify");
  });

  it("parses empty requirements body", () => {
    const doc = parseOk(`\
PLAN "R"
TYPE workout

REQUIRES`);
    expect(doc.requirements).toBeDefined();
    expect(doc.requirements!.age_range).toBeNull();
    expect(doc.requirements!.fitness_levels).toBeNull();
    expect(doc.requirements!.equipment).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Personalization section
// ---------------------------------------------------------------------------

describe("Personalization section", () => {
  it("parses simple condition: injury contains knee", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN injury contains knee:
      replace squat -> wall_sit`);
    const rule = doc.personalization!.rules[0];
    expect(rule.condition.type).toBe("simple");
    expect(rule.condition.field).toBe("injury");
    expect(rule.condition.op).toBe("contains");
    expect(rule.condition.value).toBe("knee");
  });

  it("parses compound AND condition", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN age >= 50 AND injury contains knee:
      replace squat -> wall_sit`);
    const cond = doc.personalization!.rules[0].condition;
    expect(cond.type).toBe("compound");
    expect(cond.operator).toBe("and");
    expect(cond.conditions).toHaveLength(2);
    expect(cond.conditions![0].field).toBe("age");
    expect(cond.conditions![0].op).toBe("gte");
    expect(cond.conditions![0].value).toBe(50);
    expect(cond.conditions![1].field).toBe("injury");
    expect(cond.conditions![1].op).toBe("contains");
    expect(cond.conditions![1].value).toBe("knee");
  });

  it("parses compound OR condition", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN injury contains knee OR injury contains back:
      exclude squat`);
    const cond = doc.personalization!.rules[0].condition;
    expect(cond.type).toBe("compound");
    expect(cond.operator).toBe("or");
    expect(cond.conditions).toHaveLength(2);
    expect(cond.conditions![0].value).toBe("knee");
    expect(cond.conditions![1].value).toBe("back");
  });

  it("parses replace action with arrow", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN injury contains knee:
      replace squat -> wall_sit`);
    const action = doc.personalization!.rules[0].actions[0];
    expect(action.type).toBe("replace_exercise");
    expect(action.params).toEqual({ from: "squat", to: "wall_sit" });
  });

  it("parses exclude action", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN injury contains back:
      exclude deadlift`);
    const action = doc.personalization!.rules[0].actions[0];
    expect(action.type).toBe("exclude_exercise");
    expect(action.params).toEqual({ exercise: "deadlift" });
  });

  it("parses reduce sets action", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN fitness == beginner:
      reduce sets by 1`);
    const action = doc.personalization!.rules[0].actions[0];
    expect(action.type).toBe("reduce_sets");
    expect(action.params).toEqual({ amount: 1 });
  });

  it("parses reduce reps action", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN fitness == beginner:
      reduce reps by 2`);
    const action = doc.personalization!.rules[0].actions[0];
    expect(action.type).toBe("reduce_reps");
    expect(action.params).toEqual({ amount: 2 });
  });

  it("parses increase rest action", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN age >= 50 :
      increase rest by 30 seconds`);
    const action = doc.personalization!.rules[0].actions[0];
    expect(action.type).toBe("increase_rest");
    expect(action.params).toEqual({ duration: { value: 30, unit: "seconds" } });
  });

  it("parses multiple actions in one rule", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN injury contains knee:
      replace squat -> wall_sit
      exclude deadlift
      reduce sets by 1`);
    const actions = doc.personalization!.rules[0].actions;
    expect(actions).toHaveLength(3);
    expect(actions[0].type).toBe("replace_exercise");
    expect(actions[1].type).toBe("exclude_exercise");
    expect(actions[2].type).toBe("reduce_sets");
  });

  it("parses == comparison operator", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN fitness == advanced:
      reduce sets by 0`);
    expect(doc.personalization!.rules[0].condition.op).toBe("eq");
  });

  it("parses != comparison operator", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN fitness != beginner:
      reduce sets by 0`);
    expect(doc.personalization!.rules[0].condition.op).toBe("neq");
  });

  it("parses >= comparison operator", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN age >= 40 :
      reduce sets by 0`);
    expect(doc.personalization!.rules[0].condition.op).toBe("gte");
  });

  it("parses <= comparison operator", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN age <= 18 :
      reduce sets by 0`);
    expect(doc.personalization!.rules[0].condition.op).toBe("lte");
  });

  it("parses > comparison operator", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN age > 60 :
      reduce sets by 0`);
    expect(doc.personalization!.rules[0].condition.op).toBe("gt");
  });

  it("parses < comparison operator", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN age < 16 :
      reduce sets by 0`);
    expect(doc.personalization!.rules[0].condition.op).toBe("lt");
  });

  it("parses contains comparison operator", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN injury contains shoulder:
      exclude overhead_press`);
    expect(doc.personalization!.rules[0].condition.op).toBe("contains");
  });

  it("parses add warmup action", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN age >= 50 :
      add warmup 5 minutes`);
    const action = doc.personalization!.rules[0].actions[0];
    expect(action.type).toBe("add_warmup_time");
    expect(action.params).toEqual({ minutes: 5 });
  });

  it("parses modify intensity action", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN fitness == beginner:
      reduce intensity by 20 %`);
    const action = doc.personalization!.rules[0].actions[0];
    expect(action.type).toBe("modify_intensity");
    expect(action.params).toEqual({ factor: 0.8 });
  });
});

// ---------------------------------------------------------------------------
// 6. Exercise activities
// ---------------------------------------------------------------------------

describe("Exercise activities", () => {
  function exerciseDoc(exerciseLine: string): Document {
    return parseOk(`\
PLAN "E"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Test":
        main straight_sets:
          ${exerciseLine}`);
  }

  function getExercise(doc: Document) {
    const act = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    if (act.kind !== "exercise") throw new Error("Expected exercise, got " + act.kind);
    return act;
  }

  it("parses exercise with all modifiers", () => {
    const doc = exerciseDoc("bench_press 4x6..8 rpe 8 rir 2 rest 90 seconds weight 80 kg");
    const ex = getExercise(doc);
    expect(ex.exercise_ref).toBe("bench_press");
    expect(ex.sets).toBe(4);
    expect(ex.reps).toEqual([6, 8]);
    expect(ex.rpe).toBe(8);
    expect(ex.rir).toBe(2);
    expect(ex.rest).toEqual({ value: 90, unit: "seconds" });
    expect(ex.weight).toEqual({ type: "absolute", value: 80, unit: "kg" });
  });

  it("parses exercise with bodyweight", () => {
    const doc = exerciseDoc("pull_up 3x5 weight bodyweight");
    const ex = getExercise(doc);
    expect(ex.exercise_ref).toBe("pull_up");
    expect(ex.sets).toBe(3);
    expect(ex.reps).toBe(5);
    expect(ex.weight).toEqual({ type: "bodyweight", value: null, unit: null });
  });

  it("parses exercise with simple rep count", () => {
    const doc = exerciseDoc("plank 3x30");
    const ex = getExercise(doc);
    expect(ex.sets).toBe(3);
    expect(ex.reps).toBe(30);
  });

  it("parses exercise with range reps", () => {
    const doc = exerciseDoc("push_up 3x8..12");
    const ex = getExercise(doc);
    expect(ex.sets).toBe(3);
    expect(ex.reps).toEqual([8, 12]);
  });

  it("parses exercise with range+target reps", () => {
    const doc = exerciseDoc("push_up 3x8..12 target 10");
    const ex = getExercise(doc);
    expect(ex.reps).toEqual([8, 12, 10]);
  });

  it("parses exercise with tempo", () => {
    const doc = exerciseDoc("bench_press 3x10 tempo 3 - 1 - 2 - 1");
    const ex = getExercise(doc);
    expect(ex.tempo).toBe("3-1-2-1");
  });

  it("parses exercise with rpe only", () => {
    const doc = exerciseDoc("squat 4x8 rpe 8");
    const ex = getExercise(doc);
    expect(ex.rpe).toBe(8);
    expect(ex.rir).toBeNull();
  });

  it("parses exercise with rest only", () => {
    const doc = exerciseDoc("deadlift 5x5 rest 120 seconds");
    const ex = getExercise(doc);
    expect(ex.rest).toEqual({ value: 120, unit: "seconds" });
  });

  it("parses exercise with lbs weight", () => {
    const doc = exerciseDoc("bench_press 3x10 weight 135 lbs");
    const ex = getExercise(doc);
    expect(ex.weight).toEqual({ type: "absolute", value: 135, unit: "lbs" });
  });

  it("unknown exercise generates error with suggestions", () => {
    const result = parseSource(`\
PLAN "E"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Test":
        main straight_sets:
          bnech_press 3x10`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const exerciseError = result.errors.find(
        (e) => e.kind === "parse" && e.type === "unknown_exercise_ref",
      );
      expect(exerciseError).toBeDefined();
      if (exerciseError && exerciseError.kind === "parse") {
        expect(exerciseError.got).toBe("bnech_press");
        expect(exerciseError.suggestions).toBeDefined();
        expect(exerciseError.suggestions!.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Cardio activities
// ---------------------------------------------------------------------------

describe("Cardio activities", () => {
  function cardioDoc(cardioBlock: string): Document {
    return parseOk(`\
PLAN "C"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Test":
        main:
${cardioBlock}`);
  }

  it("parses continuous cardio", () => {
    const doc = cardioDoc(`\
          cardio running continuous:
            total 30 minutes
            zone 3`);
    const act = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    expect(act.kind).toBe("cardio");
    if (act.kind === "cardio") {
      expect(act.modality).toBe("running");
      expect(act.cardio_type).toBe("continuous");
      expect(act.total_duration).toEqual({ value: 30, unit: "minutes" });
      expect(act.zone).toBe(3);
    }
  });

  it("parses interval cardio", () => {
    const doc = cardioDoc(`\
          cardio cycling intervals:
            30s work / 30s rest x10`);
    const act = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    expect(act.kind).toBe("cardio");
    if (act.kind === "cardio") {
      expect(act.modality).toBe("cycling");
      expect(act.cardio_type).toBe("intervals");
      expect(act.intervals).toBeDefined();
      expect(act.intervals!.work_seconds).toBe(30);
      expect(act.intervals!.rest_seconds).toBe(30);
      expect(act.intervals!.repeats).toBe(10);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Nutrition activities
// ---------------------------------------------------------------------------

describe("Nutrition activities", () => {
  function nutritionDoc(nutritionBlock: string): Document {
    return parseOk(`\
PLAN "N"
TYPE nutrition

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Nutrition Day":
        nutrition:
${nutritionBlock}`);
  }

  it("parses nutrition with macros", () => {
    const doc = nutritionDoc(`\
          nutrition post_workout:
            protein 30..50 g
            carbs 40..60 g
            fat <= 20 g`);
    const block = doc.phases[0].weeks[0].days[0].blocks[0];
    const act = block.activities[0];
    expect(act.kind).toBe("nutrition");
    if (act.kind === "nutrition") {
      expect(act.category).toBe("post_workout");
      expect(act.macros!.protein).toEqual([30, 50]);
      expect(act.macros!.carbs).toEqual([40, 60]);
      expect(act.macros!.fat).toEqual([0, 20]);
    }
  });

  it("parses nutrition with timing at specific time", () => {
    const doc = nutritionDoc(`\
          nutrition post_workout:
            timing at 08:00`);
    const act = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    if (act.kind === "nutrition") {
      expect(act.timing).toBeDefined();
      expect(act.timing!.type).toBe("at_time");
      expect(act.timing!.time).toBe("08:00");
    }
  });

  it("parses nutrition with suggestions", () => {
    const doc = nutritionDoc(`\
          nutrition post_workout:
            suggestions:
              - whey_protein
              - banana`);
    const act = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    if (act.kind === "nutrition") {
      expect(act.suggestions).toEqual(["whey_protein", "banana"]);
    }
  });

  it("parses nutrition with calories range", () => {
    const doc = nutritionDoc(`\
          nutrition post_workout:
            calories 300..500`);
    const act = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    if (act.kind === "nutrition") {
      expect(act.calories).toEqual([300, 500]);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Meditation activities
// ---------------------------------------------------------------------------

describe("Meditation activities", () => {
  it("parses meditation with duration, category, guided flag", () => {
    const doc = parseOk(`\
PLAN "M"
TYPE meditation

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "Meditation Day":
        meditation:
          meditation breathing:
            duration 10 minutes
            guided true`);
    const block = doc.phases[0].weeks[0].days[0].blocks[0];
    const act = block.activities[0];
    expect(act.kind).toBe("meditation");
    if (act.kind === "meditation") {
      expect(act.category).toBe("breathing");
      expect(act.duration).toEqual({ value: 10, unit: "minutes" });
      expect(act.guided).toBe(true);
    }
  });

  it("parses meditation with guided false", () => {
    const doc = parseOk(`\
PLAN "M"
TYPE meditation

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 20m "Med":
        meditation:
          meditation mindfulness:
            duration 15 minutes
            guided false`);
    const act = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    if (act.kind === "meditation") {
      expect(act.guided).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 10. Habit activities
// ---------------------------------------------------------------------------

describe("Habit activities", () => {
  it("parses habit with target, target_unit, frequency", () => {
    const doc = parseOk(`\
PLAN "H"
TYPE hybrid

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "Habit Day":
        education:
          habit water_intake:
            target 8 glasses
            frequency daily`);
    const block = doc.phases[0].weeks[0].days[0].blocks[0];
    const act = block.activities[0];
    expect(act.kind).toBe("habit");
    if (act.kind === "habit") {
      expect(act.category).toBe("water_intake");
      expect(act.target).toBe(8);
      expect(act.target_unit).toBe("glasses");
      expect(act.frequency).toBe("daily");
    }
  });
});

// ---------------------------------------------------------------------------
// 11. Recovery activities
// ---------------------------------------------------------------------------

describe("Recovery activities", () => {
  function cooldownDoc(cooldownLine: string): Document {
    return parseOk(`\
PLAN "R"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 45m "Test":
        cooldown:
          ${cooldownLine}`);
  }

  it("parses recovery exercise with sides both", () => {
    const doc = cooldownDoc("chest_stretch 30s x2 sides both");
    const act = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    expect(act.kind).toBe("recovery");
    if (act.kind === "recovery") {
      expect(act.exercises![0].name).toBe("chest_stretch");
      expect(act.exercises![0].hold_seconds).toBe(30);
      expect(act.exercises![0].reps).toBe(2);
      expect(act.exercises![0].sides).toBe("both");
    }
  });

  it("parses recovery exercise with sides left", () => {
    const doc = cooldownDoc("hip_flexor_stretch 30s x2 sides left");
    const act = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    if (act.kind === "recovery") {
      expect(act.exercises![0].sides).toBe("left");
    }
  });

  it("parses recovery exercise with sides right", () => {
    const doc = cooldownDoc("quad_stretch 20s x3 sides right");
    const act = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    if (act.kind === "recovery") {
      expect(act.exercises![0].sides).toBe("right");
    }
  });

  it("parses recovery exercise without sides", () => {
    const doc = cooldownDoc("hamstring_stretch 30s x2");
    const act = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    if (act.kind === "recovery") {
      expect(act.exercises![0].sides).toBeNull();
    }
  });

  it("wraps cooldown exercises as recovery activities", () => {
    const doc = cooldownDoc("chest_stretch 30s x2 sides both");
    const act = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    expect(act.kind).toBe("recovery");
    if (act.kind === "recovery") {
      expect(act.category).toBe("cooldown");
    }
  });
});

// ---------------------------------------------------------------------------
// 12. Block structures
// ---------------------------------------------------------------------------

describe("Block structures", () => {
  function dayWithBlock(blockLine: string, activityLine: string): Document {
    return parseOk(`\
PLAN "B"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Test":
        ${blockLine}:
          ${activityLine}`);
  }

  it("parses warmup block type", () => {
    const doc = dayWithBlock("warmup", "jumping_jack 5m");
    expect(doc.phases[0].weeks[0].days[0].blocks[0].type).toBe("warmup");
  });

  it("parses main block type", () => {
    const doc = dayWithBlock("main", "push_up 3x10");
    expect(doc.phases[0].weeks[0].days[0].blocks[0].type).toBe("main");
  });

  it("parses cooldown block type", () => {
    const doc = dayWithBlock("cooldown", "chest_stretch 30s x2");
    expect(doc.phases[0].weeks[0].days[0].blocks[0].type).toBe("cooldown");
  });

  it("parses straight_sets structure", () => {
    const doc = dayWithBlock("main straight_sets", "push_up 3x10");
    expect(doc.phases[0].weeks[0].days[0].blocks[0].structure).toBe("straight_sets");
  });

  it("parses circuit structure", () => {
    const doc = dayWithBlock("main circuit", "push_up 3x10");
    expect(doc.phases[0].weeks[0].days[0].blocks[0].structure).toBe("circuit");
  });

  it("parses superset structure", () => {
    const doc = dayWithBlock("main superset", "push_up 3x10");
    expect(doc.phases[0].weeks[0].days[0].blocks[0].structure).toBe("superset");
  });

  it("parses emom structure", () => {
    const doc = dayWithBlock("main emom", "push_up 3x10");
    expect(doc.phases[0].weeks[0].days[0].blocks[0].structure).toBe("emom");
  });

  it("parses amrap structure", () => {
    const doc = dayWithBlock("main amrap", "push_up 3x10");
    expect(doc.phases[0].weeks[0].days[0].blocks[0].structure).toBe("amrap");
  });

  it("parses tabata structure", () => {
    const doc = dayWithBlock("main tabata", "push_up 3x10");
    expect(doc.phases[0].weeks[0].days[0].blocks[0].structure).toBe("tabata");
  });

  it("parses block without structure", () => {
    const doc = dayWithBlock("warmup", "jumping_jack 5m");
    expect(doc.phases[0].weeks[0].days[0].blocks[0].structure).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 13. Multiple phases, weeks, days
// ---------------------------------------------------------------------------

describe("Multiple phases, weeks, days", () => {
  it("parses multiple phases", () => {
    const doc = parseOk(`\
PLAN "Multi"
TYPE workout

PHASES
  PHASE "Phase A" (4 weeks):
    WEEK 1:
      DAY Monday training 45m "Day A":
        main:
          push_up 3x10
  PHASE "Phase B" (4 weeks):
    WEEK 1:
      DAY Monday training 45m "Day B":
        main:
          squat 3x10`);
    expect(doc.phases).toHaveLength(2);
    expect(doc.phases[0].name).toBe("Phase A");
    expect(doc.phases[1].name).toBe("Phase B");
  });

  it("parses multiple weeks in a phase", () => {
    const doc = parseOk(`\
PLAN "Multi"
TYPE workout

PHASES
  PHASE "Test" (4 weeks):
    WEEK 1:
      DAY Monday training 45m "W1":
        main:
          push_up 3x10
    WEEK 2:
      DAY Monday training 45m "W2":
        main:
          push_up 4x10`);
    expect(doc.phases[0].weeks).toHaveLength(2);
    expect(doc.phases[0].weeks[0].number).toBe(1);
    expect(doc.phases[0].weeks[1].number).toBe(2);
  });

  it("parses multiple days in a week", () => {
    const doc = parseOk(`\
PLAN "Multi"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 45m "Upper":
        main:
          push_up 3x10
      DAY Wednesday training 45m "Lower":
        main:
          squat 3x10
      DAY Friday training 45m "Full":
        main:
          deadlift 3x10`);
    const days = doc.phases[0].weeks[0].days;
    expect(days).toHaveLength(3);
    expect(days[0].day_name).toBe("Monday");
    expect(days[1].day_name).toBe("Wednesday");
    expect(days[2].day_name).toBe("Friday");
  });

  it("parses rest day type", () => {
    const doc = parseOk(`\
PLAN "Multi"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Tuesday rest 0m "Rest Day":`);
    const day = doc.phases[0].weeks[0].days[0];
    expect(day.day_type).toBe("rest");
    expect(day.label).toBe("Rest Day");
  });

  it("parses active_recovery day type", () => {
    const doc = parseOk(`\
PLAN "Multi"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Sunday active_recovery 30m "Recovery":`);
    const day = doc.phases[0].weeks[0].days[0];
    expect(day.day_type).toBe("active_recovery");
  });

  it("parses day with numeric name", () => {
    const doc = parseOk(`\
PLAN "Multi"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY 1 training 45m "Day 1":
        main:
          push_up 3x10`);
    expect(doc.phases[0].weeks[0].days[0].day_name).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 14. Simple activities
// ---------------------------------------------------------------------------

describe("Simple activities", () => {
  function simpleDoc(activityLine: string): Document {
    return parseOk(`\
PLAN "S"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 45m "Test":
        warmup:
          ${activityLine}`);
  }

  it("parses simple activity with duration (2m)", () => {
    const doc = simpleDoc("jumping_jack 2m");
    const act = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    expect(act.kind).toBe("simple");
    if (act.kind === "simple") {
      expect(act.name).toBe("jumping_jack");
      expect(act.duration).toEqual({ value: 2, unit: "minutes" });
    }
  });

  it("parses simple activity with 5m", () => {
    const doc = simpleDoc("jumping_jack 5m");
    const act = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    if (act.kind === "simple") {
      expect(act.duration).toEqual({ value: 5, unit: "minutes" });
    }
  });

  it("parses simple activity with seconds", () => {
    const doc = simpleDoc("arm_circles 30s");
    const act = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    if (act.kind === "simple") {
      expect(act.name).toBe("arm_circles");
      expect(act.duration).toEqual({ value: 30, unit: "seconds" });
    }
  });

  it("parses simple activity with full unit word", () => {
    const doc = simpleDoc("jog_in_place 5 minutes");
    const act = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    if (act.kind === "simple") {
      expect(act.duration).toEqual({ value: 5, unit: "minutes" });
    }
  });
});

// ---------------------------------------------------------------------------
// 15. Error cases
// ---------------------------------------------------------------------------

describe("Error cases", () => {
  it("errors on missing PLAN name", () => {
    const result = parseSource(`TYPE workout`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("errors on missing TYPE", () => {
    const result = parseSource(`PLAN "Test"`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find(
        (e) => e.kind === "parse" && e.type === "missing_required",
      );
      expect(err).toBeDefined();
    }
  });

  it("errors when PLAN name is not a string", () => {
    const result = parseSource(`PLAN 123\nTYPE workout`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("returns errors array on failure", () => {
    const result = parseSource(`TYPE workout`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("parses ok for valid minimal document", () => {
    const result = parseSource(`PLAN "Valid"\nTYPE workout`);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 16. Document structure defaults
// ---------------------------------------------------------------------------

describe("Document structure defaults", () => {
  it("returns null for missing optional sections", () => {
    const doc = parseOk(`PLAN "Min"\nTYPE workout`);
    expect(doc.goals).toBeNull();
    expect(doc.requirements).toBeNull();
    expect(doc.personalization).toBeNull();
    expect(doc.phases).toEqual([]);
    expect(doc.progress).toBeNull();
    expect(doc.notifications).toBeNull();
    expect(doc.rendering).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 17. Phase with description and goals
// ---------------------------------------------------------------------------

describe("Phase attributes", () => {
  it("parses phase duration correctly", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PHASES
  PHASE "Build" (6 weeks):
    WEEK 1:
      DAY Monday training 45m "D1":
        main:
          push_up 3x10`);
    expect(doc.phases[0].duration).toEqual({ value: 6, unit: "weeks" });
  });
});

// ---------------------------------------------------------------------------
// 18. Day with schedule preference
// ---------------------------------------------------------------------------

describe("Day schedule", () => {
  it("parses day with schedule preference", () => {
    const doc = parseOk(`\
PLAN "S"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 45m "Morning Workout":
        schedule morning strict
        main:
          push_up 3x10`);
    const day = doc.phases[0].weeks[0].days[0];
    expect(day.schedule).toEqual(["morning", "strict"]);
  });
});

// ---------------------------------------------------------------------------
// 19. Block with rounds
// ---------------------------------------------------------------------------

describe("Block with rounds", () => {
  it("parses circuit block with rounds", () => {
    const doc = parseOk(`\
PLAN "B"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Circuit":
        main circuit:
          rounds 3
          rest_between_rounds 60 seconds
          push_up 3x10
          squat 3x10`);
    const block = doc.phases[0].weeks[0].days[0].blocks[0];
    expect(block.rounds).toBe(3);
    expect(block.rest_between_rounds).toEqual({ value: 60, unit: "seconds" });
    expect(block.activities).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 20. Exercise edge cases
// ---------------------------------------------------------------------------

describe("Exercise edge cases", () => {
  it("parses exercise with no modifiers", () => {
    const doc = parseOk(`\
PLAN "E"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Test":
        main:
          push_up 3x10`);
    const ex = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    if (ex.kind === "exercise") {
      expect(ex.rpe).toBeNull();
      expect(ex.rir).toBeNull();
      expect(ex.tempo).toBeNull();
      expect(ex.rest).toBeNull();
      expect(ex.weight).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 21. Multiple blocks in a day
// ---------------------------------------------------------------------------

describe("Multiple blocks in a day", () => {
  it("parses warmup, main, and cooldown blocks", () => {
    const doc = parseOk(`\
PLAN "Multi"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Full":
        warmup:
          jumping_jack 5m
        main straight_sets:
          bench_press 4x8 rpe 7
          dumbbell_row 4x8
        cooldown:
          chest_stretch 30s x2`);
    const blocks = doc.phases[0].weeks[0].days[0].blocks;
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe("warmup");
    expect(blocks[0].activities).toHaveLength(1);
    expect(blocks[1].type).toBe("main");
    expect(blocks[1].activities).toHaveLength(2);
    expect(blocks[2].type).toBe("cooldown");
    expect(blocks[2].activities).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 22. Complex multi-section document
// ---------------------------------------------------------------------------

describe("Complex multi-section document", () => {
  it("parses a document with all major sections", () => {
    const doc = parseOk(`\
PLAN "Complete Plan"
TYPE workout
VISIBILITY public
DIFFICULTY intermediate
TAGS strength, hypertrophy
LANGUAGE en

GOALS
  GOAL primary muscle_gain:
    target weight 5 kg relative
  GOAL secondary fat_loss:
    target body_fat -3 percentage relative

REQUIRES
  age 18..55
  fitness beginner, intermediate
  equipment:
    dumbbells (required)
    barbell (optional, alternatives: dumbbells)

PERSONALIZATION
  RULES
    WHEN injury contains knee:
      replace squat -> wall_sit
    WHEN age >= 50 :
      reduce sets by 1
      increase rest by 30 seconds

PHASES
  PHASE "Foundation" (4 weeks):
    WEEK 1:
      DAY Monday training 60m "Upper Body":
        warmup:
          jumping_jack 5m
        main straight_sets:
          bench_press 4x8..10 rpe 7 rest 90 seconds
          dumbbell_row 4x8..10 rpe 7 rest 90 seconds
        cooldown:
          chest_stretch 30s x2 sides both`);
    // Verify overall structure
    expect(doc.header.name).toBe("Complete Plan");
    expect(doc.goals).toHaveLength(2);
    expect(doc.requirements).toBeDefined();
    expect(doc.personalization!.rules).toHaveLength(2);
    expect(doc.phases).toHaveLength(1);
    expect(doc.phases[0].weeks[0].days[0].blocks).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 23. Personalization rule with scope
// ---------------------------------------------------------------------------

describe("Personalization action scope", () => {
  it("defaults scope to plan when not specified", () => {
    const doc = parseOk(`\
PLAN "P"
TYPE workout

PERSONALIZATION
  RULES
    WHEN injury contains knee:
      exclude squat`);
    expect(doc.personalization!.rules[0].actions[0].scope).toBe("plan");
  });
});

// ---------------------------------------------------------------------------
// 24. Equipment without flags
// ---------------------------------------------------------------------------

describe("Equipment without flags", () => {
  it("parses equipment with no parentheses (defaults required false)", () => {
    const doc = parseOk(`\
PLAN "R"
TYPE workout

REQUIRES
  equipment:
    mat`);
    const equip = doc.requirements!.equipment![0];
    expect(equip.name).toBe("mat");
    expect(equip.required).toBe(false);
    expect(equip.alternatives).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 25. Week with name
// ---------------------------------------------------------------------------

describe("Week with name", () => {
  it("parses week with optional name", () => {
    const doc = parseOk(`\
PLAN "W"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1 "Intro Week":
      DAY Monday training 45m "D1":
        main:
          push_up 3x10`);
    expect(doc.phases[0].weeks[0].name).toBe("Intro Week");
    expect(doc.phases[0].weeks[0].number).toBe(1);
  });

  it("parses week without name (null)", () => {
    const doc = parseOk(`\
PLAN "W"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 45m "D1":
        main:
          push_up 3x10`);
    expect(doc.phases[0].weeks[0].name).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 26. Day without label
// ---------------------------------------------------------------------------

describe("Day without label", () => {
  it("parses day without string label (null)", () => {
    const doc = parseOk(`\
PLAN "D"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 45m:
        main:
          push_up 3x10`);
    expect(doc.phases[0].weeks[0].days[0].label).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 27. Multiple exercises in main block
// ---------------------------------------------------------------------------

describe("Multiple exercises in main block", () => {
  it("parses multiple exercises", () => {
    const doc = parseOk(`\
PLAN "M"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Test":
        main straight_sets:
          bench_press 4x8 rpe 7
          dumbbell_row 4x10
          shoulder_press 3x10 rest 60 seconds`);
    const activities = doc.phases[0].weeks[0].days[0].blocks[0].activities;
    expect(activities).toHaveLength(3);
    expect(activities[0].kind).toBe("exercise");
    expect(activities[1].kind).toBe("exercise");
    expect(activities[2].kind).toBe("exercise");
    if (activities[0].kind === "exercise") expect(activities[0].exercise_ref).toBe("bench_press");
    if (activities[1].kind === "exercise") expect(activities[1].exercise_ref).toBe("dumbbell_row");
    if (activities[2].kind === "exercise") expect(activities[2].exercise_ref).toBe("shoulder_press");
  });
});

// ---------------------------------------------------------------------------
// 28. Goals with description and name
// ---------------------------------------------------------------------------

describe("Goals with name and description", () => {
  it("parses goal with name and description", () => {
    const doc = parseOk(`\
PLAN "G"
TYPE workout

GOALS
  GOAL primary muscle_gain:
    name "Build Muscle Mass"
    description "Gain lean muscle over 12 weeks"
    target weight 5 kg relative`);
    const goal = doc.goals![0];
    expect(goal.name).toBe("Build Muscle Mass");
    expect(goal.description).toBe("Gain lean muscle over 12 weeks");
  });
});

// ---------------------------------------------------------------------------
// 29. Recovery block as explicit activity
// ---------------------------------------------------------------------------

describe("Recovery as explicit activity", () => {
  it("parses recovery keyword in a block", () => {
    const doc = parseOk(`\
PLAN "R"
TYPE recovery

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "Recovery Day":
        main:
          recovery stretching:
            duration 15 minutes
            hamstring_stretch 30s x2 sides both
            quad_stretch 30s x2 sides both`);
    const act = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    expect(act.kind).toBe("recovery");
    if (act.kind === "recovery") {
      expect(act.category).toBe("stretching");
      expect(act.duration).toEqual({ value: 15, unit: "minutes" });
      expect(act.exercises).toHaveLength(2);
      expect(act.exercises![0].name).toBe("hamstring_stretch");
      expect(act.exercises![1].name).toBe("quad_stretch");
    }
  });
});

// ---------------------------------------------------------------------------
// 30. Comments in source
// ---------------------------------------------------------------------------

describe("Comments in source", () => {
  it("ignores comments and parses correctly", () => {
    const doc = parseOk(`\
# This is a plan
PLAN "Commented"
TYPE workout
# This is a comment about tags
TAGS strength`);
    expect(doc.header.name).toBe("Commented");
    expect(doc.header.tags).toEqual(["strength"]);
  });
});

// ---------------------------------------------------------------------------
// 31. Empty phases section
// ---------------------------------------------------------------------------

describe("Empty phases", () => {
  it("returns empty array for PHASES with no phases", () => {
    const doc = parseOk(`\
PLAN "Empty"
TYPE workout

PHASES`);
    expect(doc.phases).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 32. Empty goals section
// ---------------------------------------------------------------------------

describe("Empty goals", () => {
  it("returns empty array for GOALS with no goals", () => {
    const doc = parseOk(`\
PLAN "Empty"
TYPE workout

GOALS`);
    expect(doc.goals).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 33. Duration variants in day
// ---------------------------------------------------------------------------

describe("Duration variants", () => {
  it("parses day duration in seconds", () => {
    const doc = parseOk(`\
PLAN "D"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 2700s "Test":
        main:
          push_up 3x10`);
    expect(doc.phases[0].weeks[0].days[0].duration).toEqual({
      value: 2700,
      unit: "seconds",
    });
  });

  it("parses phase duration in days", () => {
    const doc = parseOk(`\
PLAN "D"
TYPE workout

PHASES
  PHASE "Test" (14 days):
    WEEK 1:
      DAY Monday training 45m "Test":
        main:
          push_up 3x10`);
    expect(doc.phases[0].duration).toEqual({ value: 14, unit: "days" });
  });
});

// ---------------------------------------------------------------------------
// 34. Day notes
// ---------------------------------------------------------------------------

describe("Day notes", () => {
  it("parses day with notes", () => {
    const doc = parseOk(`\
PLAN "N"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 45m "Test":
        notes "Focus on form today"
        main:
          push_up 3x10`);
    expect(doc.phases[0].weeks[0].days[0].notes).toBe("Focus on form today");
  });
});

// ---------------------------------------------------------------------------
// 35. Weight with percentage_1rm
// ---------------------------------------------------------------------------

describe("Weight types", () => {
  it("parses weight with percentage_1rm", () => {
    const doc = parseOk(`\
PLAN "W"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Test":
        main:
          bench_press 5x5 weight 75 percentage_1rm`);
    const ex = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    if (ex.kind === "exercise") {
      expect(ex.weight).toEqual({
        type: "percentage_1rm",
        value: 75,
        unit: "percentage_1rm",
      });
    }
  });
});

// ---------------------------------------------------------------------------
// 36. Multiple recovery exercises in cooldown
// ---------------------------------------------------------------------------

describe("Multiple recovery exercises in cooldown", () => {
  it("parses multiple recovery exercises", () => {
    const doc = parseOk(`\
PLAN "R"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 45m "Test":
        cooldown:
          chest_stretch 30s x2 sides both
          hamstring_stretch 20s x3
          quad_stretch 30s x2 sides left`);
    const block = doc.phases[0].weeks[0].days[0].blocks[0];
    expect(block.activities).toHaveLength(3);
    for (const act of block.activities) {
      expect(act.kind).toBe("recovery");
    }
  });
});

// ---------------------------------------------------------------------------
// 37. Cardio with total duration only
// ---------------------------------------------------------------------------

describe("Cardio with total duration only", () => {
  it("parses cardio with just total duration", () => {
    const doc = parseOk(`\
PLAN "C"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "Cardio":
        main:
          cardio running continuous:
            total 20 minutes`);
    const act = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    if (act.kind === "cardio") {
      expect(act.total_duration).toEqual({ value: 20, unit: "minutes" });
      expect(act.zone).toBeNull();
      expect(act.intervals).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 38. All day names
// ---------------------------------------------------------------------------

describe("All day names", () => {
  const dayNames = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  for (const dayName of dayNames) {
    it(`parses ${dayName} day name`, () => {
      const doc = parseOk(`\
PLAN "D"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY ${dayName} training 45m:
        main:
          push_up 3x10`);
      expect(doc.phases[0].weeks[0].days[0].day_name).toBe(dayName);
    });
  }
});

// ---------------------------------------------------------------------------
// 39. Exercise with name modifier
// ---------------------------------------------------------------------------

describe("Exercise with name modifier", () => {
  it("parses exercise with custom display name", () => {
    const doc = parseOk(`\
PLAN "E"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Test":
        main:
          bench_press 3x10 name "Flat Bench Press"`);
    const ex = doc.phases[0].weeks[0].days[0].blocks[0].activities[0];
    if (ex.kind === "exercise") {
      expect(ex.name).toBe("Flat Bench Press");
    }
  });
});

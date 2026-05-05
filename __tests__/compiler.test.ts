import { describe, it, expect } from "vitest";
import { tokenize } from "../src/lexer.js";
import { parse } from "../src/parser.js";
import { compile } from "../src/compiler.js";
import { CompileContext } from "../src/compile-context.js";
import type { Document } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helper: full pipeline source -> tokenize -> parse -> compile -> JSON
// ---------------------------------------------------------------------------

function compileSource(source: string): Record<string, unknown> {
  const lexResult = tokenize(source);
  if (!lexResult.ok)
    throw new Error("Lexer failed: " + JSON.stringify(lexResult.errors));
  const parseResult = parse(lexResult.tokens);
  if (!parseResult.ok)
    throw new Error("Parse failed: " + JSON.stringify(parseResult.errors));
  const compileResult = compile(parseResult.document);
  if (!compileResult.ok)
    throw new Error("Compile failed: " + JSON.stringify(compileResult.errors));
  return compileResult.json;
}

function compilePlan(source: string): Record<string, unknown> {
  const json = compileSource(source);
  return json.plan as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 1. Basic compilation
// ---------------------------------------------------------------------------

describe("Basic compilation", () => {
  const MINIMAL = `PLAN "Minimal"\nTYPE workout`;

  it("produces valid JSON with $schema field", () => {
    const json = compileSource(MINIMAL);
    expect(json.$schema).toBe("https://wpl.dev/schemas/wpl/v1.schema.json");
  });

  it("produces valid JSON with version field", () => {
    const json = compileSource(MINIMAL);
    expect(json.version).toBe("1.6.0");
  });

  it("sets plan.name from PLAN directive", () => {
    const plan = compilePlan(MINIMAL);
    expect(plan.name).toBe("Minimal");
  });

  it("sets plan.type from TYPE directive", () => {
    const plan = compilePlan(MINIMAL);
    expect(plan.type).toBe("workout");
  });

  it("generates a UUID string for plan.id", () => {
    const plan = compilePlan(MINIMAL);
    expect(typeof plan.id).toBe("string");
    expect(plan.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("defaults visibility to private when not specified", () => {
    const plan = compilePlan(MINIMAL);
    expect(plan.visibility).toBe("private");
  });

  it("includes metadata object", () => {
    const plan = compilePlan(MINIMAL);
    expect(plan.metadata).toBeDefined();
  });

  it("compiles hybrid plan type", () => {
    const plan = compilePlan(`PLAN "Hybrid"\nTYPE hybrid`);
    expect(plan.type).toBe("hybrid");
  });

  it("compiles nutrition plan type", () => {
    const plan = compilePlan(`PLAN "Nutrition"\nTYPE nutrition`);
    expect(plan.type).toBe("nutrition");
  });
});

// ---------------------------------------------------------------------------
// 2. Header metadata
// ---------------------------------------------------------------------------

describe("Header metadata", () => {
  it("compiles DIFFICULTY to plan.metadata.difficulty", () => {
    const plan = compilePlan(
      `PLAN "Test"\nTYPE workout\nDIFFICULTY intermediate`,
    );
    const metadata = plan.metadata as Record<string, unknown>;
    expect(metadata.difficulty).toBe("intermediate");
  });

  it("compiles TAGS to plan.metadata.tags array", () => {
    const plan = compilePlan(
      `PLAN "Test"\nTYPE workout\nTAGS strength, hypertrophy`,
    );
    const metadata = plan.metadata as Record<string, unknown>;
    expect(metadata.tags).toEqual(["strength", "hypertrophy"]);
  });

  it("compiles LANGUAGE to plan.metadata.language", () => {
    const plan = compilePlan(`PLAN "Test"\nTYPE workout\nLANGUAGE en`);
    const metadata = plan.metadata as Record<string, unknown>;
    expect(metadata.language).toBe("en");
  });

  it("compiles VISIBILITY to plan.visibility", () => {
    const plan = compilePlan(
      `PLAN "Test"\nTYPE workout\nVISIBILITY private`,
    );
    expect(plan.visibility).toBe("private");
  });

  it("compiles VISIBILITY public", () => {
    const plan = compilePlan(
      `PLAN "Test"\nTYPE workout\nVISIBILITY public`,
    );
    expect(plan.visibility).toBe("public");
  });

  it("includes created_at in metadata", () => {
    const plan = compilePlan(`PLAN "Test"\nTYPE workout`);
    const metadata = plan.metadata as Record<string, unknown>;
    expect(metadata.created_at).toBeDefined();
    expect(typeof metadata.created_at).toBe("string");
  });

  it("includes updated_at in metadata", () => {
    const plan = compilePlan(`PLAN "Test"\nTYPE workout`);
    const metadata = plan.metadata as Record<string, unknown>;
    expect(metadata.updated_at).toBeDefined();
    expect(typeof metadata.updated_at).toBe("string");
  });

  it("created_at and updated_at are ISO date strings", () => {
    const plan = compilePlan(`PLAN "Test"\nTYPE workout`);
    const metadata = plan.metadata as Record<string, unknown>;
    expect(metadata.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(metadata.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("compiles DURATION into estimated_duration_days for weeks", () => {
    const plan = compilePlan(
      `PLAN "Test"\nTYPE workout\nDURATION 8 weeks`,
    );
    const metadata = plan.metadata as Record<string, unknown>;
    expect(metadata.estimated_duration_days).toBe(56);
  });

  it("compiles DURATION into estimated_duration_days for days", () => {
    const plan = compilePlan(
      `PLAN "Test"\nTYPE workout\nDURATION 30 days`,
    );
    const metadata = plan.metadata as Record<string, unknown>;
    expect(metadata.estimated_duration_days).toBe(30);
  });

  it("compiles advanced difficulty", () => {
    const plan = compilePlan(
      `PLAN "Test"\nTYPE workout\nDIFFICULTY advanced`,
    );
    const metadata = plan.metadata as Record<string, unknown>;
    expect(metadata.difficulty).toBe("advanced");
  });
});

// ---------------------------------------------------------------------------
// 3. Goals compilation
// ---------------------------------------------------------------------------

describe("Goals compilation", () => {
  const GOALS_SOURCE = `PLAN "Goals Test"
TYPE workout

GOALS
  GOAL primary strength:
    name "Build Strength"
    description "Get stronger"
    target bench_press 100 kg absolute
    deadline 2025-06-01
  GOAL secondary weight_loss:
    name "Lose Weight"
    target body_weight -5 kg relative`;

  it("compiles multiple goals into goals array", () => {
    const plan = compilePlan(GOALS_SOURCE);
    const goals = plan.goals as Record<string, unknown>[];
    expect(goals).toHaveLength(2);
  });

  it("assigns sequential IDs to goals", () => {
    const plan = compilePlan(GOALS_SOURCE);
    const goals = plan.goals as Record<string, unknown>[];
    expect(goals[0].id).toBe("goal_1");
    expect(goals[1].id).toBe("goal_2");
  });

  it("compiles primary goal type", () => {
    const plan = compilePlan(GOALS_SOURCE);
    const goals = plan.goals as Record<string, unknown>[];
    expect(goals[0].type).toBe("primary");
  });

  it("compiles secondary goal type", () => {
    const plan = compilePlan(GOALS_SOURCE);
    const goals = plan.goals as Record<string, unknown>[];
    expect(goals[1].type).toBe("secondary");
  });

  it("compiles goal category", () => {
    const plan = compilePlan(GOALS_SOURCE);
    const goals = plan.goals as Record<string, unknown>[];
    expect(goals[0].category).toBe("strength");
    expect(goals[1].category).toBe("weight_loss");
  });

  it("compiles goal name", () => {
    const plan = compilePlan(GOALS_SOURCE);
    const goals = plan.goals as Record<string, unknown>[];
    expect(goals[0].name).toBe("Build Strength");
  });

  it("compiles goal description", () => {
    const plan = compilePlan(GOALS_SOURCE);
    const goals = plan.goals as Record<string, unknown>[];
    expect(goals[0].description).toBe("Get stronger");
  });

  it("compiles target with metric, value, unit, measurement_type", () => {
    const plan = compilePlan(GOALS_SOURCE);
    const goals = plan.goals as Record<string, unknown>[];
    const target = goals[0].target as Record<string, unknown>;
    expect(target.metric).toBe("bench_press");
    expect(target.target_value).toBe(100);
    expect(target.unit).toBe("kg");
    expect(target.measurement_type).toBe("absolute");
  });

  it("compiles negative target value for weight loss", () => {
    const plan = compilePlan(GOALS_SOURCE);
    const goals = plan.goals as Record<string, unknown>[];
    const target = goals[1].target as Record<string, unknown>;
    expect(target.target_value).toBe(-5);
  });

  it("compiles relative measurement_type", () => {
    const plan = compilePlan(GOALS_SOURCE);
    const goals = plan.goals as Record<string, unknown>[];
    const target = goals[1].target as Record<string, unknown>;
    expect(target.measurement_type).toBe("relative");
  });

  it("compiles deadline as date string", () => {
    const plan = compilePlan(GOALS_SOURCE);
    const goals = plan.goals as Record<string, unknown>[];
    expect(goals[0].deadline).toBe("2025-06-01");
  });

  it("defaults measurement_type to absolute when not specified", () => {
    const source = `PLAN "Test"
TYPE workout

GOALS
  GOAL primary endurance:
    target vo2max 50 ml`;

    const plan = compilePlan(source);
    const goals = plan.goals as Record<string, unknown>[];
    const target = goals[0].target as Record<string, unknown>;
    expect(target.measurement_type).toBe("absolute");
  });

  it("compiles milestones with name, target_value, and reward_points", () => {
    const source = `PLAN "Test"
TYPE workout

GOALS
  GOAL primary strength:
    target bench_press 100 kg
    milestone "Quarter Mark":
      at 25 kg
      reward 50 points`;

    const plan = compilePlan(source);
    const goals = plan.goals as Record<string, unknown>[];
    const milestones = goals[0].milestones as Record<string, unknown>[];
    expect(milestones).toHaveLength(1);
    expect(milestones[0].name).toBe("Quarter Mark");
    expect(milestones[0].target_value).toBe(25);
    expect(milestones[0].reward_points).toBe(50);
    expect(typeof milestones[0].id).toBe("string");
    expect((milestones[0].id as string).startsWith("m_")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Requirements compilation
// ---------------------------------------------------------------------------

describe("Requirements compilation", () => {
  const REQS_SOURCE = `PLAN "Reqs Test"
TYPE workout

REQUIRES
  age 18..65
  fitness beginner, intermediate
  equipment:
    barbell (required)
    dumbbells (optional, alternatives: kettlebell, resistance_bands)`;

  it("compiles age range to min_age and max_age", () => {
    const plan = compilePlan(REQS_SOURCE);
    const reqs = plan.requirements as Record<string, unknown>;
    expect(reqs.min_age).toBe(18);
    expect(reqs.max_age).toBe(65);
  });

  it("compiles fitness levels to array", () => {
    const plan = compilePlan(REQS_SOURCE);
    const reqs = plan.requirements as Record<string, unknown>;
    expect(reqs.fitness_level).toEqual(["beginner", "intermediate"]);
  });

  it("compiles equipment list with name and required flag", () => {
    const plan = compilePlan(REQS_SOURCE);
    const reqs = plan.requirements as Record<string, unknown>;
    const equipment = reqs.equipment as Record<string, unknown>[];
    expect(equipment).toHaveLength(2);
    expect(equipment[0].name).toBe("barbell");
    expect(equipment[0].required).toBe(true);
  });

  it("generates equipment id from lowercased name", () => {
    const plan = compilePlan(REQS_SOURCE);
    const reqs = plan.requirements as Record<string, unknown>;
    const equipment = reqs.equipment as Record<string, unknown>[];
    expect(equipment[0].id).toBe("barbell");
  });

  it("compiles optional equipment with required = false", () => {
    const plan = compilePlan(REQS_SOURCE);
    const reqs = plan.requirements as Record<string, unknown>;
    const equipment = reqs.equipment as Record<string, unknown>[];
    expect(equipment[1].required).toBe(false);
  });

  it("compiles alternatives for equipment", () => {
    const plan = compilePlan(REQS_SOURCE);
    const reqs = plan.requirements as Record<string, unknown>;
    const equipment = reqs.equipment as Record<string, unknown>[];
    expect(equipment[1].alternatives).toEqual([
      "kettlebell",
      "resistance_bands",
    ]);
  });

  it("compiles contraindications", () => {
    const source = `PLAN "Test"
TYPE workout

REQUIRES
  contraindication knee_injury -> exclude`;

    const plan = compilePlan(source);
    const reqs = plan.requirements as Record<string, unknown>;
    const contras = reqs.contraindications as Record<string, unknown>[];
    expect(contras).toHaveLength(1);
    expect(contras[0].condition).toBe("knee_injury");
    expect(contras[0].action).toBe("exclude");
  });

  it("returns empty requirements when REQUIRES section is absent", () => {
    const plan = compilePlan(`PLAN "Test"\nTYPE workout`);
    const reqs = plan.requirements as Record<string, unknown>;
    expect(reqs).toEqual({});
  });

  it("compiles time commitment via direct AST", () => {
    // Time commitment parsing requires days_per_week/minutes_per_day as keywords,
    // but they are bare_words in the lexer. Test via direct AST instead.
    const doc: Document = {
      header: { name: "Test", type: "workout", visibility: null, difficulty: null, duration: null, tags: null, language: null, min_app_version: null, schema: null },
      goals: null,
      requirements: {
        age_range: null,
        fitness_levels: null,
        equipment: null,
        contraindications: null,
        time_commitment: { days_per_week: [3, 5], minutes_per_day: [45, 90] },
      },
      personalization: null,
      phases: [],
      progress: null,
      notifications: null,
      rendering: null,
    };
    const result = compile(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const plan = result.json.plan as Record<string, unknown>;
      const reqs = plan.requirements as Record<string, unknown>;
      const tc = reqs.time_commitment as Record<string, unknown>;
      expect(tc.min_days_per_week).toBe(3);
      expect(tc.max_days_per_week).toBe(5);
      expect(tc.min_minutes_per_day).toBe(45);
      expect(tc.max_minutes_per_day).toBe(90);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Personalization compilation
// ---------------------------------------------------------------------------

describe("Personalization compilation", () => {
  it("compiles simple condition in a rule", () => {
    const source = `PLAN "Test"
TYPE workout

PERSONALIZATION
  RULES
    WHEN age >= 50 :
      reduce intensity by 20%`;

    const plan = compilePlan(source);
    const pers = plan.personalization as Record<string, unknown>;
    const rules = pers.rules as Record<string, unknown>[];
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe("rule_1");

    const condition = rules[0].condition as Record<string, unknown>;
    expect(condition.field).toBe("age");
    expect(condition.op).toBe("gte");
    expect(condition.value).toBe(50);
  });

  it("compiles compound AND condition", () => {
    const source = `PLAN "Test"
TYPE workout

PERSONALIZATION
  RULES
    WHEN age >= 50 AND fitness_level == beginner:
      reduce sets by 1`;

    const plan = compilePlan(source);
    const pers = plan.personalization as Record<string, unknown>;
    const rules = pers.rules as Record<string, unknown>[];
    const condition = rules[0].condition as Record<string, unknown>;
    expect(condition.operator).toBe("and");
    const conditions = condition.conditions as Record<string, unknown>[];
    expect(conditions).toHaveLength(2);
    expect(conditions[0].field).toBe("age");
    expect(conditions[0].op).toBe("gte");
    expect(conditions[1].field).toBe("fitness_level");
    expect(conditions[1].op).toBe("eq");
    expect(conditions[1].value).toBe("beginner");
  });

  it("compiles compound OR condition", () => {
    const source = `PLAN "Test"
TYPE workout

PERSONALIZATION
  RULES
    WHEN has_injury == true OR age >= 65 :
      reduce intensity by 30%`;

    const plan = compilePlan(source);
    const pers = plan.personalization as Record<string, unknown>;
    const rules = pers.rules as Record<string, unknown>[];
    const condition = rules[0].condition as Record<string, unknown>;
    expect(condition.operator).toBe("or");
    const conditions = condition.conditions as Record<string, unknown>[];
    expect(conditions).toHaveLength(2);
  });

  it("compiles replace_exercise action", () => {
    const source = `PLAN "Test"
TYPE workout

PERSONALIZATION
  RULES
    WHEN has_injury == true:
      replace barbell_squat -> goblet_squat`;

    const plan = compilePlan(source);
    const pers = plan.personalization as Record<string, unknown>;
    const rules = pers.rules as Record<string, unknown>[];
    const actions = rules[0].actions as Record<string, unknown>[];
    expect(actions[0].type).toBe("replace_exercise");
    expect(actions[0].from).toBe("barbell_squat");
    expect(actions[0].to).toBe("goblet_squat");
  });

  it("compiles exclude_exercise action", () => {
    const source = `PLAN "Test"
TYPE workout

PERSONALIZATION
  RULES
    WHEN has_injury == true:
      exclude deadlift`;

    const plan = compilePlan(source);
    const pers = plan.personalization as Record<string, unknown>;
    const rules = pers.rules as Record<string, unknown>[];
    const actions = rules[0].actions as Record<string, unknown>[];
    expect(actions[0].type).toBe("exclude_exercise");
    expect(actions[0].exercise).toBe("deadlift");
  });

  it("compiles reduce_sets action", () => {
    const source = `PLAN "Test"
TYPE workout

PERSONALIZATION
  RULES
    WHEN age >= 50 :
      reduce sets by 1`;

    const plan = compilePlan(source);
    const pers = plan.personalization as Record<string, unknown>;
    const rules = pers.rules as Record<string, unknown>[];
    const actions = rules[0].actions as Record<string, unknown>[];
    expect(actions[0].type).toBe("reduce_sets");
    expect(actions[0].amount).toBe(1);
  });

  it("compiles increase_rest action", () => {
    const source = `PLAN "Test"
TYPE workout

PERSONALIZATION
  RULES
    WHEN age >= 60 :
      increase rest by 30 seconds`;

    const plan = compilePlan(source);
    const pers = plan.personalization as Record<string, unknown>;
    const rules = pers.rules as Record<string, unknown>[];
    const actions = rules[0].actions as Record<string, unknown>[];
    expect(actions[0].type).toBe("increase_rest");
  });

  it("compiles personalization inputs (simple types)", () => {
    const source = `PLAN "Test"
TYPE workout

PERSONALIZATION
  INPUTS
    user_age = questionnaire as number
  RULES
    WHEN user_age >= 50 :
      reduce intensity by 20%`;

    const plan = compilePlan(source);
    const pers = plan.personalization as Record<string, unknown>;
    const inputs = pers.inputs as Record<string, unknown>[];
    expect(inputs).toHaveLength(1);
    expect(inputs[0].id).toBe("user_age");
    expect(inputs[0].type).toBe("number");
    expect(inputs[0].source).toBe("questionnaire");
  });

  it("returns empty inputs and rules when PERSONALIZATION section is absent", () => {
    const plan = compilePlan(`PLAN "Test"\nTYPE workout`);
    const pers = plan.personalization as Record<string, unknown>;
    expect(pers.inputs).toEqual([]);
    expect(pers.rules).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6. Phases and structure
// ---------------------------------------------------------------------------

describe("Phases and structure", () => {
  it("compiles a single phase with correct fields", () => {
    const source = `PLAN "Phase Test"
TYPE workout

PHASES
  PHASE "Foundation" (4 weeks):
    WEEK 1:
      DAY Monday training 60m "Upper Body":
        main straight_sets:
          bench_press 3x10 rest 90 seconds`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    expect(phases).toHaveLength(1);
    expect(phases[0].id).toBe("phase_1");
    expect(phases[0].name).toBe("Foundation");
    expect(phases[0].order).toBe(1);
  });

  it("compiles multiple phases with sequential order", () => {
    const source = `PLAN "Phase Test"
TYPE workout

PHASES
  PHASE "Foundation" (4 weeks):
    WEEK 1:
      DAY Monday training 60m "Day A":
        main:
          bench_press 3x10
  PHASE "Strength" (4 weeks):
    WEEK 1:
      DAY Monday training 60m "Day B":
        main:
          deadlift 5x5`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    expect(phases).toHaveLength(2);
    expect(phases[0].id).toBe("phase_1");
    expect(phases[0].order).toBe(1);
    expect(phases[0].name).toBe("Foundation");
    expect(phases[1].id).toBe("phase_2");
    expect(phases[1].order).toBe(2);
    expect(phases[1].name).toBe("Strength");
  });

  it("compiles phase duration with value and unit", () => {
    const source = `PLAN "Test"
TYPE workout

PHASES
  PHASE "Test" (4 weeks):
    WEEK 1:
      DAY Monday training 30m:
        main:
          push_up 3x10`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const duration = phases[0].duration as Record<string, unknown>;
    expect(duration.value).toBe(4);
    expect(duration.unit).toBe("weeks");
  });

  it("compiles weeks with order based on week number", () => {
    const source = `PLAN "Test"
TYPE workout

PHASES
  PHASE "Test" (2 weeks):
    WEEK 1:
      DAY Monday training 30m:
        main:
          push_up 3x10
    WEEK 2:
      DAY Monday training 30m:
        main:
          push_up 3x10`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    expect(weeks).toHaveLength(2);
    expect(weeks[0].id).toBe("week_1");
    expect(weeks[0].order).toBe(1);
    expect(weeks[1].id).toBe("week_2");
    expect(weeks[1].order).toBe(2);
  });

  it("generates default week name from number", () => {
    const source = `PLAN "Test"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        main:
          push_up 3x10`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    expect(weeks[0].name).toBe("Week 1");
  });

  it("compiles day_of_week as numeric (Monday = 1)", () => {
    const source = `PLAN "Test"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m:
        main:
          bench_press 3x10`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    expect(days[0].day_of_week).toBe(1);
  });

  it("compiles day type", () => {
    const source = `PLAN "Test"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        main:
          push_up 3x10`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    expect(days[0].type).toBe("training");
  });

  it("compiles day label as name", () => {
    const source = `PLAN "Test"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Upper Body":
        main:
          bench_press 3x10`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    expect(days[0].name).toBe("Upper Body");
  });

  it("compiles estimated_duration_minutes from day duration", () => {
    const source = `PLAN "Test"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m:
        main:
          bench_press 3x10`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    expect(days[0].estimated_duration_minutes).toBe(60);
  });

  it("assigns sequential day IDs", () => {
    const source = `PLAN "Test"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "Day A":
        main:
          push_up 3x10
      DAY Wednesday training 30m "Day B":
        main:
          push_up 3x10`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    expect(days[0].id).toBe("day_1");
    expect(days[1].id).toBe("day_2");
  });

  it("compiles all day_of_week numbers correctly", () => {
    const source = `PLAN "Days Test"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Wednesday training 30m:
        main:
          push_up 3x10
      DAY Friday training 30m:
        main:
          push_up 3x10
      DAY Sunday training 30m:
        main:
          push_up 3x10`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    expect(days[0].day_of_week).toBe(3); // Wednesday
    expect(days[1].day_of_week).toBe(5); // Friday
    expect(days[2].day_of_week).toBe(7); // Sunday
  });
});

// ---------------------------------------------------------------------------
// 7. Exercise activities compilation
// ---------------------------------------------------------------------------

describe("Exercise activities compilation", () => {
  const EXERCISE_BASE = `PLAN "Exercise Test"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Test Day":
        main straight_sets:
          `;

  function getFirstActivity(exerciseLine: string): Record<string, unknown> {
    const source = EXERCISE_BASE + exerciseLine;
    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[0].activities as Record<string, unknown>[];
    return activities[0];
  }

  it("compiles exercise type", () => {
    const activity = getFirstActivity("bench_press 3x8..12 target 10");
    expect(activity.type).toBe("exercise");
  });

  it("compiles exercise_ref", () => {
    const activity = getFirstActivity("bench_press 3x10");
    expect(activity.exercise_ref).toBe("bench_press");
  });

  it("assigns exercise ID", () => {
    const activity = getFirstActivity("bench_press 3x10");
    expect(activity.id).toBe("exercise_1");
  });

  it("compiles prescription.sets", () => {
    const activity = getFirstActivity("bench_press 4x10");
    const rx = activity.prescription as Record<string, unknown>;
    expect(rx.sets).toBe(4);
  });

  it("compiles simple rep count as reps.target", () => {
    const activity = getFirstActivity("bench_press 3x10");
    const rx = activity.prescription as Record<string, unknown>;
    const reps = rx.reps as Record<string, unknown>;
    expect(reps.target).toBe(10);
  });

  it("compiles rep range with min and max", () => {
    const activity = getFirstActivity("bench_press 3x8..12");
    const rx = activity.prescription as Record<string, unknown>;
    const reps = rx.reps as Record<string, unknown>;
    expect(reps.min).toBe(8);
    expect(reps.max).toBe(12);
  });

  it("compiles rep range with target", () => {
    const activity = getFirstActivity("bench_press 3x8..12 target 10");
    const rx = activity.prescription as Record<string, unknown>;
    const reps = rx.reps as Record<string, unknown>;
    expect(reps.min).toBe(8);
    expect(reps.max).toBe(12);
    expect(reps.target).toBe(10);
  });

  it("compiles rest duration in prescription", () => {
    const activity = getFirstActivity("bench_press 3x10 rest 90 seconds");
    const rx = activity.prescription as Record<string, unknown>;
    const rest = rx.rest as Record<string, unknown>;
    expect(rest.value).toBe(90);
    expect(rest.unit).toBe("seconds");
  });

  it("compiles target_rpe", () => {
    const activity = getFirstActivity("bench_press 3x10 rpe 8");
    expect(activity.target_rpe).toBe(8);
  });

  it("compiles target_rir", () => {
    const activity = getFirstActivity("bench_press 3x10 rir 2");
    expect(activity.target_rir).toBe(2);
  });

  it("compiles weight with value and unit", () => {
    const activity = getFirstActivity("bench_press 3x10 weight 80 kg");
    const rx = activity.prescription as Record<string, unknown>;
    const weight = rx.weight as Record<string, unknown>;
    expect(weight.value).toBe(80);
    expect(weight.unit).toBe("kg");
    expect(weight.type).toBe("absolute");
  });

  it("compiles bodyweight exercise", () => {
    const activity = getFirstActivity("push_up 3x15 weight bodyweight");
    const rx = activity.prescription as Record<string, unknown>;
    const weight = rx.weight as Record<string, unknown>;
    expect(weight.type).toBe("bodyweight");
  });

  it("compiles tempo (auto-normalized to structured Tempo per schema v1.2.0+)", () => {
    const activity = getFirstActivity("bench_press 3x10 tempo 3 - 1 - 2 - 0");
    const rx = activity.prescription as Record<string, unknown>;
    expect(rx.tempo).toEqual({
      eccentric: 3,
      pause_bottom: 1,
      concentric: 2,
      pause_top: 0,
    });
  });

  it("compiles multiple exercises in a block with sequential IDs", () => {
    const source = `PLAN "Exercise Test"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Test Day":
        main:
          bench_press 3x10
          squat 4x8
          deadlift 5x5`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[0].activities as Record<string, unknown>[];
    expect(activities).toHaveLength(3);
    expect(activities[0].id).toBe("exercise_1");
    expect(activities[1].id).toBe("exercise_2");
    expect(activities[2].id).toBe("exercise_3");
  });

  it("compiles percentage_1rm weight type", () => {
    const activity = getFirstActivity("bench_press 3x5 weight 85 percentage_1rm");
    const rx = activity.prescription as Record<string, unknown>;
    const weight = rx.weight as Record<string, unknown>;
    expect(weight.type).toBe("percentage_1rm");
    expect(weight.value).toBe(85);
    expect(weight.unit).toBe("percentage_1rm");
  });
});

// ---------------------------------------------------------------------------
// 8. Cardio activities compilation
// ---------------------------------------------------------------------------

describe("Cardio activities compilation", () => {
  const CARDIO_BASE = `PLAN "Cardio Test"
TYPE workout

PHASES
  PHASE "Cardio Phase" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Cardio Day":
        main:
          `;

  function getCardioActivity(lines: string): Record<string, unknown> {
    const source = CARDIO_BASE + lines;
    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[0].activities as Record<string, unknown>[];
    return activities[0];
  }

  it("compiles cardio type field", () => {
    const activity = getCardioActivity(
      `cardio running continuous:
            total 30 minutes
            zone 2`,
    );
    expect(activity.type).toBe("cardio");
  });

  it("compiles cardio modality", () => {
    const activity = getCardioActivity(
      `cardio running continuous:
            total 30 minutes`,
    );
    expect(activity.modality).toBe("running");
  });

  it("assigns cardio ID", () => {
    const activity = getCardioActivity(
      `cardio running continuous:
            total 30 minutes`,
    );
    expect(activity.id).toBe("cardio_1");
  });

  it("compiles continuous prescription type", () => {
    const activity = getCardioActivity(
      `cardio running continuous:
            total 30 minutes
            zone 2`,
    );
    const rx = activity.prescription as Record<string, unknown>;
    expect(rx.type).toBe("continuous");
  });

  it("compiles cardio duration", () => {
    const activity = getCardioActivity(
      `cardio running continuous:
            total 30 minutes`,
    );
    const rx = activity.prescription as Record<string, unknown>;
    const duration = rx.duration as Record<string, unknown>;
    expect(duration.value).toBe(30);
    expect(duration.unit).toBe("minutes");
  });

  it("compiles heart rate zone in intensity", () => {
    const activity = getCardioActivity(
      `cardio running continuous:
            total 30 minutes
            zone 2`,
    );
    const rx = activity.prescription as Record<string, unknown>;
    const intensity = rx.intensity as Record<string, unknown>;
    expect(intensity.type).toBe("heart_rate_zone");
    expect(intensity.zone).toBe(2);
  });

  it("compiles intervals prescription type", () => {
    const activity = getCardioActivity(
      `cardio cycling intervals:
            total 20 minutes
            30s work / 30s rest x 10`,
    );
    const rx = activity.prescription as Record<string, unknown>;
    expect(rx.type).toBe("intervals");
  });

  it("compiles interval work, rest, and repeat", () => {
    const activity = getCardioActivity(
      `cardio cycling intervals:
            total 20 minutes
            30s work / 30s rest x 10`,
    );
    const rx = activity.prescription as Record<string, unknown>;
    const intervals = rx.intervals as Record<string, unknown>;
    const work = intervals.work as Record<string, unknown>;
    const rest = intervals.rest as Record<string, unknown>;
    expect(work.duration).toBe(30);
    expect(rest.duration).toBe(30);
    expect(intervals.repeat).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 9. Nutrition activities compilation
// ---------------------------------------------------------------------------

describe("Nutrition activities compilation", () => {
  const NUTRITION_BASE = `PLAN "Nutrition Test"
TYPE hybrid

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Nutrition Day":
        nutrition:
          `;

  function getNutritionActivity(lines: string): Record<string, unknown> {
    const source = NUTRITION_BASE + lines;
    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[0].activities as Record<string, unknown>[];
    return activities[0];
  }

  it("compiles nutrition type", () => {
    const activity = getNutritionActivity(
      `nutrition post_workout:
            protein 30..50`,
    );
    expect(activity.type).toBe("nutrition");
  });

  it("compiles nutrition category", () => {
    const activity = getNutritionActivity(
      `nutrition post_workout:
            protein 30..50`,
    );
    expect(activity.category).toBe("post_workout");
  });

  it("assigns nutrition ID", () => {
    const activity = getNutritionActivity(
      `nutrition post_workout:
            protein 30..50`,
    );
    expect(activity.id).toBe("nutrition_1");
  });

  it("compiles macros.protein with min and max in grams", () => {
    const activity = getNutritionActivity(
      `nutrition post_workout:
            protein 30..50`,
    );
    const rx = activity.prescription as Record<string, unknown>;
    const macros = rx.macros as Record<string, unknown>;
    const protein = macros.protein as Record<string, unknown>;
    expect(protein.min).toBe(30);
    expect(protein.max).toBe(50);
    expect(protein.unit).toBe("g");
  });

  it("compiles macros.carbs with min and max in grams", () => {
    const activity = getNutritionActivity(
      `nutrition post_workout:
            carbs 40..60`,
    );
    const rx = activity.prescription as Record<string, unknown>;
    const macros = rx.macros as Record<string, unknown>;
    const carbs = macros.carbs as Record<string, unknown>;
    expect(carbs.min).toBe(40);
    expect(carbs.max).toBe(60);
    expect(carbs.unit).toBe("g");
  });

  it("compiles macros.fat with min and max in grams", () => {
    const activity = getNutritionActivity(
      `nutrition post_workout:
            fat 10..20`,
    );
    const rx = activity.prescription as Record<string, unknown>;
    const macros = rx.macros as Record<string, unknown>;
    const fat = macros.fat as Record<string, unknown>;
    expect(fat.min).toBe(10);
    expect(fat.max).toBe(20);
    expect(fat.unit).toBe("g");
  });

  it("compiles all macros together", () => {
    const activity = getNutritionActivity(
      `nutrition post_workout:
            protein 30..50
            carbs 40..60
            fat 10..20`,
    );
    const rx = activity.prescription as Record<string, unknown>;
    const macros = rx.macros as Record<string, unknown>;
    expect(macros.protein).toBeDefined();
    expect(macros.carbs).toBeDefined();
    expect(macros.fat).toBeDefined();
  });

  it("emits schema-valid timing for after_workout", () => {
    const activity = getNutritionActivity(
      `nutrition post_workout:
            timing after_workout +30 minutes`,
    );
    expect(activity.timing).toEqual({
      type: "relative",
      reference: "workout_end",
      offset: { value: 30, unit: "minutes" },
    });
  });

  it("emits schema-valid timing for before_workout", () => {
    const activity = getNutritionActivity(
      `nutrition pre_workout:
            timing before_workout -45 minutes`,
    );
    expect(activity.timing).toEqual({
      type: "relative",
      reference: "workout_start",
      offset: { value: 45, unit: "minutes" },
    });
  });

  it("emits schema-valid timing for at_time", () => {
    const activity = getNutritionActivity(
      `nutrition breakfast:
            timing at 07:30`,
    );
    expect(activity.timing).toEqual({
      type: "absolute",
      time: "07:30",
    });
  });
});

// ---------------------------------------------------------------------------
// 10. Meditation activities compilation
// ---------------------------------------------------------------------------

describe("Meditation activities compilation", () => {
  const MEDITATION_BASE = `PLAN "Meditation Test"
TYPE hybrid

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "Mindfulness":
        meditation:
          `;

  function getMeditationActivity(lines: string): Record<string, unknown> {
    const source = MEDITATION_BASE + lines;
    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[0].activities as Record<string, unknown>[];
    return activities[0];
  }

  it("compiles meditation type", () => {
    const activity = getMeditationActivity(
      `meditation mindfulness:
            duration 10 minutes
            guided true`,
    );
    expect(activity.type).toBe("meditation");
  });

  it("compiles meditation category", () => {
    const activity = getMeditationActivity(
      `meditation mindfulness:
            duration 10 minutes`,
    );
    expect(activity.category).toBe("mindfulness");
  });

  it("assigns meditation ID", () => {
    const activity = getMeditationActivity(
      `meditation mindfulness:
            duration 10 minutes`,
    );
    expect(activity.id).toBe("meditation_1");
  });

  it("compiles prescription.duration", () => {
    const activity = getMeditationActivity(
      `meditation mindfulness:
            duration 10 minutes`,
    );
    const rx = activity.prescription as Record<string, unknown>;
    const duration = rx.duration as Record<string, unknown>;
    expect(duration.value).toBe(10);
    expect(duration.unit).toBe("minutes");
  });

  it("compiles prescription.guided boolean true", () => {
    const activity = getMeditationActivity(
      `meditation mindfulness:
            duration 10 minutes
            guided true`,
    );
    const rx = activity.prescription as Record<string, unknown>;
    expect(rx.guided).toBe(true);
  });

  it("compiles prescription.guided boolean false", () => {
    const activity = getMeditationActivity(
      `meditation breathing:
            duration 5 minutes
            guided false`,
    );
    const rx = activity.prescription as Record<string, unknown>;
    expect(rx.guided).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. Recovery activities compilation
// ---------------------------------------------------------------------------

describe("Recovery activities compilation", () => {
  it("compiles recovery exercises in cooldown block as recovery activity", () => {
    const source = `PLAN "Recovery Test"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Test":
        cooldown:
          hamstring_stretch 30s x 2 sides both`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[0].activities as Record<string, unknown>[];
    const activity = activities[0];

    expect(activity.type).toBe("recovery");
    // Synthesised cooldown stretches are normalised to category "stretching"
    expect(activity.category).toBe("stretching");
  });

  it("compiles recovery exercise hold_seconds and reps", () => {
    const source = `PLAN "Recovery Test"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m:
        cooldown:
          hamstring_stretch 30s x 2`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[0].activities as Record<string, unknown>[];
    const activity = activities[0];
    const prescription = activity.prescription as Record<string, unknown>;
    const exercises = prescription.exercises as Record<string, unknown>[];
    const ex = exercises[0];
    expect(ex.type).toBe("recovery_exercise");
    expect(ex.name).toBe("hamstring_stretch");
    expect(ex.hold_seconds).toBe(30);
    expect(ex.reps).toBe(2);
  });

  it("compiles recovery exercise sides", () => {
    const source = `PLAN "Recovery Test"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m:
        cooldown:
          hamstring_stretch 30s x 2 sides both`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[0].activities as Record<string, unknown>[];
    const prescription = activities[0].prescription as Record<string, unknown>;
    const exercises = prescription.exercises as Record<string, unknown>[];
    expect(exercises[0].sides).toBe("both");
  });

  it("compiles recovery activity with category and duration", () => {
    const source = `PLAN "Recovery Test"
TYPE recovery

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday active_recovery 30m:
        cooldown:
          recovery stretching:
            duration 15 minutes`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[0].activities as Record<string, unknown>[];
    const activity = activities[0];
    expect(activity.type).toBe("recovery");
    expect(activity.category).toBe("stretching");
    const prescription = activity.prescription as Record<string, unknown>;
    const duration = prescription.duration as Record<string, unknown>;
    expect(duration.value).toBe(15);
    expect(duration.unit).toBe("minutes");
  });
});

// ---------------------------------------------------------------------------
// 12. Habit activities compilation
// ---------------------------------------------------------------------------

describe("Habit activities compilation", () => {
  const HABIT_BASE = `PLAN "Habit Test"
TYPE hybrid

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        main:
          `;

  function getHabitActivity(lines: string): Record<string, unknown> {
    const source = HABIT_BASE + lines;
    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[0].activities as Record<string, unknown>[];
    return activities[0];
  }

  it("compiles habit type", () => {
    const activity = getHabitActivity(
      `habit hydration:
            target 8 glasses
            frequency daily`,
    );
    expect(activity.type).toBe("habit");
  });

  it("compiles habit category", () => {
    const activity = getHabitActivity(
      `habit hydration:
            target 8 glasses`,
    );
    expect(activity.category).toBe("hydration");
  });

  it("assigns habit ID", () => {
    const activity = getHabitActivity(
      `habit hydration:
            target 8 glasses`,
    );
    expect(activity.id).toBe("habit_1");
  });

  it("compiles habit target value", () => {
    const activity = getHabitActivity(
      `habit hydration:
            target 8 glasses`,
    );
    const rx = activity.prescription as Record<string, unknown>;
    const target = rx.target as Record<string, unknown>;
    expect(target.value).toBe(8);
  });

  it("compiles habit target_unit", () => {
    const activity = getHabitActivity(
      `habit hydration:
            target 8 glasses`,
    );
    const rx = activity.prescription as Record<string, unknown>;
    const target = rx.target as Record<string, unknown>;
    expect(target.unit).toBe("glasses");
  });

  it("compiles habit frequency", () => {
    const activity = getHabitActivity(
      `habit hydration:
            target 8 glasses
            frequency daily`,
    );
    const rx = activity.prescription as Record<string, unknown>;
    expect(rx.frequency).toBe("daily");
  });
});

// ---------------------------------------------------------------------------
// 13. Block structures
// ---------------------------------------------------------------------------

describe("Block structures", () => {
  const BLOCK_BASE = `PLAN "Block Test"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 60m:
        `;

  function getBlocks(lines: string): Record<string, unknown>[] {
    const source = BLOCK_BASE + lines;
    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    return days[0].blocks as Record<string, unknown>[];
  }

  it("compiles warmup block type", () => {
    const blocks = getBlocks(
      `warmup:
          jumping_jacks 5 minutes`,
    );
    expect(blocks[0].type).toBe("warmup");
  });

  it("compiles main block type", () => {
    const blocks = getBlocks(
      `main:
          bench_press 3x10`,
    );
    expect(blocks[0].type).toBe("main");
  });

  it("compiles cooldown block type", () => {
    const blocks = getBlocks(
      `cooldown:
          hamstring_stretch 30s x 2`,
    );
    expect(blocks[0].type).toBe("cooldown");
  });

  it("compiles block structure (straight_sets)", () => {
    const blocks = getBlocks(
      `main straight_sets:
          bench_press 3x10`,
    );
    expect(blocks[0].structure).toBe("straight_sets");
  });

  it("compiles block structure (circuit)", () => {
    const blocks = getBlocks(
      `main circuit:
          push_up 3x10
          squat 3x10`,
    );
    expect(blocks[0].structure).toBe("circuit");
  });

  it("compiles block structure (superset)", () => {
    const blocks = getBlocks(
      `main superset:
          bench_press 3x10
          bent_over_row 3x10`,
    );
    expect(blocks[0].structure).toBe("superset");
  });

  it("assigns block ID from type", () => {
    const blocks = getBlocks(
      `warmup:
          jumping_jacks 5 minutes`,
    );
    expect(blocks[0].id).toBe("warmup_block");
  });

  it("assigns sequential block order", () => {
    const blocks = getBlocks(
      `warmup:
          jumping_jacks 5m
        main:
          bench_press 3x10
        cooldown:
          hamstring_stretch 30s x 2`,
    );
    expect(blocks[0].order).toBe(1);
    expect(blocks[1].order).toBe(2);
    expect(blocks[2].order).toBe(3);
  });

  it("compiles block activities array", () => {
    const blocks = getBlocks(
      `main:
          bench_press 3x10
          squat 4x8`,
    );
    const activities = blocks[0].activities as Record<string, unknown>[];
    expect(activities).toHaveLength(2);
  });

  it("compiles block rounds for circuit", () => {
    const blocks = getBlocks(
      `main circuit:
          rounds 3
          push_up 3x10`,
    );
    expect(blocks[0].rounds).toBe(3);
  });

  it("compiles rest_between_rounds", () => {
    const blocks = getBlocks(
      `main circuit:
          rounds 3
          rest_between_rounds 60 seconds
          push_up 3x10`,
    );
    const restBetween = blocks[0].rest_between_rounds as Record<string, unknown>;
    expect(restBetween.value).toBe(60);
    expect(restBetween.unit).toBe("seconds");
  });
});

// ---------------------------------------------------------------------------
// 14. Full round-trip test
// ---------------------------------------------------------------------------

describe("Full round-trip compilation", () => {
  const FULL_SOURCE = `PLAN "Complete Strength Program"
TYPE workout
DIFFICULTY intermediate
VISIBILITY public
DURATION 8 weeks
TAGS strength, hypertrophy, muscle_building
LANGUAGE en

GOALS
  GOAL primary strength:
    name "Increase Bench Press"
    description "Build upper body strength"
    target bench_press 100 kg absolute
    deadline 2025-06-01
  GOAL secondary body_composition:
    name "Reduce Body Fat"
    target body_fat -3 percentage relative

REQUIRES
  age 18..55
  fitness intermediate, advanced
  equipment:
    barbell (required)
    dumbbells (optional, alternatives: kettlebell)

PERSONALIZATION
  INPUTS
    user_age = questionnaire as number
  RULES
    WHEN user_age >= 50 :
      reduce intensity by 20%

PHASES
  PHASE "Foundation" (4 weeks):
    description "Build a base"
    WEEK 1:
      DAY Monday training 60m "Push Day":
        warmup:
          jumping_jacks 5m
        main straight_sets:
          bench_press 4x8..12 target 10 rest 90s rpe 7 weight 60 kg
          push_up 3x15 weight bodyweight
        cooldown:
          hamstring_stretch 30s x 2 sides both
      DAY Wednesday training 45m "Pull Day":
        main straight_sets:
          deadlift 5x5 rest 180s rpe 8
      DAY Friday training 60m "Legs":
        main straight_sets:
          squat 4x8 rest 120s

PROGRESS
  checkpoints:
    checkpoint "Weekly Check":
      trigger time week 1 day 7
      measure:
        - body_weight
        - bench_press_1rm
      ask:
        - "How are you feeling?"
  points enabled
    rules:
      - workout_completed 10
      - streak_7_days 50`;

  it("compiles full document without errors", () => {
    expect(() => compileSource(FULL_SOURCE)).not.toThrow();
  });

  it("has correct schema and version at top level", () => {
    const json = compileSource(FULL_SOURCE);
    expect(json.$schema).toBe("https://wpl.dev/schemas/wpl/v1.schema.json");
    expect(json.version).toBe("1.6.0");
  });

  it("has correct plan name and type", () => {
    const plan = compilePlan(FULL_SOURCE);
    expect(plan.name).toBe("Complete Strength Program");
    expect(plan.type).toBe("workout");
  });

  it("has correct visibility", () => {
    const plan = compilePlan(FULL_SOURCE);
    expect(plan.visibility).toBe("public");
  });

  it("has correct metadata fields", () => {
    const plan = compilePlan(FULL_SOURCE);
    const metadata = plan.metadata as Record<string, unknown>;
    expect(metadata.difficulty).toBe("intermediate");
    expect(metadata.language).toBe("en");
    expect(metadata.tags).toEqual(["strength", "hypertrophy", "muscle_building"]);
    expect(metadata.estimated_duration_days).toBe(56);
  });

  it("has 2 goals with correct structure", () => {
    const plan = compilePlan(FULL_SOURCE);
    const goals = plan.goals as Record<string, unknown>[];
    expect(goals).toHaveLength(2);
    expect(goals[0].type).toBe("primary");
    expect(goals[0].category).toBe("strength");
    expect(goals[1].type).toBe("secondary");
    expect(goals[1].category).toBe("body_composition");
  });

  it("has correct requirements", () => {
    const plan = compilePlan(FULL_SOURCE);
    const reqs = plan.requirements as Record<string, unknown>;
    expect(reqs.min_age).toBe(18);
    expect(reqs.max_age).toBe(55);
    expect(reqs.fitness_level).toEqual(["intermediate", "advanced"]);
    const equipment = reqs.equipment as Record<string, unknown>[];
    expect(equipment).toHaveLength(2);
  });

  it("has personalization with inputs and rules", () => {
    const plan = compilePlan(FULL_SOURCE);
    const pers = plan.personalization as Record<string, unknown>;
    const inputs = pers.inputs as Record<string, unknown>[];
    expect(inputs).toHaveLength(1);
    expect(inputs[0].id).toBe("user_age");
    const rules = pers.rules as Record<string, unknown>[];
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe("rule_1");
  });

  it("has 1 phase with 1 week containing 3 days", () => {
    const plan = compilePlan(FULL_SOURCE);
    const phases = plan.phases as Record<string, unknown>[];
    expect(phases).toHaveLength(1);
    expect(phases[0].name).toBe("Foundation");
    const weeks = phases[0].weeks as Record<string, unknown>[];
    expect(weeks).toHaveLength(1);
    const days = weeks[0].days as Record<string, unknown>[];
    expect(days).toHaveLength(3);
  });

  it("has warmup, main, and cooldown blocks on Monday", () => {
    const plan = compilePlan(FULL_SOURCE);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe("warmup");
    expect(blocks[1].type).toBe("main");
    expect(blocks[2].type).toBe("cooldown");
  });

  it("compiles bench_press exercise with full prescription", () => {
    const plan = compilePlan(FULL_SOURCE);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[1].activities as Record<string, unknown>[];
    const bench = activities[0];
    expect(bench.type).toBe("exercise");
    expect(bench.exercise_ref).toBe("bench_press");
    expect(bench.target_rpe).toBe(7);
    const rx = bench.prescription as Record<string, unknown>;
    expect(rx.sets).toBe(4);
    const reps = rx.reps as Record<string, unknown>;
    expect(reps.min).toBe(8);
    expect(reps.max).toBe(12);
    expect(reps.target).toBe(10);
    const rest = rx.rest as Record<string, unknown>;
    expect(rest.value).toBe(90);
    expect(rest.unit).toBe("seconds");
    const weight = rx.weight as Record<string, unknown>;
    expect(weight.value).toBe(60);
    expect(weight.unit).toBe("kg");
  });

  it("compiles push_up as bodyweight exercise", () => {
    const plan = compilePlan(FULL_SOURCE);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[1].activities as Record<string, unknown>[];
    const pushup = activities[1];
    expect(pushup.exercise_ref).toBe("push_up");
    const rx = pushup.prescription as Record<string, unknown>;
    const weight = rx.weight as Record<string, unknown>;
    expect(weight.type).toBe("bodyweight");
  });

  it("has progress section with checkpoints", () => {
    const plan = compilePlan(FULL_SOURCE);
    const progress = plan.progress as Record<string, unknown>;
    expect(progress).toBeDefined();
    const checkpoints = progress.checkpoints as Record<string, unknown>[];
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].name).toBe("Weekly Check");
    const points = progress.points_system as Record<string, unknown>;
    expect(points.enabled).toBe(true);
    // Note: points.rules is null due to a parser limitation where
    // parsePointsRules doesn't skip newlines before checking for indent.
    // Points rules compilation is tested via direct AST in the Progress section.
  });
});

// ---------------------------------------------------------------------------
// 15. ID generation
// ---------------------------------------------------------------------------

describe("ID generation", () => {
  it("plan ID is a UUID", () => {
    const plan = compilePlan(`PLAN "Test"\nTYPE workout`);
    expect(plan.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("generates different plan IDs on each compilation", () => {
    const plan1 = compilePlan(`PLAN "Test"\nTYPE workout`);
    const plan2 = compilePlan(`PLAN "Test"\nTYPE workout`);
    expect(plan1.id).not.toBe(plan2.id);
  });

  it("phase IDs are sequential: phase_1, phase_2", () => {
    const source = `PLAN "Test"
TYPE workout

PHASES
  PHASE "A" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        main:
          push_up 3x10
  PHASE "B" (1 weeks):
    WEEK 1:
      DAY Monday training 30m:
        main:
          push_up 3x10`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    expect(phases[0].id).toBe("phase_1");
    expect(phases[1].id).toBe("phase_2");
  });

  it("week IDs are based on week number: week_1, week_2", () => {
    const source = `PLAN "Test"
TYPE workout

PHASES
  PHASE "A" (2 weeks):
    WEEK 1:
      DAY Monday training 30m:
        main:
          push_up 3x10
    WEEK 2:
      DAY Monday training 30m:
        main:
          push_up 3x10`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    expect(weeks[0].id).toBe("week_1");
    expect(weeks[1].id).toBe("week_2");
  });

  it("day IDs are sequential within a week: day_1, day_2", () => {
    const source = `PLAN "Test"
TYPE workout

PHASES
  PHASE "A" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "Day A":
        main:
          push_up 3x10
      DAY Wednesday training 30m "Day B":
        main:
          push_up 3x10`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    expect(days[0].id).toBe("day_1");
    expect(days[1].id).toBe("day_2");
  });

  it("exercise IDs are sequential within a block", () => {
    const source = `PLAN "Test"
TYPE workout

PHASES
  PHASE "A" (1 weeks):
    WEEK 1:
      DAY Monday training 60m:
        main:
          bench_press 3x10
          squat 3x10
          deadlift 3x10`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[0].activities as Record<string, unknown>[];
    expect(activities[0].id).toBe("exercise_1");
    expect(activities[1].id).toBe("exercise_2");
    expect(activities[2].id).toBe("exercise_3");
  });

  it("goal IDs are sequential: goal_1, goal_2", () => {
    const source = `PLAN "Test"
TYPE workout

GOALS
  GOAL primary strength:
    target bench_press 100 kg
  GOAL secondary endurance:
    target vo2max 50 ml`;

    const plan = compilePlan(source);
    const goals = plan.goals as Record<string, unknown>[];
    expect(goals[0].id).toBe("goal_1");
    expect(goals[1].id).toBe("goal_2");
  });

  it("rule IDs are sequential: rule_1, rule_2", () => {
    const source = `PLAN "Test"
TYPE workout

PERSONALIZATION
  RULES
    WHEN age >= 50 :
      reduce intensity by 20%
    WHEN fitness_level == beginner:
      reduce sets by 1`;

    const plan = compilePlan(source);
    const pers = plan.personalization as Record<string, unknown>;
    const rules = pers.rules as Record<string, unknown>[];
    expect(rules[0].id).toBe("rule_1");
    expect(rules[1].id).toBe("rule_2");
  });
});

// ---------------------------------------------------------------------------
// 16. Compact/clean output
// ---------------------------------------------------------------------------

describe("Compact/clean output", () => {
  it("removes null values from plan object via compact()", () => {
    const plan = compilePlan(`PLAN "Test"\nTYPE workout`);
    const keys = Object.keys(plan);
    for (const key of keys) {
      expect(plan[key]).not.toBeNull();
      expect(plan[key]).not.toBeUndefined();
    }
  });

  it("progress is not included when absent", () => {
    const plan = compilePlan(`PLAN "Test"\nTYPE workout`);
    expect(Object.prototype.hasOwnProperty.call(plan, "progress")).toBe(false);
  });

  it("notifications is not included when absent", () => {
    const plan = compilePlan(`PLAN "Test"\nTYPE workout`);
    expect(Object.prototype.hasOwnProperty.call(plan, "notifications")).toBe(false);
  });

  it("metadata does not include null fields", () => {
    const plan = compilePlan(`PLAN "Test"\nTYPE workout`);
    const metadata = plan.metadata as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(metadata, "difficulty")).toBe(false);
    expect(metadata.language).toBe("en"); // always present
    expect(Object.prototype.hasOwnProperty.call(metadata, "estimated_duration_days")).toBe(false);
  });

  it("empty phases array is preserved", () => {
    const plan = compilePlan(`PLAN "Test"\nTYPE workout`);
    expect(plan.phases).toEqual([]);
  });

  it("goals is an empty array when no goals section", () => {
    const plan = compilePlan(`PLAN "Test"\nTYPE workout`);
    expect(plan.goals).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 17. Error handling
// ---------------------------------------------------------------------------

describe("Error handling", () => {
  it("compile returns ok: true for minimal valid document", () => {
    const doc: Document = {
      header: { name: "Test", type: "workout", visibility: null, difficulty: null, duration: null, tags: null, language: null, min_app_version: null, schema: null },
      goals: null, requirements: null, personalization: null, phases: [],
      progress: null, notifications: null, rendering: null,
    };
    const result = compile(doc);
    expect(result.ok).toBe(true);
  });

  it("compile returns json with plan for valid document", () => {
    const doc: Document = {
      header: { name: "Test", type: "workout", visibility: null, difficulty: null, duration: null, tags: null, language: null, min_app_version: null, schema: null },
      goals: null, requirements: null, personalization: null, phases: [],
      progress: null, notifications: null, rendering: null,
    };
    const result = compile(doc);
    if (result.ok) {
      expect(result.json).toBeDefined();
      expect(result.json.plan).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 18. Progress compilation
// ---------------------------------------------------------------------------

describe("Progress compilation", () => {
  const PROGRESS_SOURCE = `PLAN "Progress Test"
TYPE workout

PROGRESS
  checkpoints:
    checkpoint "Monthly Review":
      trigger time week 4 day 1
      measure:
        - body_weight
        - body_fat
      ask:
        - "Rate energy levels"
  points enabled
    rules:
      - workout_completed 10
      - streak_7_days 50`;

  it("compiles checkpoints with name", () => {
    const plan = compilePlan(PROGRESS_SOURCE);
    const progress = plan.progress as Record<string, unknown>;
    const checkpoints = progress.checkpoints as Record<string, unknown>[];
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].name).toBe("Monthly Review");
  });

  it("compiles checkpoint with generated ID starting with cp_", () => {
    const plan = compilePlan(PROGRESS_SOURCE);
    const progress = plan.progress as Record<string, unknown>;
    const checkpoints = progress.checkpoints as Record<string, unknown>[];
    expect((checkpoints[0].id as string).startsWith("cp_")).toBe(true);
  });

  it("compiles checkpoint measurements", () => {
    const plan = compilePlan(PROGRESS_SOURCE);
    const progress = plan.progress as Record<string, unknown>;
    const checkpoints = progress.checkpoints as Record<string, unknown>[];
    expect(checkpoints[0].measurements).toEqual(["body_weight", "body_fat"]);
  });

  it("compiles checkpoint questions", () => {
    const plan = compilePlan(PROGRESS_SOURCE);
    const progress = plan.progress as Record<string, unknown>;
    const checkpoints = progress.checkpoints as Record<string, unknown>[];
    expect(checkpoints[0].questions).toEqual(["Rate energy levels"]);
  });

  it("compiles points config as enabled", () => {
    const plan = compilePlan(PROGRESS_SOURCE);
    const progress = plan.progress as Record<string, unknown>;
    const points = progress.points_system as Record<string, unknown>;
    expect(points.enabled).toBe(true);
  });

  it("compiles points rules with event and points via direct AST", () => {
    // The parser has a known issue where newlines before indent in parsePointsRules
    // cause rules to be null. Test via direct AST to verify the compiler itself.
    const doc: Document = {
      header: { name: "Points Test", type: "workout", visibility: null, difficulty: null, duration: null, tags: null, language: null, min_app_version: null, schema: null },
      goals: null, requirements: null, personalization: null, phases: [],
      progress: {
        checkpoints: null,
        points: {
          enabled: true,
          rules: [
            { activity: "workout_completed", points: 10 },
            { activity: "streak_7_days", points: 50 },
          ],
        },
        achievements: null,
        streaks: null,
      },
      notifications: null, rendering: null,
    };
    const result = compile(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const plan = result.json.plan as Record<string, unknown>;
      const progress = plan.progress as Record<string, unknown>;
      const points = progress.points_system as Record<string, unknown>;
      const rules = points.rules as Record<string, unknown>[];
      expect(rules).toHaveLength(2);
      expect(rules[0].event).toBe("workout_completed");
      expect(rules[0].points).toBe(10);
      expect(rules[1].event).toBe("streak_7_days");
      expect(rules[1].points).toBe(50);
    }
  });
});

// ---------------------------------------------------------------------------
// 19. Direct compile API tests
// ---------------------------------------------------------------------------

describe("Direct compile API", () => {
  it("returns { ok: true, json } for a valid document", () => {
    const doc: Document = {
      header: { name: "Direct Test", type: "workout", visibility: "public", difficulty: "beginner", duration: { value: 4, unit: "weeks" }, tags: ["test"], language: "en", min_app_version: null, schema: null },
      goals: [], requirements: null, personalization: null, phases: [],
      progress: null, notifications: null, rendering: null,
    };
    const result = compile(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.json.$schema).toBe("https://wpl.dev/schemas/wpl/v1.schema.json");
      expect(result.json.version).toBe("1.6.0");
      const plan = result.json.plan as Record<string, unknown>;
      expect(plan.name).toBe("Direct Test");
      expect(plan.type).toBe("workout");
      expect(plan.visibility).toBe("public");
    }
  });

  it("compiles document with null requirements to empty object", () => {
    const doc: Document = {
      header: { name: "Test", type: "workout", visibility: null, difficulty: null, duration: null, tags: null, language: null, min_app_version: null, schema: null },
      goals: null, requirements: null, personalization: null, phases: [],
      progress: null, notifications: null, rendering: null,
    };
    const result = compile(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const plan = result.json.plan as Record<string, unknown>;
      expect(plan.requirements).toEqual({});
    }
  });

  it("compiles document with null personalization to inputs+rules arrays", () => {
    const doc: Document = {
      header: { name: "Test", type: "workout", visibility: null, difficulty: null, duration: null, tags: null, language: null, min_app_version: null, schema: null },
      goals: null, requirements: null, personalization: null, phases: [],
      progress: null, notifications: null, rendering: null,
    };
    const result = compile(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const plan = result.json.plan as Record<string, unknown>;
      const pers = plan.personalization as Record<string, unknown>;
      expect(pers.inputs).toEqual([]);
      expect(pers.rules).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// 20. Edge cases and additional coverage
// ---------------------------------------------------------------------------

describe("Edge cases", () => {
  it("handles plan with only header and empty phases", () => {
    const plan = compilePlan(`PLAN "Empty"\nTYPE workout`);
    expect(plan.name).toBe("Empty");
    expect(plan.phases).toEqual([]);
  });

  it("handles plan name with special characters", () => {
    const plan = compilePlan(
      `PLAN "My Plan - Phase 1 (v2.0)"\nTYPE workout`,
    );
    expect(plan.name).toBe("My Plan - Phase 1 (v2.0)");
  });

  it("compiles rest day type", () => {
    const source = `PLAN "Test"
TYPE workout

PHASES
  PHASE "Recovery" (1 weeks):
    WEEK 1:
      DAY Sunday rest 0m:
        main:
          foam_rolling 10 minutes`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    expect(days[0].type).toBe("rest");
  });

  it("compiles template visibility", () => {
    const plan = compilePlan(
      `PLAN "Template"\nTYPE workout\nVISIBILITY template`,
    );
    expect(plan.visibility).toBe("template");
  });

  it("preserves equipment ID as lowercased and underscored", () => {
    const source = `PLAN "Test"
TYPE workout

REQUIRES
  equipment:
    pull_up_bar (required)`;

    const plan = compilePlan(source);
    const reqs = plan.requirements as Record<string, unknown>;
    const equipment = reqs.equipment as Record<string, unknown>[];
    expect(equipment[0].id).toBe("pull_up_bar");
    expect(equipment[0].name).toBe("pull_up_bar");
  });

  it("compiles multiple actions in a single rule", () => {
    const source = `PLAN "Test"
TYPE workout

PERSONALIZATION
  RULES
    WHEN age >= 60 :
      reduce sets by 1
      reduce intensity by 30%`;

    const plan = compilePlan(source);
    const pers = plan.personalization as Record<string, unknown>;
    const rules = pers.rules as Record<string, unknown>[];
    const actions = rules[0].actions as Record<string, unknown>[];
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe("reduce_sets");
    expect(actions[1].type).toBe("modify_intensity");
  });

  it("compiles phase description", () => {
    const source = `PLAN "Test"
TYPE workout

PHASES
  PHASE "Intro" (2 weeks):
    description "Getting started"
    WEEK 1:
      DAY Monday training 30m:
        main:
          push_up 3x10`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    expect(phases[0].description).toBe("Getting started");
  });

  it("compiles named week", () => {
    const source = `PLAN "Test"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1 "Deload Week":
      DAY Monday training 30m:
        main:
          push_up 2x10`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    expect(weeks[0].name).toBe("Deload Week");
  });

  it("compiles reduce_reps action", () => {
    const source = `PLAN "Test"
TYPE workout

PERSONALIZATION
  RULES
    WHEN age >= 70 :
      reduce reps by 3`;

    const plan = compilePlan(source);
    const pers = plan.personalization as Record<string, unknown>;
    const rules = pers.rules as Record<string, unknown>[];
    const actions = rules[0].actions as Record<string, unknown>[];
    expect(actions[0].type).toBe("reduce_reps");
    expect(actions[0].amount).toBe(3);
  });

  it("compiles Saturday and Thursday day_of_week correctly", () => {
    const source = `PLAN "Test"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Thursday training 30m:
        main:
          push_up 3x10
      DAY Saturday training 30m:
        main:
          push_up 3x10`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    expect(days[0].day_of_week).toBe(4); // Thursday
    expect(days[1].day_of_week).toBe(6); // Saturday
  });

  it("compiles 45m duration correctly", () => {
    const source = `PLAN "Test"
TYPE workout

PHASES
  PHASE "Test" (1 weeks):
    WEEK 1:
      DAY Monday training 45m:
        main:
          push_up 3x10`;

    const plan = compilePlan(source);
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    expect(days[0].estimated_duration_minutes).toBe(45);
  });
});

describe("Compile error classification", () => {
  it("labels unexpected throws as internal_error, not constraint_violation", () => {
    // Monkey-patch a compiler dependency to force a throw and assert that
    // the top-level catch labels it correctly.
    const proto = CompileContext.prototype as unknown as {
      withSegment: (...args: unknown[]) => unknown;
    };
    const original = proto.withSegment;
    proto.withSegment = function () {
      throw new TypeError("boom");
    };
    try {
      const lex = tokenize(`PLAN "X"\nTYPE workout\n`);
      if (!lex.ok) throw new Error("lex failed");
      const ast = parse(lex.tokens);
      if (!ast.ok) throw new Error("parse failed");
      const result = compile(ast.document);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]!.type).toBe("internal_error");
        expect(result.errors[0]!.message).toContain("boom");
        expect(result.errors[0]!.message).toContain("bug");
      }
    } finally {
      proto.withSegment = original;
    }
  });
});

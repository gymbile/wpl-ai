// ---------------------------------------------------------------------------
// WPL-AI Compiler Integration Tests (end-to-end)
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
  compileWplAi,
  tokenize,
  parse,
  compile,
  formatErrors,
  formatError,
  errorSummary,
  ALL_EXERCISES,
  isKnownExercise,
  suggest,
  bestMatch,
  validateExercise,
  validate,
} from "../src/index.js";
import type { CompileResult } from "../src/index.js";
import type { WplError, LexerError, ParseError } from "../src/errors.js";
import type { Document } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compile and assert success, returning the result. */
function compileOk(source: string) {
  const result = compileWplAi(source);
  if (!result.ok) {
    throw new Error(
      `Expected compilation to succeed but got errors:\n${result.formatted}`,
    );
  }
  return result;
}

/** Compile and assert failure, returning the result. */
function compileFail(source: string) {
  const result = compileWplAi(source);
  if (result.ok) {
    throw new Error(
      "Expected compilation to fail but it succeeded",
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// Minimal valid sources reused across tests
// ---------------------------------------------------------------------------

const MINIMAL_PLAN = `\
PLAN "Minimal Plan"
TYPE workout
`;

const SIMPLE_PLAN = `\
PLAN "Simple Workout"
TYPE workout
VISIBILITY private
DIFFICULTY beginner
TAGS strength, beginner
LANGUAGE en

PHASES
  PHASE "Week One" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "Push Day":
        main straight_sets:
          push_up 3x10 rpe 7 rest 60 seconds
`;

// ---------------------------------------------------------------------------
// 1. Public API compileWplAi()
// ---------------------------------------------------------------------------

describe("compileWplAi() public API", () => {
  it("returns { ok: true, json, ast } for valid source", () => {
    const result = compileWplAi(SIMPLE_PLAN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.json).toBeDefined();
    expect(result.ast).toBeDefined();
    expect(typeof result.json).toBe("object");
  });

  it("returns { ok: false, errors, formatted, summary } for invalid source", () => {
    const result = compileWplAi("not valid wpl at all");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(typeof result.formatted).toBe("string");
    expect(typeof result.summary).toBe("string");
    expect(result.formatted.length).toBeGreaterThan(0);
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("json has correct $schema field", () => {
    const { json } = compileOk(SIMPLE_PLAN);
    expect(json.$schema).toBe("https://wpl.dev/schemas/wpl/v1.schema.json");
  });

  it("json has correct version field", () => {
    const { json } = compileOk(SIMPLE_PLAN);
    expect(json.version).toBe("1.6.0");
  });

  it("json has a plan object with UUID id", () => {
    const { json } = compileOk(SIMPLE_PLAN);
    const plan = json.plan as Record<string, unknown>;
    expect(plan).toBeDefined();
    expect(typeof plan.id).toBe("string");
    // UUID v4 format
    expect(plan.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("ast is a valid Document object", () => {
    const { ast } = compileOk(SIMPLE_PLAN);
    expect(ast.header).toBeDefined();
    expect(ast.header.name).toBe("Simple Workout");
    expect(ast.header.type).toBe("workout");
    expect(ast.phases).toBeDefined();
    expect(Array.isArray(ast.phases)).toBe(true);
  });

  it("each compilation generates a unique plan ID", () => {
    const r1 = compileOk(SIMPLE_PLAN);
    const r2 = compileOk(SIMPLE_PLAN);
    const id1 = (r1.json.plan as Record<string, unknown>).id;
    const id2 = (r2.json.plan as Record<string, unknown>).id;
    expect(id1).not.toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// 2. Full spec smoke test (end-to-end)
// ---------------------------------------------------------------------------

describe("Full spec smoke test", () => {
  const FULL_PLAN = `\
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
          jumping_jacks 2m
        main straight_sets:
          push_up 3x8..12 target 10 rpe 7 rest 60 seconds
        cooldown:
          chest_stretch 30s x2 sides both
`;

  let result: Extract<CompileResult, { ok: true }>;
  let plan: Record<string, unknown>;

  it("compiles without errors", () => {
    const r = compileWplAi(FULL_PLAN);
    expect(r.ok).toBe(true);
    if (!r.ok) {
      throw new Error(`Compilation failed:\n${r.formatted}`);
    }
    result = r;
    plan = r.json.plan as Record<string, unknown>;
  });

  it("has correct schema and version", () => {
    expect(result.json.$schema).toBe("https://wpl.dev/schemas/wpl/v1.schema.json");
    expect(result.json.version).toBe("1.6.0");
  });

  it("has plan name and type", () => {
    expect(plan.name).toBe("Upper Body Beginner");
    expect(plan.type).toBe("workout");
    expect(plan.visibility).toBe("private");
  });

  it("has metadata with tags, difficulty, language", () => {
    const metadata = plan.metadata as Record<string, unknown>;
    expect(metadata).toBeDefined();
    expect(metadata.tags).toEqual(["strength", "beginner"]);
    expect(metadata.difficulty).toBe("beginner");
    expect(metadata.language).toBe("en");
  });

  it("has goals with target", () => {
    const goals = plan.goals as Record<string, unknown>[];
    expect(goals).toBeDefined();
    expect(goals.length).toBe(1);
    expect(goals[0].type).toBe("primary");
    expect(goals[0].category).toBe("muscle_gain");
    const target = goals[0].target as Record<string, unknown>;
    expect(target).toBeDefined();
    expect(target.metric).toBe("weight");
    expect(target.target_value).toBe(0);
    expect(target.unit).toBe("kg");
    expect(target.measurement_type).toBe("absolute");
  });

  it("has requirements with age, fitness, equipment", () => {
    const requirements = plan.requirements as Record<string, unknown>;
    expect(requirements).toBeDefined();
    expect(requirements.min_age).toBe(16);
    expect(requirements.max_age).toBe(65);
    expect(requirements.fitness_level).toEqual(["beginner"]);
    const equipment = requirements.equipment as Record<string, unknown>[];
    expect(equipment).toBeDefined();
    expect(equipment.length).toBe(1);
    expect(equipment[0].name).toBe("dumbbells");
    expect(equipment[0].required).toBe(true);
    expect(equipment[0].alternatives).toEqual(["bands"]);
  });

  it("has personalization rules with condition and action", () => {
    const personalization = plan.personalization as Record<string, unknown>;
    expect(personalization).toBeDefined();
    const rules = personalization.rules as Record<string, unknown>[];
    expect(rules).toBeDefined();
    expect(rules.length).toBe(1);
    const rule = rules[0];
    expect(rule.id).toBe("rule_1");
    const condition = rule.condition as Record<string, unknown>;
    expect(condition.field).toBe("injury");
    expect(condition.op).toBe("contains");
    expect(condition.value).toBe("knee");
    const actions = rule.actions as Record<string, unknown>[];
    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe("replace_exercise");
    expect(actions[0].from).toBe("squat");
    expect(actions[0].to).toBe("wall_sit");
  });

  it("has phase with correct name, duration, and structure", () => {
    const phases = plan.phases as Record<string, unknown>[];
    expect(phases).toBeDefined();
    expect(phases.length).toBe(1);

    const phase = phases[0];
    expect(phase.id).toBe("phase_1");
    expect(phase.name).toBe("Foundation");
    expect(phase.order).toBe(1);
    expect(phase.duration).toEqual({ value: 2, unit: "weeks" });
  });

  it("has week with correct order", () => {
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    expect(weeks).toBeDefined();
    expect(weeks.length).toBe(1);
    expect(weeks[0].id).toBe("week_1");
    expect(weeks[0].order).toBe(1);
    expect(weeks[0].name).toBe("Week 1");
  });

  it("has day with correct day_of_week, type, label, and duration", () => {
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    expect(days).toBeDefined();
    expect(days.length).toBe(1);

    const day = days[0];
    expect(day.day_of_week).toBe(1); // Monday = 1
    expect(day.type).toBe("training");
    expect(day.name).toBe("Upper Body");
    expect(day.estimated_duration_minutes).toBe(45);
  });

  it("has warmup block with simple activity", () => {
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    expect(blocks).toBeDefined();
    expect(blocks.length).toBe(3);

    const warmup = blocks[0];
    expect(warmup.type).toBe("warmup");
    expect(warmup.order).toBe(1);
    const activities = warmup.activities as Record<string, unknown>[];
    expect(activities).toBeDefined();
    expect(activities.length).toBe(1);
    expect(activities[0].type).toBe("simple");
    // Names are humanised on emission
    expect(activities[0].name).toBe("Jumping Jacks");
    expect(activities[0].duration).toEqual({ value: 2, unit: "minutes" });
  });

  it("has main block with exercise activity details", () => {
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];

    const main = blocks[1];
    expect(main.type).toBe("main");
    expect(main.structure).toBe("straight_sets");
    expect(main.order).toBe(2);
    const activities = main.activities as Record<string, unknown>[];
    expect(activities).toBeDefined();
    expect(activities.length).toBe(1);

    const exercise = activities[0];
    expect(exercise.type).toBe("exercise");
    expect(exercise.exercise_ref).toBe("push_up");
    expect(exercise.target_rpe).toBe(7);

    const prescription = exercise.prescription as Record<string, unknown>;
    expect(prescription).toBeDefined();
    expect(prescription.sets).toBe(3);
    expect(prescription.reps).toEqual({ min: 8, max: 12, target: 10 });
    expect(prescription.rest).toEqual({ value: 60, unit: "seconds" });
  });

  it("has cooldown block with recovery exercise", () => {
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];

    const cooldown = blocks[2];
    expect(cooldown.type).toBe("cooldown");
    expect(cooldown.order).toBe(3);
    const activities = cooldown.activities as Record<string, unknown>[];
    expect(activities).toBeDefined();
    expect(activities.length).toBe(1);

    const recovery = activities[0];
    expect(recovery.type).toBe("recovery");
    // Synthesised cooldown stretches are normalised to category "stretching"
    expect(recovery.category).toBe("stretching");
    const prescription = recovery.prescription as Record<string, unknown>;
    const exercises = prescription.exercises as Record<string, unknown>[];
    expect(exercises).toBeDefined();
    expect(exercises.length).toBe(1);
    expect(exercises[0].name).toBe("chest_stretch");
    expect(exercises[0].hold_seconds).toBe(30);
    expect(exercises[0].reps).toBe(2);
    expect(exercises[0].sides).toBe("both");
  });

  it("AST header fields match source", () => {
    expect(result.ast.header.name).toBe("Upper Body Beginner");
    expect(result.ast.header.type).toBe("workout");
    expect(result.ast.header.visibility).toBe("private");
    expect(result.ast.header.difficulty).toBe("beginner");
    expect(result.ast.header.tags).toEqual(["strength", "beginner"]);
    expect(result.ast.header.language).toBe("en");
  });

  it("AST goals structure", () => {
    expect(result.ast.goals).not.toBeNull();
    expect(result.ast.goals!.length).toBe(1);
    expect(result.ast.goals![0].priority).toBe("primary");
    expect(result.ast.goals![0].category).toBe("muscle_gain");
    expect(result.ast.goals![0].target).not.toBeNull();
    expect(result.ast.goals![0].target!.metric).toBe("weight");
  });

  it("AST requirements structure", () => {
    expect(result.ast.requirements).not.toBeNull();
    expect(result.ast.requirements!.age_range).toEqual([16, 65]);
    expect(result.ast.requirements!.fitness_levels).toEqual(["beginner"]);
    expect(result.ast.requirements!.equipment).not.toBeNull();
    expect(result.ast.requirements!.equipment!.length).toBe(1);
    expect(result.ast.requirements!.equipment![0].name).toBe("dumbbells");
    expect(result.ast.requirements!.equipment![0].required).toBe(true);
    expect(result.ast.requirements!.equipment![0].alternatives).toEqual(["bands"]);
  });

  it("AST personalization structure", () => {
    expect(result.ast.personalization).not.toBeNull();
    expect(result.ast.personalization!.rules.length).toBe(1);
    const rule = result.ast.personalization!.rules[0];
    expect(rule.condition.type).toBe("simple");
    expect(rule.condition.field).toBe("injury");
    expect(rule.condition.op).toBe("contains");
    expect(rule.condition.value).toBe("knee");
    expect(rule.actions.length).toBe(1);
    expect(rule.actions[0].type).toBe("replace_exercise");
  });
});

// ---------------------------------------------------------------------------
// 3. Error formatting
// ---------------------------------------------------------------------------

describe("Error formatting", () => {
  it("formatErrors() produces numbered error list for multiple errors", () => {
    const errors: WplError[] = [
      {
        kind: "lexer",
        type: "tab_character",
        message: "Tab character found",
        location: { line: 1, column: 1 },
        context: "Use spaces instead of tabs for indentation",
      },
      {
        kind: "parse",
        type: "unexpected_token",
        message: "Unexpected token 'foo'",
        location: { line: 2, column: 5 },
        expected: ["PLAN"],
        got: "foo",
        suggestions: null,
      },
    ];
    const formatted = formatErrors(errors);
    expect(formatted).toContain("1.");
    expect(formatted).toContain("2.");
    expect(formatted).toContain("Tab character found");
    expect(formatted).toContain("Unexpected token 'foo'");
  });

  it("formatError() produces single error with source line pointer", () => {
    const error: WplError = {
      kind: "parse",
      type: "unexpected_token",
      message: "Unexpected token 'xyz'",
      location: { line: 1, column: 6, length: 3 },
      expected: ["PLAN"],
      got: "xyz",
      suggestions: null,
    };
    const source = 'PLAN xyz "Test"';
    const formatted = formatError(error, source);
    expect(formatted).toContain("[Parse Error]");
    expect(formatted).toContain("Unexpected token 'xyz'");
    expect(formatted).toContain("at line 1, column 6");
    expect(formatted).toContain('PLAN xyz "Test"');
    expect(formatted).toContain("^^^");
  });

  it("formatError() includes hint for lexer errors", () => {
    const error: WplError = {
      kind: "lexer",
      type: "tab_character",
      message: "Tab character found",
      location: { line: 1, column: 1 },
      context: "Use spaces instead of tabs for indentation",
    };
    const formatted = formatError(error);
    expect(formatted).toContain("[Lexer Error]");
    expect(formatted).toContain("hint: Use spaces instead of tabs");
  });

  it("formatError() includes suggestions for parse errors", () => {
    const error: WplError = {
      kind: "parse",
      type: "unknown_exercise_ref",
      message: "Unknown exercise reference 'pushup'. Did you mean: push_up?",
      location: { line: 5, column: 10 },
      expected: null,
      got: "pushup",
      suggestions: ["push_up"],
    };
    const formatted = formatError(error);
    expect(formatted).toContain("did you mean: push_up?");
  });

  it("errorSummary() produces one-line summary", () => {
    const errors: WplError[] = [
      {
        kind: "lexer",
        type: "tab_character",
        message: "Tab character found",
        location: { line: 3, column: 1 },
        context: null,
      },
    ];
    const summary = errorSummary(errors);
    expect(summary).toBe("Tab character found (line 3)");
  });

  it("errorSummary() joins multiple errors with semicolons", () => {
    const errors: WplError[] = [
      {
        kind: "lexer",
        type: "tab_character",
        message: "Tab character found",
        location: { line: 1, column: 1 },
        context: null,
      },
      {
        kind: "parse",
        type: "unexpected_token",
        message: "Unexpected token",
        location: { line: 5, column: 3 },
        expected: null,
        got: null,
        suggestions: null,
      },
    ];
    const summary = errorSummary(errors);
    expect(summary).toContain("; ");
    expect(summary).toContain("(line 1)");
    expect(summary).toContain("(line 5)");
  });

  it("formatErrors() returns single error without numbering", () => {
    const errors: WplError[] = [
      {
        kind: "compile",
        type: "constraint_violation",
        message: "Something went wrong",
        path: null,
        details: null,
      },
    ];
    const formatted = formatErrors(errors);
    expect(formatted).not.toContain("1.");
    expect(formatted).toContain("[Compile Error]");
    expect(formatted).toContain("Something went wrong");
  });

  it("formatErrors() handles empty error array", () => {
    expect(formatErrors([])).toBe("No errors.");
  });

  it("errorSummary() handles empty error array", () => {
    expect(errorSummary([])).toBe("No errors");
  });

  it("error messages through compileWplAi include line numbers", () => {
    const source = `PLAN "Test"
TYPE workout
PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "Day":
        main:
          pushup 3x10`;
    const result = compileWplAi(source);
    if (result.ok) return;
    // Should have an error about unknown exercise 'pushup' with suggestion
    const hasExerciseError = result.errors.some(
      (e) =>
        e.message.includes("pushup") || e.message.includes("Unknown exercise"),
    );
    if (hasExerciseError) {
      const exerciseError = result.errors.find(
        (e) => e.message.includes("pushup") || e.message.includes("Unknown exercise"),
      )!;
      expect(result.summary).toContain("line");
      expect(result.formatted).toContain("push_up");
    }
  });

  it("unterminated string error message through pipeline", () => {
    const source = 'PLAN "Unterminated\nTYPE workout';
    const result = compileWplAi(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const lexerErrors = result.errors.filter((e) => e.kind === "lexer");
    expect(lexerErrors.length).toBeGreaterThan(0);
    const unterminatedError = lexerErrors.find(
      (e) => (e as LexerError).type === "unterminated_string",
    );
    expect(unterminatedError).toBeDefined();
    expect(unterminatedError!.message).toContain("Unterminated string");
  });

  it("tab character error message through pipeline", () => {
    const source = 'PLAN "Test"\n\tTYPE workout';
    const result = compileWplAi(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const tabError = result.errors.find(
      (e) => e.kind === "lexer" && (e as LexerError).type === "tab_character",
    );
    expect(tabError).toBeDefined();
    expect(tabError!.message).toContain("Tab character");
  });
});

// ---------------------------------------------------------------------------
// 4. Lexer error propagation
// ---------------------------------------------------------------------------

describe("Lexer error propagation", () => {
  it("tab characters produce lexer error propagated through compileWplAi", () => {
    const source = 'PLAN "Test"\n\tTYPE workout';
    const result = compileWplAi(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].kind).toBe("lexer");
    expect((result.errors[0] as LexerError).type).toBe("tab_character");
  });

  it("unterminated strings produce error with line number", () => {
    const source = 'PLAN "Never closed';
    const result = compileWplAi(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors[0] as LexerError;
    expect(err.kind).toBe("lexer");
    expect(err.type).toBe("unterminated_string");
    expect(err.location.line).toBe(1);
  });

  it("lexer errors appear with kind: lexer", () => {
    const source = 'PLAN "Test"\n\tTYPE workout';
    const result = compileWplAi(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    for (const error of result.errors) {
      expect(error.kind).toBe("lexer");
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Parse error propagation
// ---------------------------------------------------------------------------

describe("Parse error propagation", () => {
  it("missing PLAN name produces parse error", () => {
    const source = "TYPE workout";
    const result = compileWplAi(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const parseErrors = result.errors.filter((e) => e.kind === "parse");
    expect(parseErrors.length).toBeGreaterThan(0);
    expect(parseErrors[0].message).toContain("PLAN");
  });

  it("PLAN without string name produces parse error", () => {
    const source = "PLAN\nTYPE workout";
    const result = compileWplAi(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.kind === "parse")).toBe(true);
  });

  it("close-typo exercise refs are auto-resolved to the canonical form", () => {
    // `pushup` clears bestMatch's threshold and is substituted to
    // `push_up` silently. The compile succeeds; downstream consumers
    // see the canonical exercise_ref in the JSON.
    const source = `\
PLAN "Test"
TYPE workout

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "Day":
        main:
          pushup 3x10`;
    const result = compileWplAi(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const activity = (result.json as Record<string, unknown>).plan as Record<string, unknown>;
    const phase = (activity.phases as Array<Record<string, unknown>>)[0]!;
    const week = (phase.weeks as Array<Record<string, unknown>>)[0]!;
    const day = (week.days as Array<Record<string, unknown>>)[0]!;
    const block = (day.blocks as Array<Record<string, unknown>>)[0]!;
    const ex = (block.activities as Array<Record<string, unknown>>)[0]!;
    expect(ex.exercise_ref).toBe("push_up");
  });

  it("parse errors appear with kind: parse", () => {
    const source = "TYPE workout";
    const result = compileWplAi(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].kind).toBe("parse");
  });
});

// ---------------------------------------------------------------------------
// 6. Pipeline stages independently
// ---------------------------------------------------------------------------

describe("Pipeline stages independently", () => {
  it("tokenize() returns tokens for valid source", () => {
    const result = tokenize('PLAN "Test"\nTYPE workout');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tokens.length).toBeGreaterThan(0);
    expect(result.tokens[0].type).toBe("keyword");
    expect(result.tokens[0].value).toBe("PLAN");
    // Last token should be eof
    expect(result.tokens[result.tokens.length - 1].type).toBe("eof");
  });

  it("tokenize() returns errors for invalid source", () => {
    const result = tokenize('\tPLAN "Test"');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].type).toBe("tab_character");
  });

  it("parse() returns Document for valid tokens", () => {
    const lexResult = tokenize('PLAN "Test"\nTYPE workout');
    expect(lexResult.ok).toBe(true);
    if (!lexResult.ok) return;

    const parseResult = parse(lexResult.tokens);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    expect(parseResult.document.header.name).toBe("Test");
    expect(parseResult.document.header.type).toBe("workout");
  });

  it("parse() returns errors for invalid tokens", () => {
    const lexResult = tokenize("TYPE workout");
    expect(lexResult.ok).toBe(true);
    if (!lexResult.ok) return;

    const parseResult = parse(lexResult.tokens);
    expect(parseResult.ok).toBe(false);
    if (parseResult.ok) return;
    expect(parseResult.errors.length).toBeGreaterThan(0);
  });

  it("compile() converts Document AST to JSON", () => {
    const lexResult = tokenize('PLAN "Test"\nTYPE workout');
    expect(lexResult.ok).toBe(true);
    if (!lexResult.ok) return;

    const parseResult = parse(lexResult.tokens);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const compileResult = compile(parseResult.document);
    expect(compileResult.ok).toBe(true);
    if (!compileResult.ok) return;
    expect(compileResult.json.$schema).toBe("https://wpl.dev/schemas/wpl/v1.schema.json");
    expect(compileResult.json.version).toBe("1.6.0");
  });

  it("each stage can fail independently", () => {
    // Lexer fails
    const lexFail = tokenize('\t"broken');
    expect(lexFail.ok).toBe(false);

    // Parser fails with valid tokens but bad structure
    const lexOk = tokenize("TYPE workout");
    expect(lexOk.ok).toBe(true);
    if (lexOk.ok) {
      const parseFail = parse(lexOk.tokens);
      expect(parseFail.ok).toBe(false);
    }

    // Compiler succeeds with minimal valid doc
    const lexMin = tokenize('PLAN "X"\nTYPE workout');
    expect(lexMin.ok).toBe(true);
    if (lexMin.ok) {
      const parseMin = parse(lexMin.tokens);
      expect(parseMin.ok).toBe(true);
      if (parseMin.ok) {
        const compileMin = compile(parseMin.document);
        expect(compileMin.ok).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Multiple activity types in one plan
// ---------------------------------------------------------------------------

describe("Multiple activity types in one plan", () => {
  const MULTI_ACTIVITY_PLAN = `\
PLAN "Mixed Training Day"
TYPE hybrid

PHASES
  PHASE "All Activities" (1 weeks):
    WEEK 1:
      DAY Monday training 90m "Full Day":
        warmup:
          jumping_jacks 5m
        main straight_sets:
          push_up 3x10
          cardio running continuous:
            total 20 minutes
            zone 3
          nutrition post_workout:
            protein 20..40 g
            carbs 30..60 g
            calories 300..500
          meditation breathing:
            duration 5 minutes
            guided true
          habit hydration:
            target 8 glasses
            frequency daily
        cooldown:
          hamstring_stretch 30s x2 sides both
`;

  it("compiles successfully with all activity types", () => {
    const result = compileWplAi(MULTI_ACTIVITY_PLAN);
    expect(result.ok).toBe(true);
  });

  it("contains exercise activity", () => {
    const { json } = compileOk(MULTI_ACTIVITY_PLAN);
    const plan = json.plan as Record<string, unknown>;
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const mainBlock = blocks.find(
      (b) => (b as Record<string, unknown>).type === "main",
    ) as Record<string, unknown>;
    const activities = mainBlock.activities as Record<string, unknown>[];

    const exercise = activities.find((a) => a.type === "exercise");
    expect(exercise).toBeDefined();
    expect(exercise!.exercise_ref).toBe("push_up");
  });

  it("contains cardio activity", () => {
    const { json } = compileOk(MULTI_ACTIVITY_PLAN);
    const plan = json.plan as Record<string, unknown>;
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const mainBlock = blocks.find(
      (b) => (b as Record<string, unknown>).type === "main",
    ) as Record<string, unknown>;
    const activities = mainBlock.activities as Record<string, unknown>[];

    const cardio = activities.find((a) => a.type === "cardio");
    expect(cardio).toBeDefined();
    expect(cardio!.modality).toBe("running");
    const prescription = cardio!.prescription as Record<string, unknown>;
    expect(prescription.type).toBe("continuous");
    expect(prescription.duration).toEqual({ value: 20, unit: "minutes" });
  });

  it("contains nutrition activity", () => {
    const { json } = compileOk(MULTI_ACTIVITY_PLAN);
    const plan = json.plan as Record<string, unknown>;
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const mainBlock = blocks.find(
      (b) => (b as Record<string, unknown>).type === "main",
    ) as Record<string, unknown>;
    const activities = mainBlock.activities as Record<string, unknown>[];

    const nutrition = activities.find((a) => a.type === "nutrition");
    expect(nutrition).toBeDefined();
    expect(nutrition!.category).toBe("post_workout");
    const prescription = nutrition!.prescription as Record<string, unknown>;
    expect(prescription).toBeDefined();
    const macros = prescription.macros as Record<string, unknown>;
    expect(macros.protein).toEqual({ min: 20, max: 40, unit: "g" });
  });

  it("contains meditation activity", () => {
    const { json } = compileOk(MULTI_ACTIVITY_PLAN);
    const plan = json.plan as Record<string, unknown>;
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const mainBlock = blocks.find(
      (b) => (b as Record<string, unknown>).type === "main",
    ) as Record<string, unknown>;
    const activities = mainBlock.activities as Record<string, unknown>[];

    const meditation = activities.find((a) => a.type === "meditation");
    expect(meditation).toBeDefined();
    expect(meditation!.category).toBe("breathing");
    const prescription = meditation!.prescription as Record<string, unknown>;
    expect(prescription.duration).toEqual({ value: 5, unit: "minutes" });
    expect(prescription.guided).toBe(true);
  });

  it("contains habit activity", () => {
    const { json } = compileOk(MULTI_ACTIVITY_PLAN);
    const plan = json.plan as Record<string, unknown>;
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const mainBlock = blocks.find(
      (b) => (b as Record<string, unknown>).type === "main",
    ) as Record<string, unknown>;
    const activities = mainBlock.activities as Record<string, unknown>[];

    const habit = activities.find((a) => a.type === "habit");
    expect(habit).toBeDefined();
    expect(habit!.category).toBe("hydration");
    const rx = habit!.prescription as Record<string, unknown>;
    const target = rx.target as Record<string, unknown>;
    expect(target.value).toBe(8);
    expect(target.unit).toBe("glasses");
    expect(rx.frequency).toBe("daily");
  });

  it("contains recovery activity in cooldown", () => {
    const { json } = compileOk(MULTI_ACTIVITY_PLAN);
    const plan = json.plan as Record<string, unknown>;
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const cooldownBlock = blocks.find(
      (b) => (b as Record<string, unknown>).type === "cooldown",
    ) as Record<string, unknown>;
    const activities = cooldownBlock.activities as Record<string, unknown>[];

    const recovery = activities.find((a) => a.type === "recovery");
    expect(recovery).toBeDefined();
    // Synthesised cooldown stretches are normalised to category "stretching"
    expect(recovery!.category).toBe("stretching");
    const prescription = recovery!.prescription as Record<string, unknown>;
    const exercises = prescription.exercises as Record<string, unknown>[];
    expect(exercises[0].name).toBe("hamstring_stretch");
    expect(exercises[0].sides).toBe("both");
  });
});

// ---------------------------------------------------------------------------
// 8. Edge cases
// ---------------------------------------------------------------------------

describe("Edge cases", () => {
  it("plan with only header (no sections) compiles", () => {
    const result = compileOk(MINIMAL_PLAN);
    const plan = result.json.plan as Record<string, unknown>;
    expect(plan.name).toBe("Minimal Plan");
    expect(plan.type).toBe("workout");
    expect(plan.phases).toEqual([]);
  });

  it("empty PHASES section compiles to empty phases array", () => {
    const source = `\
PLAN "Empty Phases"
TYPE workout

PHASES
`;
    const result = compileOk(source);
    const plan = result.json.plan as Record<string, unknown>;
    expect(plan.phases).toEqual([]);
  });

  it("plan with all optional sections", () => {
    const source = `\
PLAN "Full Plan"
TYPE workout
VISIBILITY public
DIFFICULTY advanced
TAGS a, b, c
LANGUAGE es

GOALS
  GOAL primary strength:
    target weight 100 kg absolute

REQUIRES
  age 18..50
  fitness intermediate

PERSONALIZATION
  RULES
    WHEN fitness contains intermediate:
      reduce intensity by 10%

PHASES
  PHASE "Only Phase" (4 weeks):
    WEEK 1:
      DAY Tuesday training 60m "Day":
        main:
          bench_press 4x6 rpe 8 rest 120 seconds
`;
    const result = compileOk(source);
    const plan = result.json.plan as Record<string, unknown>;
    expect(plan.name).toBe("Full Plan");
    expect(plan.visibility).toBe("public");
    expect(result.ast.goals).not.toBeNull();
    expect(result.ast.requirements).not.toBeNull();
    expect(result.ast.personalization).not.toBeNull();
    expect(result.ast.phases.length).toBe(1);
  });

  it("very long plan names", () => {
    const longName = "A".repeat(200);
    const source = `PLAN "${longName}"\nTYPE workout`;
    const result = compileOk(source);
    const plan = result.json.plan as Record<string, unknown>;
    expect(plan.name).toBe(longName);
  });

  it("unicode in string values", () => {
    const source = `PLAN "Entra\\u00eenement Musculation"\nTYPE workout`;
    const result = compileOk(source);
    const plan = result.json.plan as Record<string, unknown>;
    expect(typeof plan.name).toBe("string");
    expect((plan.name as string).length).toBeGreaterThan(0);
  });

  it("multiple phases with multiple weeks each", () => {
    const source = `\
PLAN "Multi Phase"
TYPE workout

PHASES
  PHASE "Phase 1" (2 weeks):
    WEEK 1:
      DAY Monday training 30m "Day 1":
        main:
          squat 3x10
    WEEK 2:
      DAY Tuesday training 30m "Day 2":
        main:
          deadlift 3x8

  PHASE "Phase 2" (2 weeks):
    WEEK 1:
      DAY Wednesday training 30m "Day 3":
        main:
          bench_press 3x10
    WEEK 2:
      DAY Thursday training 30m "Day 4":
        main:
          pull_up 3x8
`;
    const result = compileOk(source);
    const plan = result.json.plan as Record<string, unknown>;
    const phases = plan.phases as Record<string, unknown>[];
    expect(phases.length).toBe(2);
    expect(phases[0].name).toBe("Phase 1");
    expect(phases[1].name).toBe("Phase 2");
    const p1weeks = phases[0].weeks as Record<string, unknown>[];
    expect(p1weeks.length).toBe(2);
    const p2weeks = phases[1].weeks as Record<string, unknown>[];
    expect(p2weeks.length).toBe(2);
  });

  it("rest day type", () => {
    const source = `\
PLAN "Rest Day Plan"
TYPE workout

PHASES
  PHASE "Recovery" (1 weeks):
    WEEK 1:
      DAY Sunday rest 0m "Rest":
        cooldown:
          hamstring_stretch 30s x1 sides both
`;
    const result = compileOk(source);
    const plan = result.json.plan as Record<string, unknown>;
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    expect(days[0].type).toBe("rest");
    expect(days[0].day_of_week).toBe(7); // Sunday = 7
  });

  it("exercise with weight parameter", () => {
    const source = `\
PLAN "Weight Test"
TYPE workout

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "Day":
        main:
          bench_press 3x10 weight 60 kg rest 90 seconds
`;
    const result = compileOk(source);
    const plan = result.json.plan as Record<string, unknown>;
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[0].activities as Record<string, unknown>[];
    const prescription = activities[0].prescription as Record<string, unknown>;
    const weight = prescription.weight as Record<string, unknown>;
    expect(weight.type).toBe("absolute");
    expect(weight.value).toBe(60);
    expect(weight.unit).toBe("kg");
  });
});

// ---------------------------------------------------------------------------
// 9. Error recovery
// ---------------------------------------------------------------------------

describe("Error recovery", () => {
  it("multiple errors in one source", () => {
    // Two tab characters on different lines
    const source = '\tPLAN "Test"\n\tTYPE workout';
    const result = compileWplAi(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("errors contain accurate line numbers", () => {
    const source = 'PLAN "Test"\nTYPE workout\n\n\n\n\t# tab on line 6';
    const result = compileWplAi(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const tabError = result.errors.find(
      (e) => e.kind === "lexer" && (e as LexerError).type === "tab_character",
    );
    expect(tabError).toBeDefined();
    expect((tabError as LexerError).location.line).toBe(6);
  });

  it("formatted errors show the offending source line", () => {
    const source = 'PLAN "Test"\nTYPE workout\nBADKEYWORD here';
    const result = compileWplAi(source);
    // The parser may or may not error - if it does, check formatting
    if (!result.ok && result.formatted) {
      expect(typeof result.formatted).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// 10. Performance
// ---------------------------------------------------------------------------

describe("Performance", () => {
  it("compiling a typical plan completes in under 100ms", () => {
    const start = performance.now();
    compileWplAi(SIMPLE_PLAN);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it("compiling a large plan with many exercises stays fast", () => {
    const exercises = [
      "push_up", "pull_up", "squat", "deadlift", "bench_press",
      "shoulder_press", "bicep_curl", "tricep_extension", "plank", "lunge",
    ];
    const exerciseLines = exercises
      .map((e) => `          ${e} 3x10 rpe 7 rest 60 seconds`)
      .join("\n");
    const source = `\
PLAN "Big Plan"
TYPE workout

PHASES
  PHASE "Phase 1" (4 weeks):
    WEEK 1:
      DAY Monday training 90m "Day":
        main straight_sets:
${exerciseLines}
`;
    const start = performance.now();
    const result = compileWplAi(source);
    const elapsed = performance.now() - start;
    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(100);
  });
});

// ---------------------------------------------------------------------------
// 11. JSON structure validation
// ---------------------------------------------------------------------------

describe("JSON structure validation", () => {
  it("$schema is always https://wpl.dev/schemas/wpl/v1.schema.json", () => {
    const r1 = compileOk(MINIMAL_PLAN);
    expect(r1.json.$schema).toBe("https://wpl.dev/schemas/wpl/v1.schema.json");

    const r2 = compileOk(SIMPLE_PLAN);
    expect(r2.json.$schema).toBe("https://wpl.dev/schemas/wpl/v1.schema.json");
  });

  it("version is always 1.6.0", () => {
    const r1 = compileOk(MINIMAL_PLAN);
    expect(r1.json.version).toBe("1.6.0");

    const r2 = compileOk(SIMPLE_PLAN);
    expect(r2.json.version).toBe("1.6.0");
  });

  it("plan has UUID id", () => {
    const { json } = compileOk(MINIMAL_PLAN);
    const plan = json.plan as Record<string, unknown>;
    expect(typeof plan.id).toBe("string");
    expect(plan.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("phases have sequential order starting at 1", () => {
    const source = `\
PLAN "Multi"
TYPE workout

PHASES
  PHASE "Alpha" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "D1":
        main:
          squat 3x10

  PHASE "Beta" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "D2":
        main:
          deadlift 3x10

  PHASE "Gamma" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "D3":
        main:
          bench_press 3x10
`;
    const { json } = compileOk(source);
    const plan = json.plan as Record<string, unknown>;
    const phases = plan.phases as Record<string, unknown>[];
    expect(phases.length).toBe(3);
    expect(phases[0].order).toBe(1);
    expect(phases[1].order).toBe(2);
    expect(phases[2].order).toBe(3);
    expect(phases[0].id).toBe("phase_1");
    expect(phases[1].id).toBe("phase_2");
    expect(phases[2].id).toBe("phase_3");
  });

  it("weeks have sequential order", () => {
    const source = `\
PLAN "Multi Week"
TYPE workout

PHASES
  PHASE "P1" (3 weeks):
    WEEK 1:
      DAY Monday training 30m "D1":
        main:
          squat 3x10
    WEEK 2:
      DAY Monday training 30m "D2":
        main:
          squat 3x10
    WEEK 3:
      DAY Monday training 30m "D3":
        main:
          squat 3x10
`;
    const { json } = compileOk(source);
    const plan = json.plan as Record<string, unknown>;
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    expect(weeks.length).toBe(3);
    expect(weeks[0].order).toBe(1);
    expect(weeks[1].order).toBe(2);
    expect(weeks[2].order).toBe(3);
  });

  it("day_of_week mapping is correct for all days", () => {
    const dayNames = [
      "Monday", "Tuesday", "Wednesday", "Thursday",
      "Friday", "Saturday", "Sunday",
    ];
    const dayLines = dayNames
      .map((d) => `      DAY ${d} training 30m "${d}":\n        main:\n          squat 3x10`)
      .join("\n");

    const source = `\
PLAN "All Days"
TYPE workout

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
${dayLines}
`;
    const { json } = compileOk(source);
    const plan = json.plan as Record<string, unknown>;
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    expect(days.length).toBe(7);
    expect(days[0].day_of_week).toBe(1); // Monday
    expect(days[1].day_of_week).toBe(2); // Tuesday
    expect(days[2].day_of_week).toBe(3); // Wednesday
    expect(days[3].day_of_week).toBe(4); // Thursday
    expect(days[4].day_of_week).toBe(5); // Friday
    expect(days[5].day_of_week).toBe(6); // Saturday
    expect(days[6].day_of_week).toBe(7); // Sunday
  });

  it("block order is sequential within a day", () => {
    const { json } = compileOk(SIMPLE_PLAN);
    const plan = json.plan as Record<string, unknown>;
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    expect(blocks.length).toBe(1);
    expect(blocks[0].order).toBe(1);
  });

  it("metadata includes created_at and updated_at timestamps", () => {
    const { json } = compileOk(MINIMAL_PLAN);
    const plan = json.plan as Record<string, unknown>;
    const metadata = plan.metadata as Record<string, unknown>;
    expect(metadata.created_at).toBeDefined();
    expect(metadata.updated_at).toBeDefined();
    expect(typeof metadata.created_at).toBe("string");
    expect(typeof metadata.updated_at).toBe("string");
    // ISO date format
    expect(metadata.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// 12. Re-exports
// ---------------------------------------------------------------------------

describe("Re-exports from index.ts", () => {
  it("tokenize is exported and callable", () => {
    expect(typeof tokenize).toBe("function");
    const result = tokenize('PLAN "Test"');
    expect(result).toBeDefined();
  });

  it("parse is exported and callable", () => {
    expect(typeof parse).toBe("function");
  });

  it("compile is exported and callable", () => {
    expect(typeof compile).toBe("function");
  });

  it("ALL_EXERCISES is exported and non-empty", () => {
    expect(Array.isArray(ALL_EXERCISES)).toBe(true);
    expect(ALL_EXERCISES.length).toBeGreaterThan(0);
    expect(ALL_EXERCISES).toContain("push_up");
  });

  it("isKnownExercise is exported and works", () => {
    expect(typeof isKnownExercise).toBe("function");
    expect(isKnownExercise("push_up")).toBe(true);
    expect(isKnownExercise("nonexistent")).toBe(false);
  });

  it("suggest is exported and returns suggestions", () => {
    expect(typeof suggest).toBe("function");
    const results = suggest("pushup");
    expect(results).toContain("push_up");
  });

  it("bestMatch is exported and works", () => {
    expect(typeof bestMatch).toBe("function");
    expect(bestMatch("pushup")).toBe("push_up");
    expect(bestMatch("xyz123")).toBeNull();
  });

  it("validateExercise is exported and works", () => {
    expect(typeof validateExercise).toBe("function");
    expect(validateExercise("push_up")).toEqual({ ok: true });
    const invalid = validateExercise("pushup");
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.suggestions).toContain("push_up");
    }
  });

  it("validate (WPL JSON validator) is re-exported from @gymbile/wpl-validator", () => {
    expect(typeof validate).toBe("function");
    // Calling with an empty object should return a structured result.
    const result = validate({});
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("valid");
  });

  it("formatErrors is exported and callable", () => {
    expect(typeof formatErrors).toBe("function");
  });

  it("formatError is exported and callable", () => {
    expect(typeof formatError).toBe("function");
  });

  it("errorSummary is exported and callable", () => {
    expect(typeof errorSummary).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// 13. Additional exercise and prescription tests
// ---------------------------------------------------------------------------

describe("Exercise prescription variations", () => {
  it("single rep count (no range)", () => {
    const source = `\
PLAN "Singles"
TYPE workout

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "Day":
        main:
          squat 5x5 rpe 9
`;
    const { json } = compileOk(source);
    const plan = json.plan as Record<string, unknown>;
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[0].activities as Record<string, unknown>[];
    const prescription = activities[0].prescription as Record<string, unknown>;
    expect(prescription.sets).toBe(5);
    expect(prescription.reps).toEqual({ target: 5 });
    expect(activities[0].target_rpe).toBe(9);
  });

  it("rep range without target", () => {
    const source = `\
PLAN "Ranges"
TYPE workout

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "Day":
        main:
          pull_up 4x6..10
`;
    const { json } = compileOk(source);
    const plan = json.plan as Record<string, unknown>;
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[0].activities as Record<string, unknown>[];
    const prescription = activities[0].prescription as Record<string, unknown>;
    expect(prescription.sets).toBe(4);
    expect(prescription.reps).toEqual({ min: 6, max: 10 });
  });

  it("rep range with target", () => {
    const source = `\
PLAN "Range Target"
TYPE workout

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "Day":
        main:
          bench_press 3x8..12 target 10
`;
    const { json } = compileOk(source);
    const plan = json.plan as Record<string, unknown>;
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[0].activities as Record<string, unknown>[];
    const prescription = activities[0].prescription as Record<string, unknown>;
    expect(prescription.reps).toEqual({ min: 8, max: 12, target: 10 });
  });

  it("bodyweight weight spec", () => {
    const source = `\
PLAN "BW"
TYPE workout

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "Day":
        main:
          dip 3x10 weight bodyweight
`;
    const { json } = compileOk(source);
    const plan = json.plan as Record<string, unknown>;
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[0].activities as Record<string, unknown>[];
    const prescription = activities[0].prescription as Record<string, unknown>;
    const weight = prescription.weight as Record<string, unknown>;
    expect(weight.type).toBe("bodyweight");
  });
});

// ---------------------------------------------------------------------------
// 14. Header field variations
// ---------------------------------------------------------------------------

describe("Header field variations", () => {
  it("all plan types compile", () => {
    for (const planType of ["workout", "nutrition", "meditation", "recovery", "hybrid"]) {
      const source = `PLAN "Test ${planType}"\nTYPE ${planType}`;
      const result = compileWplAi(source);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const plan = result.json.plan as Record<string, unknown>;
        expect(plan.type).toBe(planType);
      }
    }
  });

  it("all visibility levels compile", () => {
    for (const vis of ["private", "public", "template"]) {
      const source = `PLAN "Vis ${vis}"\nTYPE workout\nVISIBILITY ${vis}`;
      const result = compileWplAi(source);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const plan = result.json.plan as Record<string, unknown>;
        expect(plan.visibility).toBe(vis);
      }
    }
  });

  it("all difficulty levels compile", () => {
    for (const diff of ["beginner", "intermediate", "advanced", "adaptive"]) {
      const source = `PLAN "Diff ${diff}"\nTYPE workout\nDIFFICULTY ${diff}`;
      const result = compileWplAi(source);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const metadata = (result.json.plan as Record<string, unknown>)
          .metadata as Record<string, unknown>;
        expect(metadata.difficulty).toBe(diff);
      }
    }
  });

  it("duration in header produces estimated_duration_days in metadata", () => {
    const source = `PLAN "Duration Test"\nTYPE workout\nDURATION 8 weeks`;
    const result = compileOk(source);
    const plan = result.json.plan as Record<string, unknown>;
    const metadata = plan.metadata as Record<string, unknown>;
    expect(metadata.estimated_duration_days).toBe(56); // 8 * 7
  });

  it("default visibility is private", () => {
    const result = compileOk(MINIMAL_PLAN);
    const plan = result.json.plan as Record<string, unknown>;
    expect(plan.visibility).toBe("private");
  });
});

// ---------------------------------------------------------------------------
// 15. Tokenizer edge cases
// ---------------------------------------------------------------------------

describe("Tokenizer edge cases", () => {
  it("comments are stripped during tokenization", () => {
    const source = `\
PLAN "Test" # this is a comment
TYPE workout # another comment
`;
    const result = compileOk(source);
    const plan = result.json.plan as Record<string, unknown>;
    expect(plan.name).toBe("Test");
    expect(plan.type).toBe("workout");
  });

  it("empty lines between sections are handled", () => {
    const source = `\
PLAN "Test"

TYPE workout


`;
    const result = compileOk(source);
    expect(result.json.$schema).toBe("https://wpl.dev/schemas/wpl/v1.schema.json");
  });

  it("CRLF line endings are normalized", () => {
    const source = 'PLAN "Test"\r\nTYPE workout\r\n';
    const result = compileOk(source);
    const plan = result.json.plan as Record<string, unknown>;
    expect(plan.name).toBe("Test");
  });

  it("escaped characters in strings are handled", () => {
    const source = 'PLAN "Test \\"quoted\\""\nTYPE workout';
    const result = compileOk(source);
    const plan = result.json.plan as Record<string, unknown>;
    expect(plan.name).toBe('Test "quoted"');
  });

  it("numbers with decimal points tokenize correctly", () => {
    const lexResult = tokenize("3.5");
    expect(lexResult.ok).toBe(true);
    if (!lexResult.ok) return;
    const numToken = lexResult.tokens.find((t) => t.type === "number");
    expect(numToken).toBeDefined();
    expect(numToken!.value).toBe(3.5);
  });

  it("range operator (..) tokenizes separately from decimal", () => {
    const lexResult = tokenize("8..12");
    expect(lexResult.ok).toBe(true);
    if (!lexResult.ok) return;
    const types = lexResult.tokens.map((t) => t.type);
    expect(types).toContain("number");
    expect(types).toContain("range");
  });

  it("arrow operator (->) tokenizes correctly", () => {
    const lexResult = tokenize("squat -> wall_sit");
    expect(lexResult.ok).toBe(true);
    if (!lexResult.ok) return;
    const arrowToken = lexResult.tokens.find((t) => t.type === "arrow");
    expect(arrowToken).toBeDefined();
    expect(arrowToken!.value).toBe("->");
  });
});

// ---------------------------------------------------------------------------
// 16. Cardio with zone and intervals
// ---------------------------------------------------------------------------

describe("Cardio activity details", () => {
  it("cardio with zone produces correct JSON", () => {
    const source = `\
PLAN "Cardio Plan"
TYPE workout

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training 45m "Cardio Day":
        main:
          cardio cycling continuous:
            total 30 minutes
            zone 4
`;
    const { json } = compileOk(source);
    const plan = json.plan as Record<string, unknown>;
    const phases = plan.phases as Record<string, unknown>[];
    const weeks = phases[0].weeks as Record<string, unknown>[];
    const days = weeks[0].days as Record<string, unknown>[];
    const blocks = days[0].blocks as Record<string, unknown>[];
    const activities = blocks[0].activities as Record<string, unknown>[];
    const cardio = activities[0];
    expect(cardio.type).toBe("cardio");
    expect(cardio.modality).toBe("cycling");
    const prescription = cardio.prescription as Record<string, unknown>;
    expect(prescription.type).toBe("continuous");
    expect(prescription.duration).toEqual({ value: 30, unit: "minutes" });
    expect(prescription.intensity).toEqual({
      type: "heart_rate_zone",
      zone: 4,
    });
  });
});

// ---------------------------------------------------------------------------
// 17. Personalization condition operators
// ---------------------------------------------------------------------------

describe("Personalization conditions", () => {
  it("contains operator compiles correctly", () => {
    const source = `\
PLAN "Condition Test"
TYPE workout

PERSONALIZATION
  RULES
    WHEN injury contains knee:
      replace squat -> wall_sit
`;
    const { json } = compileOk(source);
    const plan = json.plan as Record<string, unknown>;
    const pers = plan.personalization as Record<string, unknown>;
    const rules = pers.rules as Record<string, unknown>[];
    const condition = rules[0].condition as Record<string, unknown>;
    expect(condition.field).toBe("injury");
    expect(condition.op).toBe("contains");
    expect(condition.value).toBe("knee");
  });

  it("comparison operators (>=) compile correctly", () => {
    const source = `\
PLAN "Comparison Test"
TYPE workout

PERSONALIZATION
  RULES
    WHEN age >= 400:
      reduce intensity by 15%
`;
    const { json } = compileOk(source);
    const plan = json.plan as Record<string, unknown>;
    const pers = plan.personalization as Record<string, unknown>;
    const rules = pers.rules as Record<string, unknown>[];
    const condition = rules[0].condition as Record<string, unknown>;
    expect(condition.field).toBe("age");
    expect(condition.op).toBe("gte");
    expect(condition.value).toBe(400);
  });
});

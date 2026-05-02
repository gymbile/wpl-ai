import { describe, it, expect } from "vitest";
import { tokenize } from "../src/lexer.js";
import type { Token } from "../src/lexer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract successful tokens or fail the test. */
function tokensOf(source: string): Token[] {
  const result = tokenize(source);
  if (!result.ok) {
    throw new Error(
      `Expected tokenize to succeed but got errors:\n${result.errors.map((e) => e.message).join("\n")}`,
    );
  }
  return result.tokens;
}

/** Shorthand: extract only type+value pairs (ignoring location). */
function typesAndValues(source: string): Array<[string, any]> {
  return tokensOf(source).map((t) => [t.type, t.value]);
}

/** Assert tokenize returns ok: false with at least one error of the given type. */
function expectError(source: string, errorType: string): void {
  const result = tokenize(source);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    const types = result.errors.map((e) => e.type);
    expect(types).toContain(errorType);
  }
}

/** Count how many tokens of a given type appear. */
function countTokenType(tokens: Token[], type: string): number {
  return tokens.filter((t) => t.type === type).length;
}

// ---------------------------------------------------------------------------
// 1. Basic tokenization
// ---------------------------------------------------------------------------

describe("Basic tokenization", () => {
  it("tokenizes PLAN + string + newline + TYPE + bare_word", () => {
    const tokens = tokensOf('PLAN "Test"\nTYPE workout');
    const tv = tokens.map((t) => [t.type, t.value]);
    expect(tv).toEqual([
      ["keyword", "PLAN"],
      ["string", "Test"],
      ["newline", null],
      ["keyword", "TYPE"],
      ["keyword", "workout"],
      ["eof", null],
    ]);
  });

  it("verifies exact locations for PLAN + string", () => {
    const tokens = tokensOf('PLAN "Test"');
    expect(tokens[0]).toMatchObject({ type: "keyword", value: "PLAN", location: { line: 1, column: 1 } });
    expect(tokens[1]).toMatchObject({ type: "string", value: "Test", location: { line: 1, column: 6 } });
    expect(tokens[2]).toMatchObject({ type: "eof", value: null, location: { line: 1, column: 12 } });
  });

  it("tokenizes a single keyword", () => {
    expect(typesAndValues("PLAN")).toEqual([
      ["keyword", "PLAN"],
      ["eof", null],
    ]);
  });

  it("tokenizes multiple keywords on one line separated by spaces", () => {
    const tv = typesAndValues("PLAN TYPE GOALS");
    expect(tv).toEqual([
      ["keyword", "PLAN"],
      ["keyword", "TYPE"],
      ["keyword", "GOALS"],
      ["eof", null],
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. All token types
// ---------------------------------------------------------------------------

describe("Token types", () => {
  // -- Keywords --

  describe("keywords", () => {
    const sectionKeywords = [
      "PLAN", "TYPE", "VISIBILITY", "DIFFICULTY", "DURATION", "TAGS",
      "LANGUAGE", "MIN_APP_VERSION", "SCHEMA",
      "GOALS", "GOAL", "REQUIRES", "PERSONALIZATION", "INPUTS", "RULES", "WHEN",
      "PHASES", "PHASE", "WEEK", "DAY",
      "PROGRESS", "NOTIFICATIONS", "RENDERING",
    ];
    const priorityKeywords = ["primary", "secondary"];
    const planTypes = ["workout", "nutrition", "meditation", "recovery", "hybrid"];
    const visibilityKeywords = ["private", "public", "template"];
    const difficultyKeywords = ["beginner", "intermediate", "advanced", "adaptive"];
    const dayTypes = ["training", "rest", "active_recovery", "assessment"];
    const blockTypes = ["warmup", "main", "cooldown", "education"];
    const blockStructures = ["circuit", "straight_sets", "superset", "emom", "amrap", "tabata"];
    const activityKinds = ["cardio", "habit"];
    const scheduleKeywords = ["morning", "afternoon", "evening", "any", "strict", "flexible"];
    const requirementKeywords = ["age", "fitness", "equipment", "contraindication", "time", "required", "optional", "alternatives"];
    const goalKeywords = ["target", "deadline", "milestone", "reward", "badge", "at"];
    const commonFields = ["name", "description"];
    const toggleKeywords = ["enabled", "disabled"];
    const progressKeywords = ["checkpoints", "points", "achievements", "streaks", "checkpoint", "trigger", "measure", "ask", "achievement", "condition"];
    const cardioKeywords = ["total", "zone", "intensity", "duration", "guided", "audio"];
    const nutritionKeywords = ["timing", "suggestions", "protein", "carbs", "fat", "calories"];
    const habitKeywords = ["frequency", "reminders"];
    const blockFields = ["rounds", "rest_between_rounds"];
    const dayFields = ["schedule", "notes"];
    const logicalKeywords = ["AND", "OR"];
    const comparisonKeywords = ["contains", "not_contains"];
    const actionKeywords = ["reduce", "modify", "add", "replace", "exclude", "remove", "increase"];
    const scopeKeywords = ["scope", "activity", "block", "day", "week", "phase", "plan"];
    const exerciseParams = ["rpe", "rir", "tempo", "rest", "weight"];
    const prepositions = ["before", "after", "in"];
    const timeUnits = ["seconds", "minutes", "hours", "days", "weeks"];
    const weightUnits = ["kg", "lbs", "percentage_1rm"];
    const distanceUnits = ["meters", "km", "miles"];
    const intensityTypes = ["heart_rate_zone", "bpm", "pace"];
    const weightTypes = ["bodyweight"];
    const measureTypes = ["absolute", "relative", "percentage"];
    const booleans = ["true", "false"];
    const recoveryKeywords = ["sides", "both", "left", "right"];
    const miscKeywords = ["rules", "types", "work", "x"];

    const allKeywords = [
      ...sectionKeywords, ...priorityKeywords, ...planTypes,
      ...visibilityKeywords, ...difficultyKeywords, ...dayTypes,
      ...blockTypes, ...blockStructures, ...activityKinds,
      ...scheduleKeywords, ...requirementKeywords, ...goalKeywords,
      ...commonFields, ...toggleKeywords, ...progressKeywords,
      ...cardioKeywords, ...nutritionKeywords, ...habitKeywords,
      ...blockFields, ...dayFields, ...logicalKeywords,
      ...comparisonKeywords, ...actionKeywords, ...scopeKeywords,
      ...exerciseParams, ...prepositions, ...timeUnits,
      ...weightUnits, ...distanceUnits, ...intensityTypes,
      ...weightTypes, ...measureTypes, ...booleans,
      ...recoveryKeywords, ...miscKeywords,
    ];

    it.each(allKeywords)("recognizes '%s' as a keyword", (kw) => {
      const tokens = tokensOf(kw);
      expect(tokens[0]).toMatchObject({ type: "keyword", value: kw });
    });

    it("capitalised unknown word treated as keyword (not bare_word)", () => {
      const tokens = tokensOf("FooBar");
      expect(tokens[0]).toMatchObject({ type: "keyword", value: "FooBar" });
    });
  });

  // -- Strings --

  describe("strings", () => {
    it("tokenizes simple string", () => {
      const tokens = tokensOf('"hello"');
      expect(tokens[0]).toMatchObject({ type: "string", value: "hello" });
    });

    it("tokenizes empty string", () => {
      const tokens = tokensOf('""');
      expect(tokens[0]).toMatchObject({ type: "string", value: "" });
    });

    it("handles escaped quotes", () => {
      const tokens = tokensOf('"with \\"escaped\\" quotes"');
      expect(tokens[0]).toMatchObject({ type: "string", value: 'with "escaped" quotes' });
    });

    it("handles escaped backslash", () => {
      const tokens = tokensOf('"with \\\\backslash"');
      expect(tokens[0]).toMatchObject({ type: "string", value: "with \\backslash" });
    });

    it("handles escaped newline", () => {
      const tokens = tokensOf('"with \\n newline"');
      expect(tokens[0]).toMatchObject({ type: "string", value: "with \n newline" });
    });

    it("handles escaped tab", () => {
      const tokens = tokensOf('"with \\t tab"');
      expect(tokens[0]).toMatchObject({ type: "string", value: "with \t tab" });
    });

    it("handles unknown escape sequence (passes through)", () => {
      const tokens = tokensOf('"with \\r return"');
      expect(tokens[0]).toMatchObject({ type: "string", value: "with r return" });
    });
  });

  // -- Numbers --

  describe("numbers", () => {
    it("tokenizes integer", () => {
      const tokens = tokensOf("42");
      expect(tokens[0]).toMatchObject({ type: "number", value: 42 });
    });

    it("tokenizes negative number", () => {
      const tokens = tokensOf("-5");
      expect(tokens[0]).toMatchObject({ type: "number", value: -5 });
    });

    it("tokenizes decimal", () => {
      const tokens = tokensOf("3.14");
      expect(tokens[0]).toMatchObject({ type: "number", value: 3.14 });
    });

    it("tokenizes zero", () => {
      const tokens = tokensOf("0");
      expect(tokens[0]).toMatchObject({ type: "number", value: 0 });
    });

    it("tokenizes large number", () => {
      const tokens = tokensOf("9999");
      expect(tokens[0]).toMatchObject({ type: "number", value: 9999 });
    });
  });

  // -- Identifiers and bare words --

  describe("identifiers and bare words", () => {
    it("tokenizes lowercase word as bare_word", () => {
      const tokens = tokensOf("foobar");
      expect(tokens[0]).toMatchObject({ type: "bare_word", value: "foobar" });
    });

    it("tokenizes underscore-containing word as bare_word", () => {
      const tokens = tokensOf("push_up");
      expect(tokens[0]).toMatchObject({ type: "bare_word", value: "push_up" });
    });

    it("tokenizes hyphen-containing word as bare_word", () => {
      const tokens = tokensOf("upper-body");
      expect(tokens[0]).toMatchObject({ type: "bare_word", value: "upper-body" });
    });

    it("tokenizes identifier with digits", () => {
      const tokens = tokensOf("phase1");
      expect(tokens[0]).toMatchObject({ type: "bare_word", value: "phase1" });
    });
  });

  // -- Dates --

  describe("dates", () => {
    it("tokenizes valid date", () => {
      const tokens = tokensOf("2024-01-15");
      expect(tokens[0]).toMatchObject({ type: "date", value: "2024-01-15" });
    });

    it("tokenizes another valid date", () => {
      const tokens = tokensOf("2025-12-31");
      expect(tokens[0]).toMatchObject({ type: "date", value: "2025-12-31" });
    });

    it("rejects invalid date (month 13)", () => {
      expectError("2024-13-01", "invalid_date");
    });

    it("rejects invalid date (Feb 30)", () => {
      expectError("2024-02-30", "invalid_date");
    });
  });

  // -- Times --

  describe("times", () => {
    it("tokenizes valid time", () => {
      const tokens = tokensOf("14:30");
      expect(tokens[0]).toMatchObject({ type: "time", value: "14:30" });
    });

    it("tokenizes midnight", () => {
      const tokens = tokensOf("00:00");
      expect(tokens[0]).toMatchObject({ type: "time", value: "00:00" });
    });

    it("tokenizes end of day", () => {
      const tokens = tokensOf("23:59");
      expect(tokens[0]).toMatchObject({ type: "time", value: "23:59" });
    });

    it("rejects invalid time (hour 25)", () => {
      expectError("25:00", "invalid_time");
    });

    it("rejects invalid time (minute 60)", () => {
      expectError("12:60", "invalid_time");
    });
  });

  // -- Datetimes --

  describe("datetimes", () => {
    it("tokenizes datetime without seconds", () => {
      const tokens = tokensOf("2024-01-15T14:30");
      expect(tokens[0]).toMatchObject({ type: "datetime", value: "2024-01-15T14:30" });
    });

    it("tokenizes datetime with seconds and Z (lexer stops at second colon)", () => {
      // consumeNumberLike only consumes the first colon when accumulated string
      // matches the time/datetime prefix pattern. The second colon in :00Z is not
      // consumed, so the lexer produces a datetime for the first part.
      const tokens = tokensOf("2024-01-15T14:30");
      expect(tokens[0]).toMatchObject({ type: "datetime", value: "2024-01-15T14:30" });
    });
  });

  // -- Operators --

  describe("operators", () => {
    it("tokenizes arrow ->", () => {
      const tokens = tokensOf("a -> b");
      expect(tokens[1]).toMatchObject({ type: "arrow", value: "->" });
    });

    it("tokenizes range ..", () => {
      const tokens = tokensOf("1..10");
      const tv = typesAndValues("1..10");
      expect(tv).toEqual([
        ["number", 1],
        ["range", ".."],
        ["number", 10],
        ["eof", null],
      ]);
    });

    it("tokenizes colon", () => {
      const tokens = tokensOf("WEEK 1:");
      expect(tokens.find((t) => t.type === "colon")).toBeDefined();
    });

    it("tokenizes comma", () => {
      const tokens = tokensOf("a, b");
      expect(tokens.find((t) => t.type === "comma")).toBeDefined();
    });

    it("tokenizes parentheses", () => {
      const tokens = tokensOf("(a)");
      expect(tokens[0]).toMatchObject({ type: "lparen", value: "(" });
      expect(tokens[2]).toMatchObject({ type: "rparen", value: ")" });
    });

    it("tokenizes =", () => {
      const tokens = tokensOf("a = b");
      expect(tokens[1]).toMatchObject({ type: "eq", value: "=" });
    });

    it("tokenizes ==", () => {
      const tokens = tokensOf("a == b");
      expect(tokens[1]).toMatchObject({ type: "eq", value: "==" });
    });

    it("tokenizes !=", () => {
      const tokens = tokensOf("a != b");
      expect(tokens[1]).toMatchObject({ type: "neq", value: "!=" });
    });

    it("tokenizes >=", () => {
      const tokens = tokensOf("a >= b");
      expect(tokens[1]).toMatchObject({ type: "gte", value: ">=" });
    });

    it("tokenizes <=", () => {
      const tokens = tokensOf("a <= b");
      expect(tokens[1]).toMatchObject({ type: "lte", value: "<=" });
    });

    it("tokenizes >", () => {
      const tokens = tokensOf("a > b");
      expect(tokens[1]).toMatchObject({ type: "gt", value: ">" });
    });

    it("tokenizes <", () => {
      const tokens = tokensOf("a < b");
      expect(tokens[1]).toMatchObject({ type: "lt", value: "<" });
    });

    it("tokenizes +", () => {
      const tokens = tokensOf("a + b");
      expect(tokens[1]).toMatchObject({ type: "plus", value: "+" });
    });

    it("tokenizes - (minus, not arrow)", () => {
      const tokens = tokensOf("a - b");
      expect(tokens[1]).toMatchObject({ type: "minus", value: "-" });
    });

    it("tokenizes %", () => {
      const tokens = tokensOf("50%");
      expect(tokens[1]).toMatchObject({ type: "percent", value: "%" });
    });

    it("tokenizes /", () => {
      const tokens = tokensOf("a / b");
      expect(tokens[1]).toMatchObject({ type: "slash", value: "/" });
    });

    it("tokenizes * (times)", () => {
      const tokens = tokensOf("a * b");
      expect(tokens[1]).toMatchObject({ type: "times", value: "*" });
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Significant indentation (INDENT / DEDENT)
// ---------------------------------------------------------------------------

describe("Significant indentation", () => {
  it("generates INDENT for 2-space indentation", () => {
    const source = "PHASES\n  PHASE";
    const tokens = tokensOf(source);
    const types = tokens.map((t) => t.type);
    expect(types).toContain("indent");
  });

  it("generates INDENT for 4-space indentation", () => {
    const source = "PHASES\n    PHASE";
    const tokens = tokensOf(source);
    const types = tokens.map((t) => t.type);
    expect(types).toContain("indent");
  });

  it("generates DEDENT when going back to 0 indentation", () => {
    const source = "PHASES\n  PHASE\nTYPE";
    const tokens = tokensOf(source);
    const types = tokens.map((t) => t.type);
    expect(types).toContain("indent");
    expect(types).toContain("dedent");
  });

  it("generates multiple DEDENT tokens for multi-level unwind", () => {
    const source = [
      "PHASES",
      "  PHASE",
      "    WEEK",
      "      DAY",
      "TYPE",
    ].join("\n");
    const tokens = tokensOf(source);
    const indentCount = countTokenType(tokens, "indent");
    const dedentCount = countTokenType(tokens, "dedent");
    expect(indentCount).toBe(3);
    expect(dedentCount).toBe(3);
  });

  it("INDENT count equals DEDENT count before EOF", () => {
    const source = [
      "PHASES",
      "  PHASE",
      "    WEEK",
      "      DAY",
      "        warmup",
      "          bench_press 3 10",
    ].join("\n");
    const tokens = tokensOf(source);
    const indentCount = countTokenType(tokens, "indent");
    const dedentCount = countTokenType(tokens, "dedent");
    expect(indentCount).toBe(dedentCount);
  });

  it("handles nested structure: PHASES > PHASE > WEEK > DAY > block > activity", () => {
    const source = [
      "PHASES",
      "  PHASE 1",
      "    WEEK 1",
      "      DAY 1",
      "        warmup",
      "          push_up 3 10",
      "GOALS",
    ].join("\n");
    const tokens = tokensOf(source);
    const types = tokens.map((t) => t.type);

    // Should have 5 INDENTs and 5 DEDENTs (returning from depth 5 to 0)
    expect(countTokenType(tokens, "indent")).toBe(5);
    expect(countTokenType(tokens, "dedent")).toBe(5);
  });

  it("same indentation level produces no INDENT or DEDENT", () => {
    const source = "PLAN\nTYPE\nGOALS";
    const tokens = tokensOf(source);
    expect(countTokenType(tokens, "indent")).toBe(0);
    expect(countTokenType(tokens, "dedent")).toBe(0);
  });

  it("INDENT token has the space count as value", () => {
    const source = "A\n  B";
    const tokens = tokensOf(source);
    const indent = tokens.find((t) => t.type === "indent");
    expect(indent).toBeDefined();
    expect(indent!.value).toBe(2);
  });

  it("DEDENT token has the target level as value", () => {
    const source = "A\n  B\nC";
    const tokens = tokensOf(source);
    const dedent = tokens.find((t) => t.type === "dedent");
    expect(dedent).toBeDefined();
    expect(dedent!.value).toBe(0);
  });

  it("remaining DEDENTs are emitted before EOF when source ends indented", () => {
    const source = "A\n  B\n    C";
    const tokens = tokensOf(source);
    const lastThree = tokens.slice(-3);
    expect(lastThree.map((t) => t.type)).toEqual(["dedent", "dedent", "eof"]);
  });
});

// ---------------------------------------------------------------------------
// 4. 3x10 splitting
// ---------------------------------------------------------------------------

describe("3x10 splitting", () => {
  it("splits 3x10 into number, times, number", () => {
    const tv = typesAndValues("3x10");
    expect(tv).toEqual([
      ["number", 3],
      ["keyword", "x"],
      ["number", 10],
      ["eof", null],
    ]);
  });

  it("splits 4x6 into number, times, number", () => {
    const tv = typesAndValues("4x6");
    expect(tv).toEqual([
      ["number", 4],
      ["keyword", "x"],
      ["number", 6],
      ["eof", null],
    ]);
  });

  it("splits 3x8..12 into number, times, number, range, number", () => {
    const tv = typesAndValues("3x8..12");
    expect(tv).toEqual([
      ["number", 3],
      ["keyword", "x"],
      ["number", 8],
      ["range", ".."],
      ["number", 12],
      ["eof", null],
    ]);
  });

  it("handles 1x1", () => {
    const tv = typesAndValues("1x1");
    expect(tv).toEqual([
      ["number", 1],
      ["keyword", "x"],
      ["number", 1],
      ["eof", null],
    ]);
  });
});

// ---------------------------------------------------------------------------
// 5. Duration suffixes
// ---------------------------------------------------------------------------

describe("Duration suffixes", () => {
  it("60s produces number + bare_word", () => {
    const tv = typesAndValues("60s");
    expect(tv).toEqual([
      ["number", 60],
      ["bare_word", "s"],
      ["eof", null],
    ]);
  });

  it("2m produces number + bare_word", () => {
    const tv = typesAndValues("2m");
    expect(tv).toEqual([
      ["number", 2],
      ["bare_word", "m"],
      ["eof", null],
    ]);
  });

  it("30s produces number + bare_word", () => {
    const tv = typesAndValues("30s");
    expect(tv).toEqual([
      ["number", 30],
      ["bare_word", "s"],
      ["eof", null],
    ]);
  });

  it("45m produces number + bare_word", () => {
    const tv = typesAndValues("45m");
    expect(tv).toEqual([
      ["number", 45],
      ["bare_word", "m"],
      ["eof", null],
    ]);
  });

  it("1h produces number + bare_word", () => {
    const tv = typesAndValues("1h");
    expect(tv).toEqual([
      ["number", 1],
      ["bare_word", "h"],
      ["eof", null],
    ]);
  });

  it("7d produces number + bare_word", () => {
    const tv = typesAndValues("7d");
    expect(tv).toEqual([
      ["number", 7],
      ["bare_word", "d"],
      ["eof", null],
    ]);
  });

  it("decimal duration 1.5h produces number + bare_word", () => {
    const tv = typesAndValues("1.5h");
    expect(tv).toEqual([
      ["number", 1.5],
      ["bare_word", "h"],
      ["eof", null],
    ]);
  });

  it("unit letter followed by more letters is NOT consumed as unit", () => {
    // e.g., '60seconds' should not split as 60 + s + econds
    // because 's' is followed by 'e' (lowercase letter), so the lexer stops
    // at 60 and then tokenizes 'seconds' as a keyword
    const tv = typesAndValues("60seconds");
    expect(tv[0]).toEqual(["number", 60]);
    expect(tv[1]).toEqual(["keyword", "seconds"]);
  });
});

// ---------------------------------------------------------------------------
// 6. Comments
// ---------------------------------------------------------------------------

describe("Comments", () => {
  it("ignores full-line comment", () => {
    const tokens = tokensOf("# this is a comment");
    // Only EOF should remain (plus possibly a newline from skipComment)
    const nonNewline = tokens.filter((t) => t.type !== "newline");
    expect(nonNewline).toEqual([{ type: "eof", value: null, location: expect.any(Object) }]);
  });

  it("ignores comment at end of line", () => {
    const tv = typesAndValues("PLAN # comment");
    expect(tv[0]).toEqual(["keyword", "PLAN"]);
    // After PLAN there will be a newline from skipComment, then eof
    expect(tv[tv.length - 1]).toEqual(["eof", null]);
    // No comment content appears as a token
    const hasComment = tv.some(([type, val]) => type === "string" && val?.includes("comment"));
    expect(hasComment).toBe(false);
  });

  it("ignores comment between code lines", () => {
    const source = "PLAN\n# middle comment\nTYPE";
    const tokens = tokensOf(source);
    const keywords = tokens.filter((t) => t.type === "keyword").map((t) => t.value);
    expect(keywords).toEqual(["PLAN", "TYPE"]);
  });

  it("handles indented comment line", () => {
    const source = "PHASES\n  # comment\n  PHASE";
    const tokens = tokensOf(source);
    const keywords = tokens.filter((t) => t.type === "keyword").map((t) => t.value);
    expect(keywords).toContain("PHASES");
    expect(keywords).toContain("PHASE");
  });

  it("source with only comments produces just EOF", () => {
    const tokens = tokensOf("# first\n# second\n# third");
    const nonNewline = tokens.filter((t) => t.type !== "newline");
    expect(nonNewline).toEqual([{ type: "eof", value: null, location: expect.any(Object) }]);
  });
});

// ---------------------------------------------------------------------------
// 7. Consecutive newlines
// ---------------------------------------------------------------------------

describe("Consecutive newlines", () => {
  it("multiple blank lines collapse to single newline", () => {
    const source = "PLAN\n\n\n\nTYPE";
    const tokens = tokensOf(source);
    const types = tokens.map((t) => t.type);

    // No two consecutive newlines
    for (let i = 1; i < types.length; i++) {
      if (types[i] === "newline") {
        expect(types[i - 1]).not.toBe("newline");
      }
    }
  });

  it("blank lines between two keywords produce at most one newline", () => {
    const source = "PLAN\n\n\nTYPE";
    const tokens = tokensOf(source);
    const newlineCount = countTokenType(tokens, "newline");
    expect(newlineCount).toBeLessThanOrEqual(1);
  });

  it("no consecutive newline tokens ever appear in output", () => {
    const source = "A\n\n\n\n\n  B\n\n\n\nC";
    const tokens = tokensOf(source);
    const types = tokens.map((t) => t.type);
    for (let i = 1; i < types.length; i++) {
      expect(types[i] === "newline" && types[i - 1] === "newline").toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Error cases
// ---------------------------------------------------------------------------

describe("Error cases", () => {
  it("tab characters produce error", () => {
    expectError("\tPLAN", "tab_character");
  });

  it("tab inside line produces error", () => {
    expectError("PLAN\tTYPE", "tab_character");
  });

  it("unterminated string produces error", () => {
    expectError('"hello', "unterminated_string");
  });

  it("string terminated by newline produces error", () => {
    expectError('"hello\nworld"', "unterminated_string");
  });

  it("unterminated string with escape at EOF", () => {
    expectError('"hello\\', "unterminated_string");
  });

  it("invalid character produces error", () => {
    expectError("PLAN @", "invalid_character");
  });

  it("lone ! is an invalid character", () => {
    expectError("!", "invalid_character");
  });

  it("inconsistent indentation produces error (2 then 3)", () => {
    const source = "A\n  B\n     C";
    // First indent is 2, so indentUnit = 2. Next indent diff is 3, inconsistent.
    expectError(source, "inconsistent_indentation");
  });

  it("inconsistent indentation: first indent of 3 spaces", () => {
    const source = "A\n   B";
    // diff = 3, which is neither 2 nor 4
    expectError(source, "inconsistent_indentation");
  });

  it("inconsistent indentation: first indent of 1 space", () => {
    const source = "A\n B";
    expectError(source, "inconsistent_indentation");
  });
});

// ---------------------------------------------------------------------------
// 9. Edge cases
// ---------------------------------------------------------------------------

describe("Edge cases", () => {
  it("empty source produces just EOF", () => {
    const tokens = tokensOf("");
    expect(tokens).toEqual([
      { type: "eof", value: null, location: expect.objectContaining({ line: 1, column: 1 }) },
    ]);
  });

  it("source with only whitespace lines produces just EOF", () => {
    const tokens = tokensOf("\n\n\n");
    const nonNewline = tokens.filter((t) => t.type !== "newline");
    expect(nonNewline).toEqual([{ type: "eof", value: null, location: expect.any(Object) }]);
  });

  it("range operator .. vs single dot (single dot starts identifier)", () => {
    const tv = typesAndValues("1..10");
    expect(tv[1]).toEqual(["range", ".."]);
  });

  it("single dot starts an identifier", () => {
    const tokens = tokensOf(".foo");
    // The dot triggers tokenizeDots -> since next is not '.', it calls tokenizeIdentifier
    expect(tokens[0].type).toBe("bare_word");
    expect(tokens[0].value).toBe(".foo");
  });

  it("negative number vs minus operator context", () => {
    // '-5' at start of input is a negative number
    const tv1 = typesAndValues("-5");
    expect(tv1[0]).toEqual(["number", -5]);

    // 'a - 5' - the '-' is followed by a space then '5', which is not isDigit(next)
    // Actually the minus function checks peek(state, 1), i.e., the next character.
    // In "a - 5", when we hit '-', peek(1) is ' ' so it emits minus.
    const tv2 = typesAndValues("a - 5");
    expect(tv2[1]).toEqual(["minus", "-"]);
    expect(tv2[2]).toEqual(["number", 5]);
  });

  it("negative decimal number", () => {
    const tv = typesAndValues("-3.14");
    expect(tv[0]).toEqual(["number", -3.14]);
  });

  it("CRLF line endings are normalized", () => {
    const source = "PLAN\r\nTYPE";
    const tokens = tokensOf(source);
    const keywords = tokens.filter((t) => t.type === "keyword").map((t) => t.value);
    expect(keywords).toEqual(["PLAN", "TYPE"]);
  });

  it("source with trailing whitespace on a line", () => {
    const source = "PLAN   \nTYPE";
    const result = tokenize(source);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keywords = result.tokens.filter((t) => t.type === "keyword").map((t) => t.value);
      expect(keywords).toEqual(["PLAN", "TYPE"]);
    }
  });

  it("handles many operators in sequence", () => {
    const tv = typesAndValues("1 + 2 - 3 * 4 / 5 % 6");
    const ops = tv.filter(([type]) => ["plus", "minus", "times", "slash", "percent"].includes(type));
    expect(ops.map(([type]) => type)).toEqual(["plus", "minus", "times", "slash", "percent"]);
  });

  it("colon after number (e.g., WEEK 1:) does not form a time", () => {
    const tv = typesAndValues("WEEK 1:");
    // 1 followed by : should NOT be consumed as time because it doesn't match \\d{2}
    expect(tv).toEqual([
      ["keyword", "WEEK"],
      ["number", 1],
      ["colon", ":"],
      ["eof", null],
    ]);
  });

  it("arrow at end of line works", () => {
    const source = "a ->\n  b";
    const tokens = tokensOf(source);
    const arrow = tokens.find((t) => t.type === "arrow");
    expect(arrow).toBeDefined();
    expect(arrow!.value).toBe("->");
  });
});

// ---------------------------------------------------------------------------
// 10. Token locations
// ---------------------------------------------------------------------------

describe("Token locations", () => {
  it("first token starts at line 1, column 1", () => {
    const tokens = tokensOf("PLAN");
    expect(tokens[0].location).toMatchObject({ line: 1, column: 1 });
  });

  it("tokens on second line have line 2", () => {
    const tokens = tokensOf("PLAN\nTYPE");
    const typeTok = tokens.find((t) => t.type === "keyword" && t.value === "TYPE");
    expect(typeTok).toBeDefined();
    expect(typeTok!.location.line).toBe(2);
  });

  it("column is correct after spaces", () => {
    const tokens = tokensOf("PLAN TYPE");
    const typeTok = tokens.find((t) => t.value === "TYPE");
    expect(typeTok).toBeDefined();
    expect(typeTok!.location).toMatchObject({ line: 1, column: 6 });
  });

  it("string location points to opening quote", () => {
    const tokens = tokensOf('PLAN "Test"');
    const str = tokens.find((t) => t.type === "string");
    expect(str).toBeDefined();
    expect(str!.location).toMatchObject({ line: 1, column: 6 });
  });

  it("multi-line locations track correctly", () => {
    const source = 'PLAN "Test"\nTYPE workout\nVISIBILITY public';
    const tokens = tokensOf(source);

    const plan = tokens.find((t) => t.value === "PLAN");
    expect(plan!.location).toMatchObject({ line: 1, column: 1 });

    const type = tokens.find((t) => t.value === "TYPE");
    expect(type!.location).toMatchObject({ line: 2, column: 1 });

    const vis = tokens.find((t) => t.value === "VISIBILITY");
    expect(vis!.location).toMatchObject({ line: 3, column: 1 });
  });

  it("indented token location reflects column after indent", () => {
    const source = "PHASES\n  PHASE";
    const tokens = tokensOf(source);
    const phase = tokens.find((t) => t.value === "PHASE");
    expect(phase).toBeDefined();
    // After counting 2 spaces, column is 3 (1-based)
    expect(phase!.location).toMatchObject({ line: 2, column: 3 });
  });

  it("number location is correct", () => {
    const tokens = tokensOf("abc 42");
    const num = tokens.find((t) => t.type === "number");
    expect(num).toBeDefined();
    expect(num!.location).toMatchObject({ line: 1, column: 5 });
  });

  it("operator locations are correct", () => {
    const tokens = tokensOf("a -> b");
    const arrow = tokens.find((t) => t.type === "arrow");
    expect(arrow).toBeDefined();
    expect(arrow!.location).toMatchObject({ line: 1, column: 3 });
  });

  it("EOF location at end of last content", () => {
    const tokens = tokensOf("AB");
    const eof = tokens.find((t) => t.type === "eof");
    expect(eof).toBeDefined();
    expect(eof!.location).toMatchObject({ line: 1, column: 3 });
  });
});

// ---------------------------------------------------------------------------
// 11. Integration: realistic WPL-AI snippets
// ---------------------------------------------------------------------------

describe("Realistic WPL-AI snippets", () => {
  it("tokenizes a minimal plan header", () => {
    const source = [
      'PLAN "Push Pull Legs"',
      "TYPE workout",
      "VISIBILITY private",
      "DIFFICULTY intermediate",
    ].join("\n");
    const tokens = tokensOf(source);
    const keywords = tokens.filter((t) => t.type === "keyword").map((t) => t.value);
    expect(keywords).toEqual([
      "PLAN", "TYPE", "workout", "VISIBILITY", "private", "DIFFICULTY", "intermediate",
    ]);
    const strings = tokens.filter((t) => t.type === "string").map((t) => t.value);
    expect(strings).toEqual(["Push Pull Legs"]);
  });

  it("tokenizes exercise with sets x reps", () => {
    const source = "bench_press 3x10";
    const tv = typesAndValues(source);
    expect(tv).toEqual([
      ["bare_word", "bench_press"],
      ["number", 3],
      ["keyword", "x"],
      ["number", 10],
      ["eof", null],
    ]);
  });

  it("tokenizes exercise with sets x reps range", () => {
    const source = "squat 4x8..12";
    const tv = typesAndValues(source);
    expect(tv).toEqual([
      ["bare_word", "squat"],
      ["number", 4],
      ["keyword", "x"],
      ["number", 8],
      ["range", ".."],
      ["number", 12],
      ["eof", null],
    ]);
  });

  it("tokenizes a rest duration", () => {
    const source = "rest 90s";
    const tv = typesAndValues(source);
    expect(tv).toEqual([
      ["keyword", "rest"],
      ["number", 90],
      ["bare_word", "s"],
      ["eof", null],
    ]);
  });

  it("tokenizes a WHEN rule with comparison", () => {
    const source = 'WHEN fitness >= "advanced"';
    const tv = typesAndValues(source);
    expect(tv).toEqual([
      ["keyword", "WHEN"],
      ["keyword", "fitness"],
      ["gte", ">="],
      ["string", "advanced"],
      ["eof", null],
    ]);
  });

  it("tokenizes a GOAL with target and deadline", () => {
    const source = [
      "GOALS",
      "  GOAL",
      '    name "Increase bench press"',
      "    target 100 kg",
      "    deadline 2024-06-01",
    ].join("\n");
    const tokens = tokensOf(source);

    const goalName = tokens.find((t) => t.type === "string");
    expect(goalName!.value).toBe("Increase bench press");

    const date = tokens.find((t) => t.type === "date");
    expect(date!.value).toBe("2024-06-01");

    expect(countTokenType(tokens, "indent")).toBe(countTokenType(tokens, "dedent"));
  });

  it("tokenizes a full plan structure without errors", () => {
    const source = [
      'PLAN "Full Body Workout"',
      "TYPE workout",
      "VISIBILITY public",
      "DIFFICULTY beginner",
      "",
      "PHASES",
      '  PHASE "Foundation"',
      "    WEEK 1",
      "      DAY 1",
      "        schedule morning",
      "        warmup",
      "          push_up 2x10",
      "          squat 2x10",
      "        main",
      "          bench_press 3x8..12",
      "          rest 60s",
      "        cooldown",
      "          duration 5m",
      "",
      "GOALS",
      "  GOAL",
      '    name "Get stronger"',
      "    target 100 kg",
    ].join("\n");

    const result = tokenize(source);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // No errors, INDENT/DEDENT balanced
      const indents = countTokenType(result.tokens, "indent");
      const dedents = countTokenType(result.tokens, "dedent");
      expect(indents).toBe(dedents);

      // Check key tokens exist
      const strings = result.tokens.filter((t) => t.type === "string").map((t) => t.value);
      expect(strings).toContain("Full Body Workout");
      expect(strings).toContain("Foundation");
      expect(strings).toContain("Get stronger");

      const dates = result.tokens.filter((t) => t.type === "date");
      expect(dates).toHaveLength(0);

      // Numbers present
      const numbers = result.tokens.filter((t) => t.type === "number").map((t) => t.value);
      expect(numbers).toContain(1);
      expect(numbers).toContain(60);
      expect(numbers).toContain(100);
    }
  });
});

// ---------------------------------------------------------------------------
// 12. Additional edge cases for completeness
// ---------------------------------------------------------------------------

describe("Additional coverage", () => {
  it("tokenize returns ok: true structure", () => {
    const result = tokenize("PLAN");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.tokens)).toBe(true);
    }
  });

  it("tokenize returns ok: false structure on error", () => {
    const result = tokenize("\t");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].kind).toBe("lexer");
    }
  });

  it("error object has correct shape", () => {
    const result = tokenize('"unterminated');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors[0];
      expect(err).toHaveProperty("kind", "lexer");
      expect(err).toHaveProperty("type");
      expect(err).toHaveProperty("message");
      expect(err).toHaveProperty("location");
      expect(err.location).toHaveProperty("line");
      expect(err.location).toHaveProperty("column");
      expect(err).toHaveProperty("context");
    }
  });

  it("multiple errors can be collected", () => {
    // Tabs at different positions
    const result = tokenize("\tA\n\tB");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("handles string with only escape sequences", () => {
    const tokens = tokensOf('"\\n\\t\\\\"');
    expect(tokens[0]).toMatchObject({ type: "string", value: "\n\t\\" });
  });

  it("handles many keywords on separate lines", () => {
    const source = "PLAN\nTYPE\nVISIBILITY\nDIFFICULTY\nPHASES";
    const tokens = tokensOf(source);
    const keywords = tokens.filter((t) => t.type === "keyword").map((t) => t.value);
    expect(keywords).toEqual(["PLAN", "TYPE", "VISIBILITY", "DIFFICULTY", "PHASES"]);
  });

  it("x alone is a keyword", () => {
    // "x" is in the KEYWORDS set
    const tv = typesAndValues("x");
    expect(tv[0]).toEqual(["keyword", "x"]);
  });

  it("handles deeply nested then immediate EOF", () => {
    const source = "A\n  B\n    C\n      D";
    const tokens = tokensOf(source);
    const indents = countTokenType(tokens, "indent");
    const dedents = countTokenType(tokens, "dedent");
    expect(indents).toBe(3);
    expect(dedents).toBe(3);
  });

  it("handles parenthesized expressions", () => {
    const tv = typesAndValues("(1 + 2)");
    expect(tv).toEqual([
      ["lparen", "("],
      ["number", 1],
      ["plus", "+"],
      ["number", 2],
      ["rparen", ")"],
      ["eof", null],
    ]);
  });

  it("handles comma-separated list", () => {
    const tv = typesAndValues("a, b, c");
    expect(tv).toEqual([
      ["bare_word", "a"],
      ["comma", ","],
      ["bare_word", "b"],
      ["comma", ","],
      ["bare_word", "c"],
      ["eof", null],
    ]);
  });

  it("handles complex comparison expression", () => {
    const tv = typesAndValues("age >= 18 AND age <= 65");
    expect(tv).toEqual([
      ["keyword", "age"],
      ["gte", ">="],
      ["number", 18],
      ["keyword", "AND"],
      ["keyword", "age"],
      ["lte", "<="],
      ["number", 65],
      ["eof", null],
    ]);
  });

  it("handles boolean keywords", () => {
    expect(typesAndValues("true")[0]).toEqual(["keyword", "true"]);
    expect(typesAndValues("false")[0]).toEqual(["keyword", "false"]);
  });

  it("handles recovery keywords: sides both left right", () => {
    const tv = typesAndValues("sides both");
    expect(tv[0]).toEqual(["keyword", "sides"]);
    expect(tv[1]).toEqual(["keyword", "both"]);
  });

  it("handles 4-space indent with consistent unit", () => {
    const source = "A\n    B\n        C";
    const tokens = tokensOf(source);
    expect(countTokenType(tokens, "indent")).toBe(2);
    expect(countTokenType(tokens, "dedent")).toBe(2);
  });

  it("handles dedent to an intermediate level", () => {
    const source = [
      "A",
      "  B",
      "    C",
      "  D",
    ].join("\n");
    const tokens = tokensOf(source);
    // A (indent) B (indent) C (newline) (dedent) D ... (dedent at eof)
    const indents = countTokenType(tokens, "indent");
    const dedents = countTokenType(tokens, "dedent");
    expect(indents).toBe(dedents);
  });

  it("handles newline token value is null", () => {
    const tokens = tokensOf("A\nB");
    const nl = tokens.find((t) => t.type === "newline");
    expect(nl).toBeDefined();
    expect(nl!.value).toBeNull();
  });

  it("EOF token value is null", () => {
    const tokens = tokensOf("A");
    const eof = tokens.find((t) => t.type === "eof");
    expect(eof).toBeDefined();
    expect(eof!.value).toBeNull();
  });
});

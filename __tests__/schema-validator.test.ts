import { describe, it, expect } from "vitest";
import { validateSchema } from "../src/schema-validator.js";
import { tokenize } from "../src/lexer.js";
import { parse } from "../src/parser.js";
import { compile } from "../src/compiler.js";
import { WPL_AI_EXAMPLES } from "./fixtures.js";

// ---------------------------------------------------------------------------
// Helper: compile WPL source to JSON
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

// ---------------------------------------------------------------------------
// 1. Valid minimal JSON passes
// ---------------------------------------------------------------------------

describe("Schema validation - valid input", () => {
  it("validates minimal compiled WPL output", () => {
    const json = compileSource(`PLAN "Minimal"\nTYPE workout`);
    const result = validateSchema(json);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("validates compiled output with full header", () => {
    const json = compileSource(
      `PLAN "Full Header"\nTYPE hybrid\nVISIBILITY template\nDIFFICULTY advanced\nTAGS strength, cardio\nLANGUAGE en`,
    );
    const result = validateSchema(json);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Integration: all playground examples pass
// ---------------------------------------------------------------------------

describe("Schema validation - playground examples", () => {
  for (const example of WPL_AI_EXAMPLES) {
    it(`validates example: ${example.name}`, () => {
      const json = compileSource(example.source);
      const result = validateSchema(json);
      if (!result.valid) {
        const msgs = result.errors.map((e) => `${e.path}: ${e.message}`);
        throw new Error(
          `Schema validation failed for "${example.name}":\n${msgs.join("\n")}`,
        );
      }
      expect(result.valid).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Invalid inputs are rejected
// ---------------------------------------------------------------------------

describe("Schema validation - invalid input", () => {
  it("rejects missing $schema", () => {
    const result = validateSchema({ version: "1.0.0", plan: {} });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("$schema"))).toBe(true);
  });

  it("rejects wrong $schema URL", () => {
    const json = compileSource(`PLAN "Test"\nTYPE workout`);
    const modified = { ...json, $schema: "https://example.com/wrong" };
    const result = validateSchema(modified);
    expect(result.valid).toBe(false);
  });

  it("rejects wrong version", () => {
    const json = compileSource(`PLAN "Test"\nTYPE workout`);
    const modified = { ...json, version: "2.0.0" };
    const result = validateSchema(modified);
    expect(result.valid).toBe(false);
  });

  it("rejects unknown plan type", () => {
    const json = compileSource(`PLAN "Test"\nTYPE workout`);
    const plan = json.plan as Record<string, unknown>;
    plan.type = "invalid_type";
    const result = validateSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "enum")).toBe(true);
  });

  it("rejects unknown visibility", () => {
    const json = compileSource(`PLAN "Test"\nTYPE workout`);
    const plan = json.plan as Record<string, unknown>;
    plan.visibility = "secret";
    const result = validateSchema(json);
    expect(result.valid).toBe(false);
  });

  it("rejects unknown properties on root", () => {
    const json = compileSource(`PLAN "Test"\nTYPE workout`);
    (json as Record<string, unknown>).extra = true;
    const result = validateSchema(json);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.keyword === "additionalProperties"),
    ).toBe(true);
  });

  it("rejects unknown properties on plan", () => {
    const json = compileSource(`PLAN "Test"\nTYPE workout`);
    const plan = json.plan as Record<string, unknown>;
    plan.unknownField = "oops";
    const result = validateSchema(json);
    expect(result.valid).toBe(false);
  });

  it("rejects invalid day type", () => {
    const json = compileSource(`PLAN "Test"\nTYPE workout`);
    const plan = json.plan as Record<string, unknown>;
    plan.phases = [
      {
        id: "phase_1",
        name: "Test",
        order: 1,
        weeks: [
          {
            id: "week_1",
            name: "Week 1",
            order: 1,
            days: [
              {
                id: "day_1",
                day_of_week: 1,
                type: "invalid_day_type",
              },
            ],
          },
        ],
      },
    ];
    const result = validateSchema(json);
    expect(result.valid).toBe(false);
  });

  it("rejects invalid activity type", () => {
    const json = compileSource(`PLAN "Test"\nTYPE workout`);
    const plan = json.plan as Record<string, unknown>;
    plan.phases = [
      {
        id: "phase_1",
        name: "Test",
        order: 1,
        weeks: [
          {
            id: "week_1",
            name: "Week 1",
            order: 1,
            days: [
              {
                id: "day_1",
                day_of_week: 1,
                type: "training",
                blocks: [
                  {
                    id: "main_block",
                    type: "main",
                    order: 1,
                    activities: [
                      {
                        id: "exercise_1",
                        type: "yoga",
                        name: "Sun Salutation",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
    const result = validateSchema(json);
    expect(result.valid).toBe(false);
  });

  it("rejects missing required fields on goal", () => {
    const json = compileSource(`PLAN "Test"\nTYPE workout`);
    const plan = json.plan as Record<string, unknown>;
    plan.goals = [{ id: "goal_1" }];
    const result = validateSchema(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.keyword === "required")).toBe(true);
  });

  it("rejects invalid difficulty in metadata", () => {
    const json = compileSource(`PLAN "Test"\nTYPE workout`);
    const plan = json.plan as Record<string, unknown>;
    const metadata = plan.metadata as Record<string, unknown>;
    metadata.difficulty = "impossible";
    const result = validateSchema(json);
    expect(result.valid).toBe(false);
  });

  it("provides human-readable error messages", () => {
    const result = validateSchema({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    for (const err of result.errors) {
      expect(err.path).toBeDefined();
      expect(err.message).toBeDefined();
      expect(err.keyword).toBeDefined();
    }
  });
});

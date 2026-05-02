// ---------------------------------------------------------------------------
// Integration: compileWplAi() output validates cleanly against the WPL schema
// ---------------------------------------------------------------------------
// These tests exercise the compiler emission against the canonical
// @gymbile/wpl-validator. After the M2 Phase F compiler-emission fixes, all
// three core fixtures should produce validation.valid === true with no errors.

import { describe, it, expect } from "vitest";
import { compileWplAi } from "../src/index.js";
import { WPL_AI_EXAMPLES } from "./fixtures.js";

const fixtureById = (id: string) => {
  const fx = WPL_AI_EXAMPLES.find((f) => f.id === id);
  if (!fx) throw new Error(`fixture ${id} not found`);
  return fx;
};

describe("compileWplAi: validation against WPL schema", () => {
  for (const id of [
    "simple-upper-body",
    "hiit-circuit-personalization",
    "holistic-wellness-week",
    "nutrition-with-timing",
  ]) {
    it(`compiles ${id} to schema-valid JSON`, () => {
      const fx = fixtureById(id);
      const result = compileWplAi(fx.source);
      if (!result.ok) {
        throw new Error(`compile failed: ${result.summary}`);
      }
      if (!result.validation.valid) {
        // Surface the errors in the assertion so we can see them on failure.
        expect(result.validation.errors).toEqual([]);
      }
      expect(result.validation.valid).toBe(true);
    });
  }
});

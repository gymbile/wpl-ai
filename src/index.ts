// ---------------------------------------------------------------------------
// WPL-AI Public API Facade
// ---------------------------------------------------------------------------

import { tokenize } from "./lexer.js";
import { parse } from "./parser.js";
import { compile } from "./compiler.js";
import { validateSemantics, type SemanticWarning } from "./validator.js";
import { validate as validateWpl, type ValidationResult } from "@gymbile/wpl-validator";
import type { Document, PointerSourceMap } from "./types.js";
import type { WplError } from "./errors.js";
import { formatErrors, errorSummary } from "./errors.js";

// ---------------------------------------------------------------------------
// Main compile result type
// ---------------------------------------------------------------------------

export type CompileResult =
  | {
      ok: true;
      json: Record<string, unknown>;
      ast: Document;
      warnings: SemanticWarning[];
      validation: ValidationResult;
      pointerMap: PointerSourceMap;
    }
  | { ok: false; errors: WplError[]; formatted: string; summary: string };

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function compileWplAi(source: string): CompileResult {
  const lexResult = tokenize(source);
  if (!lexResult.ok) {
    return {
      ok: false,
      errors: lexResult.errors,
      formatted: formatErrors(lexResult.errors, source),
      summary: errorSummary(lexResult.errors),
    };
  }

  const parseResult = parse(lexResult.tokens);
  if (!parseResult.ok) {
    return {
      ok: false,
      errors: parseResult.errors,
      formatted: formatErrors(parseResult.errors, source),
      summary: errorSummary(parseResult.errors),
    };
  }

  const compileResult = compile(parseResult.document);
  if (!compileResult.ok) {
    return {
      ok: false,
      errors: compileResult.errors,
      formatted: formatErrors(compileResult.errors),
      summary: errorSummary(compileResult.errors),
    };
  }

  const warnings = validateSemantics(parseResult.document, source);
  const validation = validateWpl(compileResult.json);

  return {
    ok: true,
    json: compileResult.json,
    ast: parseResult.document,
    warnings,
    validation,
    pointerMap: compileResult.pointerMap,
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { Document, SourceRange, PointerSourceMap } from "./types.js";
export type { WplError, LexerError, ParseError, CompileError } from "./errors.js";
export type { SemanticWarning } from "./validator.js";
export { formatErrors, formatError, errorSummary } from "./errors.js";
export { parse } from "./parser.js";
export { compile } from "./compiler.js";
export { tokenize } from "./lexer.js";
export { ALL_EXERCISES, isKnownExercise } from "./exercises.js";
export { suggest, bestMatch, validate } from "./exercise-matcher.js";
export { validateVocabulary } from "./vocabulary-matcher.js";
export type { ValidationResult, ValidationError } from "@gymbile/wpl-validator";
export {
  GOAL_CATEGORIES,
  EXERCISE_CATEGORIES,
  CARDIO_MODALITIES,
  NUTRITION_CATEGORIES,
  MEDITATION_CATEGORIES,
  RECOVERY_CATEGORIES,
  HABIT_CATEGORIES,
  MUSCLE_GROUPS,
  EQUIPMENT,
  FITNESS_LEVELS,
  MEASUREMENT_METRICS,
  WEIGHT_UNITS,
  DISTANCE_UNITS,
  STREAK_TYPES,
} from "./vocabularies.js";

# Changelog

All notable changes to `@gymbile/wpl-ai`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1] — 2026-05-02

### Fixed
- `NutritionTiming` emission now matches the canonical schema. Previously emitted `{ type: "after_workout" | "before_workout" | "at_time" }` which the schema rejects. Now emits `{ type: "relative", reference: "<value>" }` for workout-relative timing and `{ type: "absolute", time: "<HH:MM>" }` for clock times.

## [1.1.0]

### Changed
- BREAKING: `CompileResult.schemaErrors` removed; replaced by `CompileResult.validation: ValidationResult` from `@gymbile/wpl-validator`.

### Added
- `CompileResult.pointerMap: Map<JSONPointer, SourceRange>` — maps JSON output positions back to DSL source ranges.

### Removed
- In-package `src/schema-validator.ts` and `src/schemas/v1.schema.json`. wpl-ai now depends on `@gymbile/wpl-validator` for schema and semantic validation.

## [1.0.0]

### Added
- Initial extraction from wpl.dev — full lexer/parser/compiler/DSL-semantic validator for the WPL-AI DSL. `compileWplAi(source)` produces canonical WPL JSON from whitespace-significant source text, with structured `WplError[]` for all four pipeline stages.

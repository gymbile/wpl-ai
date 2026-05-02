# Changelog

## [Unreleased]

### Fixed
- `NutritionTiming` emission now matches the canonical schema. Previously emitted `{ type: "after_workout" | "before_workout" | "at_time" }` which the schema rejects. Now emits `{ type: "relative", reference: "<value>" }` for workout-relative timing and `{ type: "absolute", time: "<HH:MM>" }` for clock times.

## [1.1.0]

### Changed
- BREAKING: `CompileResult.schemaErrors` removed; replaced by `CompileResult.validation: ValidationResult` from `@gymbile/wpl-validator`.

### Added
- `CompileResult.pointerMap: Map<JSONPointer, SourceRange>` — maps JSON output positions back to DSL source ranges.

### Removed
- In-package `src/schema-validator.ts` and `src/schemas/v1.schema.json`. wpl-ai now depends on `@gymbile/wpl-validator` for schema and semantic validation.

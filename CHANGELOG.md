# Changelog

All notable changes to `@gymbile/wpl-ai`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] — 2026-05-03

### Fixed
- DSL semantic warnings now point at the actual offending source position via AST node ranges. Previously `findInSource` returned the first substring match, so warnings on a vocabulary term that appeared multiple times always pointed at the first occurrence — wrong for any non-trivial plan.

### Added
- `pointerMap` now resolves sub-fields of activities (prescription, intensity, timing, weight, macros, intervals, recovery exercises, habit prescription) and top-level minor types (notifications, rendering, achievements, streaks). Previously stopped at activity granularity. Enables sub-field precision in the wpl.dev playground's inline diagnostics.

### Changed
- Lexer keyword set is now sourced from `GRAMMAR` tables instead of a hand-maintained list. No behavior change; eliminates a manual-sync hazard for new enum values.

## [1.1.2] — 2026-05-02

### Fixed
- The package's exported `validate` is now correctly re-exported from `@gymbile/wpl-validator`. Previously `validate` was the exercise-name fuzzy matcher (now `validateExercise`); the README documentation was inaccurate. Consumers following the README example with `validate(plan, { catalog })` now get the documented behavior.
- `compile()` distinguishes internal compiler errors (with a new `internal_error` type) from DSL constraint violations, surfacing real bugs instead of mislabeling them.
- DSL semantic validator no longer accepts muscle-group names (e.g. "biceps") as weight/distance units; it now emits an explicit warning when one appears in a unit position.

### Changed
- AST types are now re-exported from the package entry (`Phase`, `Week`, `Day`, `Block`, all `Activity` variants, `Goal`, `Personalization`, `Condition`, `Action`, etc.). Previously only `Document` was exposed; consumers had to deep-import.
- `Token.value: any` tightened to `string | number | null`. Zero `any` in `src/`.
- Renamed `Intensity.range` to `Intensity.bounds` to free `range` for source positions everywhere.
- Tarball size reduced ~3× by no longer shipping sourcemaps.
- Drop redundant `prepare` script (rely on `prepublishOnly`).
- Add `sideEffects: false` for better tree-shaking.
- TypeScript stricter: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch` enabled. Surfaced and fixed 24 real array/string-indexed-access correctness sites across lexer/parser/validator/errors.

### Docs
- New CONTRIBUTING.md with dev setup, layout, "how to add a DSL keyword" recipe, release flow.
- Backfilled `[1.0.0]` CHANGELOG entry; added Keep-a-Changelog header.
- README test/fixture counts corrected; `CompileResult.formatted`/`summary` docs clarified (plain text, not ANSI).

### CI
- Test matrix expanded to Node 18, 20, 22.

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

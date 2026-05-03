# Changelog

All notable changes to `@gymbile/wpl-ai`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.7.0] — 2026-05-03

### Added — DSL syntax for schema v1.2.0–v1.5.0 features

- **`PHASE "Name" <type> (N weeks):`** — optional periodization role between
  the phase name and duration. Recognized values:
  `accumulation | intensification | realization | deload | base | build | peak | recovery | transition`.
- **`WEEK <n> deload [<name>]:`** — optional `deload` flag right after the
  week number. Compiles to `Week.is_deload: true`.
- **Exercise `muscles` modifier** — two forms:
  - shorthand: `muscles chest, triceps` (all primary)
  - explicit: `muscles primary chest, triceps secondary front_delts`
  Compiles to `primary_muscles[]` and `secondary_muscles[]`.
- **Exercise `pattern` modifier** — `pattern push_horizontal`. Compiles to
  `movement_pattern`.
- **`subplan <plan_id> ["name"]`** — block-level activity that includes
  another plan by reference. Compiles to a `SubPlanActivity`.
- **Tempo auto-normalization** — the existing string-form tempo
  (`tempo 3 - 1 - 2 - 0`) is now normalized at compile time into the
  structured `Tempo` shape from schema v1.2.0
  (`{ eccentric, pause_bottom, concentric, pause_top, explosive_concentric? }`).
  Backwards-compatible: source unchanged, output upgraded.

### Notes
The DSL now produces output for every schema v1.2.0–v1.5.0 surface that is
authored per-line (phases, weeks, exercises, sub-plan inclusions). Per-plan
config-style additions — `athlete_thresholds`, cardio `intensity.zone_model`,
per-kg macros/calories, `weight: percentage_bodyweight`, telemetry source
prefixes, clinical condition prefixes — are accepted by the schema and
validators today; DSL syntax for them is deferred to a follow-up release
(consumers who need them can author the JSON directly or extend their AST).

## [1.6.0] — 2026-05-03

### Added
- `SubPlan` AST type (`kind: "sub_plan"`, `sub_plan_ref`, `name`). Joins the `Activity` union. Compiler emits `{ id, type: "sub_plan", name?, sub_plan_ref }` against schema v1.5.0.

### Notes
Targets schema v1.5.0. ASTs that don't construct `SubPlan` activities produce identical compiled JSON. 957/957 tests pass.

## [1.5.0] — 2026-05-03

### Added
- `WeightType` widened to include `"percentage_bodyweight"` (matches schema v1.4.0).

### Notes
Schema v1.4.0's macro/calorie unit additions (`g_per_kg`, `kcal_per_kg`, `multiplier_of_tdee`) are accepted by the schema but require DSL grammar work to produce — deferred to a future release. ASTs that pass these fields through directly compile cleanly today. 957/957 tests pass.

## [1.4.0] — 2026-05-03

### Added
- AST types for muscle-group taxonomy: `MuscleGroup`, `MovementPattern` enums; `Exercise` gains `primary_muscles`, `secondary_muscles`, `movement_pattern`. Compiler emits these when set.
- AST type `IntensityZoneModel` and `Intensity.zone_model` field. Compiler emits `zone_model` on the cardio prescription's intensity object when present.
- AST types `AthleteThresholds`, `OneRMEntry`; `Document.athlete_thresholds` field. Compiler emits the resolved thresholds at the plan level.
- `IntensityType` widened to include `"power"` (matches schema v1.3.0).

### Notes
Targets schema v1.3.0. Backwards compatible: ASTs that don't set the new fields produce identical compiled JSON. 957/957 tests pass.

## [1.3.0] — 2026-05-03

### Added
- AST type `PhaseType` (`accumulation | intensification | realization | deload | base | build | peak | recovery | transition`) and corresponding `Phase.type` field. Compiler emits this when set.
- `Week.is_deload` boolean on the AST. Compiler emits when true.
- `StructuredTempo` AST type (`eccentric`, `pause_bottom`, `concentric`, `pause_top`, `explosive_concentric`). `Exercise.tempo` widened from `string | null` to `Tempo | null` where `Tempo = string | StructuredTempo`. Both forms pass through the compiler unchanged.

### Notes
Targets schema v1.2.0. Backwards compatible: existing AST consumers that don't set the new fields produce identical compiled JSON.

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

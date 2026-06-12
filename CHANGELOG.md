# Changelog

All notable changes to `@gymbile/wpl-ai`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] — 2026-06-12

### BREAKING

- Unknown ALL-CAPS sections matching `REQUIRE*`, `CONTRA*`, `SAFETY*`,
  `PRECAUTION*`, `MEDICAL*`, or `CLEARANCE*` are now hard parse errors
  (previously skipped silently — a typo'd `REQUIREMENTS:` erased all
  contraindications with no trace).
- Unknown contraindication `severity` or `action` values are now hard parse
  errors (previously: severity dropped, action downgraded to `"exclude"`).

### Added

- `repairs: Repair[]` on the `ok: true` `CompileResult`: every tolerant
  normalisation the parser made is recorded — skipped sections/blocks, fuzzy
  exercise substitutions (from/to/similarity), uncataloged refs kept verbatim,
  lenient-default fabrications, discarded modifiers.
- Semantic warning for exercise refs absent from the `ALL_EXERCISES` catalog
  (the warning the 1.12 comments claimed existed but was never emitted).
- Contraindication `affects` lists are now resolved through the same
  exercise-ref machinery as body exercise refs (typo correction + repairs +
  catalog warnings). Previously `affects` parsing was non-functional.
- End-to-end safety-invariant test with `@gymbile/wpl-validator`'s `enforce()`:
  asserts a contraindicated exercise compiled through `compileWplAi` cannot
  survive a call to `enforce()`.

### Fixed

- A contraindication with an `affects` block followed immediately by another
  `contraindication` entry dropped the second entry silently; both are now
  parsed correctly.
- README: Node version requirement corrected from ≥18 to ≥20 (matching
  `package.json` `engines` since v1.8.1).
- README: `bestMatch` example replaced — the previous example claimed
  `bestMatch("dummbell_curl")` returns `'dumbbell_curl'`, but `dumbbell_curl`
  is not a catalog entry and the function returns `'dumbbell_row'`. New example
  uses the verified pair `bestMatch("bnech_press") → 'bench_press'`.

## [1.13.0] — 2026-05-13

### Added — vocabulary expansion (corpus-driven)

Adds 10 exercise references to `ALL_EXERCISES` based on the
unknown_exercise_ref tail in the wpl-eval v0.2.0 corpus audit. Every
entry below was observed as a genuine (non-typo) emission by at least
one model during the eval sweep:

- **UPPER_BODY**: `inverted_row`, `hangboard` (climbing-specific grip work)
- **REHAB_MOBILITY** (new category):
  - Rotator-cuff / shoulder rehab: `scapular_retraction`,
    `external_rotation`, `internal_rotation`, `prone_T`, `prone_Y`,
    `prone_W`
  - Pelvic floor / postpartum / pregnancy: `pelvic_tilt`,
    `diaphragmatic_breathing`

Effect on the wpl-eval v0.2.0 corpus: the served-rate denominator
is unchanged at 77/80 (these were already accepted via the tier-2
fallback in 1.12.0). What changes is the *quality* of the served
plans — downstream consumers now look these exercises up against
the canonical `ALL_EXERCISES` set rather than receiving them as
opaque strings flagged by semantic-validator warnings.

### Internal
- All 1227 tests pass (1 added for the v1.13 vocabulary additions).
- `exercises.ts` adds the `REHAB_MOBILITY` exported constant.

## [1.12.0] — 2026-05-13

### Fixed — silent week-truncation + LLM-emitted variant tolerance

A 10-commit series addressing parser bugs surfaced by the `wpl-eval`
v0.2.0 audit. Each commit log details the trial-recovery impact;
combined, they moved the eval's Lane B served rate from 37/80 (46%) to
77/80 (96%) with no LLM re-calls — purely from re-compiling the stored
result corpus against the patched compiler. The 0/80 unsafe headline
holds throughout.

**Parser — silent week-truncation**
- `rpe N..M` (and `rir N..M`) ranges now parse correctly at both call
  sites (exercise modifier and intensity block). Previously the range
  token leaked into downstream parsing and silently dropped subsequent
  WEEK blocks (`fix(parser): silent week-truncation on rpe/rir ranges`).
- `parseRepsSpec` consumes a trailing `s`/`m`/`seconds`/`minutes` time-
  unit suffix when followed by an exercise-modifier keyword, so
  `plank 3x30s rpe 6 rest 60 seconds` parses cleanly (`fix(parser):
  silent week-truncation on rpe/rir ranges, time-unit reps suffixes`).
- `parseExerciseOrSimpleActivity` consumes long-form time units
  (`cycling 10 minutes`) and trailing intensity modifiers on simple
  duration activities (`cycling 20m rpe 6`) — `fix(parser): silent
  week-truncation on simple-activity modifier leakage`.
- `parseDayBody` recovers from bare activity-type blocks at day level
  (`cardio:` / `recovery:` etc. without arguments). Skips the malformed
  sub-block instead of bailing on the entire document.

**Parser — exercise refs**
- `validateExerciseRef` short-circuits when the ref is a known cardio
  modality (running, walking, cycling, rowing, elliptical, swimming,
  jump_rope, hiking) — models commonly use these in sets×reps form
  (`fix(parser): accept cardio modalities as exercise refs`).
- `resolveExerciseRef` introduces two-tier resolution: bestMatch
  (Jaro-Winkler ≥ 0.85) auto-corrects clear typos (`bnech_press` →
  `bench_press`, `pushup` → `push_up`); below threshold, the ref is
  accepted as-is rather than failing the compile (`fix(parser):
  two-tier exercise-ref resolution`).

**Lexer — typographic tolerance**
- Unicode dashes (`–` U+2013, `—` U+2014) normalise to hyphen so
  `rpe 6–7` and `weeks 9–12` tokenise correctly.
- Typographic punctuation (`;`, `&`, `~`, `@`, ASCII apostrophe `'`,
  smart quotes, ellipsis `…`, `≤`, `≥`, middle dot, bullet) is
  skipped silently rather than emitting `invalid_character`.
- `N-M` between two numbers is now a range token (equivalent to `..`),
  so `rpe 6-7` and `8-12 reps` parse as ranges. `consumeNumberLike`
  no longer eats `-` mid-number unless the prefix looks like an ISO
  date or datetime.
- Trailing-dot number typos (`12.`, `7.`) emit the integer cleanly;
  the dangling dot is consumed silently by `tokenizeDots`.

**Parser — top-level recovery**
- `parseSections` skips unrecognised ALL-CAPS section keywords
  (`NUTRITION:`, `SUMMARY:`, `NOTES:`) silently instead of bailing.
  Models commonly append free-form prose annotations after the
  canonical `PHASES` section.
- `parsePlanType` falls back to the canonical default when TYPE is
  non-canonical (e.g. `TYPE summary`) instead of failing.

### Internal
- All 1226 existing tests pass. Two regression tests updated to
  reflect the new auto-correct semantics (typo'd exercise refs now
  resolve, not error). One new test added for the no-close-match
  fallthrough.

## [1.10.5] — 2026-05-04

### Fixed — 6 validator vocabulary gaps + 1 parser bug

- **#A — goal category `recovery`**: added `"recovery"` to `GOAL_CATEGORIES`; plans with `GOAL primary recovery:` no longer produce a spurious "Unknown goal category" warning.
- **#B — cardio modalities `walking` and `hiking`**: added both to `GRAMMAR.cardio_modality` (and thus `CARDIO_MODALITIES`); `cardio walking continuous:` and `cardio hiking continuous:` are now recognised.
- **#C — nutrition categories `post_workout`, `daily_target`, `pre_workout`, `intra_workout`**: added all four to `GRAMMAR.nutrition_category`; the existing `meal | snack | supplement | hydration` values are unchanged.
- **#D — habit category `water_intake`**: added to `GRAMMAR.habit_category`; the existing `hydration | sleep | steps | screen_time | custom` values are unchanged.
- **#E — percentage-weight unit `rm` false positive**: the weight-unit vocabulary check in the validator now runs only when `weight.type === "absolute"`; `percentage_1rm` / `percentage_bodyweight` / `bodyweight` weights no longer trigger an "Unknown weight unit" warning.
- **#G — dash-prefixed typed `MeasurementSpec` parsing**: `parseMeasurementList` now correctly handles `- questionnaire_score questionnaire psqi note "text"` as a single `MeasurementSpec` AST node (with `metric`, `questionnaire`, and `note` fields) rather than emitting four separate bare-string items.

## [1.10.4] — 2026-05-05

### Fixed — 7 silent-failure parser/lexer bugs

- **Bug 1 — digit-leading TAGS value (`531`)**: `TAGS 531, strength` now produces `tags: ["531", "strength"]` instead of `tags: []`; `parseTagList` accepts number tokens.
- **Bug 2 — digit-leading identifier in TAGS list (`1rm_estimate`)**: `TAGS strength_test, 1rm_estimate, powerlifting` no longer truncates after the digit-leading item; the lexer's `number + bare_word` sequence is glued into a single tag string.
- **Bug 3 — colon-qualified contraindication name (`acsm:cardiac_rehab_phase_2`)**: the parser now accepts `prefix:suffix` form in the contraindication-name slot; glues the colon token into a single qualified identifier string.
- **Bug 4 — unknown REQUIRES directive silently terminates block**: any unrecognised keyword or bare_word inside a REQUIRES block now produces `ParseError(invalid_structure)`: "Unknown REQUIRES directive: '...'. Recognized: contraindication, fitness, equipment, age, time_commitment."
- **Bug 5 — `trigger completion` (no-arg) swallows subsequent sections**: `parseTrigger` now raises `ParseError(invalid_structure)`: "Unsupported checkpoint trigger 'completion' — use 'at N weeks' or 'at N days'."
- **Bug 6 — unknown phase type silently drops the phase**: `parsePhase` detects non-recognized type keywords and raises `ParseError(invalid_structure)`: "Unknown phase type '<x>'. Allowed: accumulation, intensification, ..."
- **Bug 7 — `jogging 10m` in cooldown produces malformed recovery_exercise + phantom `m` orphan**: the cooldown block parser now routes `<bare_word> <number> <time_unit>` (nothing else on the line) to an inline `CardioActivity` with `modality`, `cardio_type: "continuous"`, and `total_duration` populated correctly.

## [1.10.3] — 2026-05-05

### Fixed

- **compiler: emit `progress.points_system` instead of `progress.points`** — the schema's `Progress` defines the field as `points_system`; the previous `points` key was silently rejected by the validator (`SCHEMA_VIOLATION /plan/progress`). Surfaced by the corpus runner's new post-compile validation.
- **compiler: thread activity-ID counter across blocks within a Day** — auto-IDs were previously per-block, so two blocks within the same day each starting an activity sequence produced colliding `exercise_1`, `sub_plan_1`, etc. Validators now correctly catch DUPLICATE_ID across blocks.

## [1.10.2] — 2026-05-04

### Fixed

- **validator: refresh MeasurementMetric + Questionnaire vocabulary to schema 1.6.0**: replace the legacy 16-value `MEASUREMENT_METRICS` array with the canonical 24-value `MeasurementMetric` enum; add `Questionnaire` (8 values) lookup set; recognize typed `MeasurementSpec` items in checkpoint measurements — `m.metric` is validated against the enum set, and `m.questionnaire` is validated against the questionnaire set when `metric === "questionnaire_score"`.

## [1.10.1] — 2026-05-04

### Fixed — corpus-driven bug fixes (5)

- **Bug 1 — `bodyweight` keyword in exercise modifier chain**: `pull_up 3x8 bodyweight` now emits `prescription.weight: { type: "bodyweight" }` (was silently dropped).
- **Bug 2 — Habit without explicit `target` emits phantom `target: { value: 0 }`**: `prescription.target` is now omitted entirely when no `target` keyword is present in the habit block.
- **Bug 3 — `LANGUAGE <non-en>` directive ignored**: the parsed language code is now passed through to `metadata.language`; `"en"` is the default only when the directive is absent.
- **Bug 4 — `1xAMRAP` emits phantom `reps.target: 0`**: AMRAP-only sets now emit `reps: { amrap: true }` with no `target` field.
- **Bug 5 — `modality foam_roll` creates phantom new exercise**: `foam_roll` (and `foam_roller`) are now resolved via the synonym map to `smr_foam_roll`, attaching correctly as a modality value instead of being mis-parsed as a fresh exercise name.

## [1.10.0] — 2026-05-04

### Added — DSL grammar surfaces for WPL schema v1.6.0

- **Contraindication severity + `require_clearance` action (DSL)**: new inline
  syntax `contraindication <name> severity <low|moderate|high> action <action>`
  alongside the legacy `contraindication <name> -> <action>` arrow form.
  `require_clearance` is now a valid action enum value in the grammar.
- **`Reps.amrap` (DSL)**: write `<sets>xAMRAP` or `<sets>x amrap` (any case)
  in a main-block exercise line; the compiler emits `prescription.reps.amrap: true`.
- **`ExercisePrescription.to_failure` (DSL)**: append `to_failure` anywhere in
  the exercise modifier chain (e.g. `bench_press 3x6 weight 80% rm to_failure`);
  the compiler emits `prescription.to_failure: true`.
- **`Weight.metric` qualifier (DSL)**: extend weight syntax with an optional
  `metric <value>` qualifier after the weight spec, e.g.
  `weight 80% rm metric training_max`. Recognized values: `1rm` → `1RM`,
  `e1rm` → `e1RM`, `training_max`, `daily_max`. Emits `prescription.weight.metric`.
- **`RecoveryExercise` modality/pnf/intensity_rpe/body_part (DSL)**: extend
  recovery exercise lines with: `modality <enum>`, `intensity <1-10>` (→
  `intensity_rpe`), `body <token>` (→ `body_part`). Optional pnf continuation
  line: `pnf <Ns> contract <Ns> relax <int> contractions`.
- **`Checkpoint.measurements` typed `MeasurementSpec` (DSL)**: items in the
  `measure:` list may now be bare `MeasurementMetric` enum tokens (→ `{ metric }`)
  or `<metric> questionnaire <questionnaire> [note "text"]` (→ `{ metric,
  questionnaire, note }`). Quoted strings and dash-prefixed items remain as plain
  strings (back-compat). `CHECKPOINT` keyword is now also accepted directly inside
  `PROGRESS` without a wrapping `checkpoints:` block.
- **Cardio `intensity.target.min_bpm` / `max_bpm` emission** (compiler fix):
  `intensity bpm 150..170` now compiles to
  `prescription.intensity: { type: "bpm", target: { min_bpm: 150, max_bpm: 170 } }`.
  Previously the parsed BPM bounds were registered as a source pointer but not
  emitted to the JSON output.

## [1.9.0] — 2026-05-04

### Added — emit support for WPL schema v1.6.0

- **`Contraindication.severity`** (`"low" | "moderate" | "high"`): new optional
  clinical-risk tier emitted alongside `condition` and `action`.
- **`Contraindication.action: "require_clearance"`**: expanded enum; compiler
  passes it through verbatim (was previously limited to `"exclude" | "modify"`).
- **`Reps.amrap: boolean`**: set `reps_amrap: true` on an Exercise AST node to
  emit `{ ..., amrap: true }` in `prescription.reps`.
- **`ExercisePrescription.to_failure: boolean`**: set `to_failure: true` on an
  Exercise AST node to emit it into the prescription block.
- **`Weight.metric`** (`"1RM" | "e1RM" | "training_max" | "daily_max"`):
  optional reference metric for `percentage_1rm` weight prescriptions.
- **`Checkpoint.measurements` typed items**: items may now be `string`
  (back-compat) or a `MeasurementSpec` object `{ metric, unit?, questionnaire?, note? }`.
  The compiler serialises both transparently.
- **`RecoveryExercise` v1.6.0 fields**: `modality` (`"static_stretch" |
  "dynamic_stretch" | "pnf" | "smr_foam_roll" | "smr_ball" | "breathwork" |
  "mobility_drill"`), `intensity_rpe` (1–10), `pnf` (`{ contraction_seconds,
  relax_seconds, contractions }`), `body_part` (free string).
- **New types in `src/types.ts`**: `ContraindicationSeverity`, `WeightMetric`,
  `RecoveryModality`, `PnfParams`, `MeasurementMetric` (22-value union),
  `Questionnaire` (8-value union), `MeasurementSpec`.
- **New vocabulary tables in `src/vocabularies.ts`**: synonym maps for
  `RecoveryModality`, `MeasurementMetric`, `Questionnaire`,
  `ContraindicationSeverity`, `ContraindicationAction`, and `WeightMetric`,
  each with 3–10 natural-language synonyms to canonical enum values.
- **Compiled `version` bumped to `"1.6.0"`** in all emitted documents.
- **21 new unit tests** in `__tests__/dsl-v16-features.test.ts` covering all
  new emit paths.

## [1.8.1] — 2026-05-03

### Fixed
- Restore browser compatibility. v1.7.0 switched the compiler from
  WebCrypto globals to `node:crypto` imports to make Node 18 CI happy,
  but that broke browser/Astro consumers (e.g. the wpl.dev playground)
  because Vite/Rollup cannot bundle `node:crypto`. Switch back to
  `globalThis.crypto.getRandomValues` and `crypto.randomUUID` —
  available in browsers, Deno, Bun, and Node 19+.

### Changed
- Engines pin tightened from `>=18` to `>=20` to match what
  WebCrypto-as-global actually requires (Node 19 added it; Node 20 is
  the active LTS as of late 2024). Dropped Node 18 from the CI matrix.
- Removed `@types/node` devDependency now that no source file imports
  from `node:*` modules.

## [1.8.0] — 2026-05-03

### Added — DSL syntax for the per-plan config-style schema features

- **`ATHLETE_THRESHOLDS` top-level section.** Compiles to
  `plan.athlete_thresholds`. Recognized fields: `hr_max`, `lthr`,
  `resting_hr`, `ftp`, `vo2max`, `body_weight`, `critical_pace_seconds_per_km`,
  and one or more `one_rm <exercise_ref> <value> [kg|lbs]` lines.
  Optional bare unit tokens (`bpm`, `watts`, `kg`, `lbs`) after the
  numeric value are allowed for human readability and ignored by the
  compiler — schema field names imply units.
- **`weight N% bw`** — new percentage-bodyweight syntax compiles to
  `weight: { type: "percentage_bodyweight", value: N, unit: "bw" }`.
  The `weight` parser now also recognizes `weight 80% rm` as a tighter
  spelling of `weight 80 percentage_1rm`. Existing forms unchanged.
- **`zone N model M`** in a cardio body — propagates to
  `intensity.zone_model` (schema v1.3.0+). Recognized models match the
  `intensity_zone_model` enum: `hr_3_zone_seiler`, `hr_5_zone`,
  `hr_7_zone`, `power_coggan_7_zone`, `pace_critical_speed`,
  `rpe_borg_10`, `rpe_borg_20`.
- **Per-kg macros.** `protein 1.6 .. 2.2 g_per_kg` (and the same for
  `carbs`, `fat`) compiles to `unit: "g_per_kg"`. The default `g` unit
  remains for backwards compatibility — existing fixtures unchanged.
- **Calorie units.** `calories 0.95 .. 1.05 multiplier_of_tdee` and
  `calories 30 .. 35 kcal_per_kg` are now accepted; default remains
  `kcal`.

### Changed
- AST: `MacroRange` widened from `[number, number]` to a 3-tuple
  `[number, number, MacroUnit]` with `MacroUnit = "g" | "g_per_kg"`.
  `Nutrition` gains optional `calories_unit: CalorieUnit`. The shape
  is internal to wpl-ai (not part of the public types surface).

### Notes
With Phase B done, every per-plan or per-line schema feature added in
v1.2.0–v1.5.0 is reachable from DSL syntax. Plans that used to require
hand-written JSON for athlete thresholds, body-weight load percentages,
cardio zone models, or per-kg nutrition are now first-class DSL.

966/966 tests pass.

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

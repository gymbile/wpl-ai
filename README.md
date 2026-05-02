# @gymbile/wpl-ai

[![CI](https://github.com/gymbile/wpl-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/gymbile/wpl-ai/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](LICENSE)

**Compiler for WPL-AI** — a human/LLM-friendly DSL that compiles to canonical [WPL](https://wpl.dev) (Wellness Plan Language) JSON.

WPL-AI is the textual authoring format. WPL JSON is the runtime format. This package bridges the two.

```
WPL-AI source ──[tokenize]──▶ Tokens ──[parse]──▶ AST ──[compile]──▶ WPL JSON
                                                                       │
                                                       ┌───────────────┴─────────────┐
                                                       ▼                             ▼
                                              [@gymbile/wpl-validator]      [your runtime]
                                              schema + semantic checks      (training app, ...)
```

---

## Where it fits in the WPL ecosystem

| Repo / Package | Role |
|---|---|
| [`gymbile/wpl`](https://github.com/gymbile/wpl) | Canonical JSON Schema, spec, conformance suite (source of truth) |
| **`@gymbile/wpl-ai` (this repo)** | DSL → WPL JSON compiler (textual authoring) |
| [`@gymbile/wpl-validator`](https://www.npmjs.com/package/@gymbile/wpl-validator) | Reference TypeScript validator (schema + semantic invariants) |
| [`wpl.dev`](https://wpl.dev) | Marketing site + interactive playground (consumes both) |

`@gymbile/wpl-ai` depends on `@gymbile/wpl-validator` to validate every successful compile output against the canonical schema and semantic rules.

---

## Installation

This package is distributed as a **GitHub-hosted dependency** (not currently published to npm).

```bash
npm install github:gymbile/wpl-ai
# or pin to a tag for reproducibility:
npm install github:gymbile/wpl-ai#v1.1.1
```

The package's `prepare` script runs `tsup` on install to produce `dist/` artifacts. Requires Node ≥18.

For local development against an unpublished branch, use `npm link`.

---

## Quick start

```ts
import { compileWplAi } from "@gymbile/wpl-ai";

const source = `
PLAN "Simple Upper Body"
TYPE workout
VISIBILITY public

GOALS
  GOAL primary strength:
    name "Build Upper Body Strength"

PHASES
  PHASE "Single Session" (1 weeks):
    WEEK 1:
      DAY Monday training 35m "Upper Body Focus":
        warmup:
          arm_circles 2m
        main straight_sets:
          push_up 3x8..12 rpe 7 rest 60 seconds
        cooldown:
          chest_stretch 30s x2 sides both
`;

const result = compileWplAi(source);

if (result.ok) {
  console.log("Plan:", result.json);
  console.log("Schema/semantic valid:", result.validation.valid);
  if (!result.validation.valid) {
    for (const err of result.validation.errors) {
      console.warn(`[${err.code}] ${err.path}: ${err.message}`);
    }
  }
} else {
  console.error(result.formatted); // Pretty-printed compile errors
}
```

---

## Public API

### `compileWplAi(source: string): CompileResult`

The main entry point. Runs the full pipeline (lex → parse → compile → semantic checks → schema/semantic validation) and returns a discriminated-union result.

```ts
type CompileResult =
  | {
      ok: true;
      json: Record<string, unknown>;        // Compiled WPL JSON
      ast: Document;                        // Parser AST (useful for tooling)
      warnings: SemanticWarning[];          // DSL-level vocabulary/consistency warnings
      validation: ValidationResult;         // Schema + semantic findings (re-exported from wpl-validator)
      pointerMap: PointerSourceMap;         // JSONPointer → SourceRange (see below)
    }
  | {
      ok: false;
      errors: WplError[];                   // Lex/parse/compile errors with source positions
      formatted: string;                    // Human-readable error report
      summary: string;                      // One-line summary
    };
```

**Success vs. failure semantics:**
- `ok: false` means the source was malformed — couldn't lex, parse, or compile to JSON. No JSON output exists.
- `ok: true` means the compile produced JSON. The JSON is then validated against the canonical schema; `result.validation.valid` indicates whether validation passed. **A successful compile can still produce schema-invalid JSON** (e.g., the user wrote a workout plan with no phases — that compiles but fails semantic validation).
- `warnings` are DSL-level advisory findings (unknown vocabulary, plan-type/activity-type inconsistencies). They don't make a plan invalid.

### Source position tracking

Every JSON node the compiler emits is recorded in `pointerMap` keyed by [RFC 6901 JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901), mapping to a `SourceRange` of character offsets in the original DSL source.

```ts
type SourceRange = { from: number; to: number };
type PointerSourceMap = Map<string, SourceRange>;

const range = result.pointerMap.get("/plan/phases/0/weeks/0/days/0");
// → { from: 142, to: 318 }   (or undefined if synthetic / not from source)
```

This is what lets the [wpl.dev playground](https://wpl.dev/playground) highlight validator errors at the right characters in the editor: validator emits `path: "/plan/phases/0/duration"`, the playground looks it up in the map, gets a range, and renders an inline squiggle.

Synthetic JSON nodes (e.g. `$schema` literal, default values) don't have a corresponding source range — those pointers are absent from the map. Consumers must tolerate `undefined` lookups.

### Error handling helpers

```ts
import { formatErrors, formatError, errorSummary } from "@gymbile/wpl-ai";
```

- **`formatErrors(errors, source?)`** — pretty-prints all errors with caret pointers + source context. Used in `result.formatted`.
- **`formatError(error, source?)`** — formats a single error.
- **`errorSummary(errors)`** — one-line count-by-type summary.

`WplError` is a union of three discriminated types (`LexerError`, `ParseError`, `CompileError`); each carries a `Location` with `line`/`column`/`offset`.

### Lower-level access

For tooling that wants to operate on intermediate stages (e.g., custom transformers, IDE integrations):

```ts
import { tokenize, parse, compile } from "@gymbile/wpl-ai";

const lex = tokenize(source);                 // → { ok, tokens? } | { ok: false, errors }
const ast = parse(lex.tokens);                // → { ok, document? } | { ok: false, errors }
const out = compile(ast.document);            // → { ok, json, pointerMap } | { ok: false, errors }
```

The high-level `compileWplAi` is just a façade over these stages.

### Validation re-exports

```ts
import {
  validate,                  // re-export from @gymbile/wpl-validator
  type ValidationResult,
  type ValidationError,
} from "@gymbile/wpl-ai";

// Validate already-compiled WPL JSON without re-compiling
const result = validate(plan, { catalog: { exercises: new Set([...]) } });
```

See [`@gymbile/wpl-validator`](https://www.npmjs.com/package/@gymbile/wpl-validator) for full validator API (rules, catalog support, error codes).

### Vocabulary utilities

The DSL accepts well-known vocabularies for goals, exercises, equipment, etc. These are exposed as both arrays (for enumeration) and Sets (for fast membership checks):

```ts
import {
  GOAL_CATEGORIES,           // ['weight_loss', 'muscle_gain', 'endurance', ...]
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
} from "@gymbile/wpl-ai";

import { ALL_EXERCISES, isKnownExercise } from "@gymbile/wpl-ai";
import { suggest, bestMatch, validate as validateExercise } from "@gymbile/wpl-ai";
import { validateVocabulary } from "@gymbile/wpl-ai";

isKnownExercise("push_up");                   // → true
suggest("pushp", { limit: 3 });               // → ['push_up', 'push_press', ...]
bestMatch("dummbell_curl");                   // → 'dumbbell_curl' (fuzzy)
```

`validateVocabulary` is what powers the DSL-level `SemanticWarning`s — it flags references to unknown vocabulary terms with suggestions for the closest match.

---

## DSL by example

The DSL is whitespace-significant and case-sensitive on keywords (uppercase) but tolerant on values.

### Minimal plan

```
PLAN "Minimal"
TYPE workout
VISIBILITY private

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday rest "Rest day":
```

### Workout with sets/reps + RPE

```
DAY Monday training 45m "Upper Body":
  main straight_sets:
    push_up 3x8..12 rpe 7 rest 60 seconds
    dumbbell_row 3x10 weight 10 kg rest 60 seconds
    overhead_press 3x8..10 weight 8 kg rest 90 seconds
```

- `3x8..12` — 3 sets of 8–12 reps (range)
- `rpe 7` — Rate of Perceived Exertion 7/10
- `weight 10 kg` — load
- `rest 60 seconds` — inter-set rest

### Cardio

```
main:
  cardio running continuous 20 minutes intensity heart_rate_zone 3
```

Cardio supports `continuous`, `intervals` (with patterns), and timed prescriptions. Intensity types: `heart_rate_zone`, `rpe`, `pace`.

### HIIT circuit with personalization

```
PERSONALIZATION
  RULES
    WHEN injury contains knee:
      replace jump_squat -> goblet_squat
    WHEN injury contains shoulder:
      exclude overhead_press

PHASES
  PHASE "HIIT Session" (1 weeks):
    WEEK 1:
      DAY Wednesday training 25m "Full Body HIIT":
        main circuit:
          rounds 4
          rest_between_rounds 90 seconds
          kettlebell_swing 3x12 rest 20 seconds
          jump_squat 3x10 rest 20 seconds
          burpee 3x8 rest 20 seconds
```

### Holistic plans (workout + nutrition + meditation + recovery + habits)

```
PLAN "Holistic Wellness Week"
TYPE hybrid

PHASES
  PHASE "Week 1" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Strength + Mindfulness":
        main:
          push_up 3x10 rest 60 seconds
        meditation mindfulness 10 minutes:
          name "Post-Workout Calm"
        nutrition post_workout:
          name "Recovery Shake"
          timing after_workout 30 minutes
          macros protein 25..30 g, carbs 40 g
        recovery stretching 15 minutes:
          chest_stretch 30s x2 sides both
        habit water_intake:
          target 8 glasses
          frequency daily
```

Three full reference fixtures live in [`__tests__/fixtures.ts`](__tests__/fixtures.ts):

- `simple-upper-body` — beginner workout
- `hiit-circuit-personalization` — intermediate HIIT with personalization rules
- `holistic-wellness-week` — full hybrid plan exercising every activity type

These same fixtures are used as integration tests asserting that the compiled JSON validates cleanly against the canonical schema.

---

## Pipeline architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  src/lexer.ts          — DSL → Tokens                                    │
│                          Tracks line, column, offset on every token      │
│                                                                           │
│  src/parser.ts         — Tokens → AST (Document)                         │
│                          AST nodes carry SourceRange (range field)       │
│                          ~3500 lines covering full grammar               │
│                                                                           │
│  src/grammar.ts        — Single-source-of-truth keyword/enum tables     │
│                          (parser, lexer, vocabularies all reference this)│
│                                                                           │
│  src/compiler.ts       — AST → WPL JSON                                  │
│                          Threads a CompileContext through emission sites │
│                          for pointer-to-source-range tracking            │
│                                                                           │
│  src/compile-context.ts — `withSegment(seg, ast, fn)` records the       │
│                           current JSON pointer + AST source range as the │
│                           compiler descends, then pops on exit.          │
│                                                                           │
│  src/validator.ts      — DSL-level semantic warnings                     │
│                          (plan-type vs. activity-type consistency, etc.) │
│                                                                           │
│  src/vocabularies.ts   — Canonical vocabulary lists (goal categories,   │
│                          muscle groups, equipment, etc.)                 │
│  src/vocabulary-matcher.ts — Fuzzy-match unknown terms to nearest known │
│  src/exercise-matcher.ts   — Same for exercises specifically            │
│  src/exercises.ts          — ALL_EXERCISES catalog                      │
│                                                                           │
│  src/index.ts          — Public façade                                   │
└──────────────────────────────────────────────────────────────────────────┘
```

All AST node types live in [`src/types.ts`](src/types.ts) (~70 exported interfaces/types). The error hierarchy is in [`src/errors.ts`](src/errors.ts).

---

## Two layers of validation

There are two **distinct** validation steps. Both run on every compile:

### 1. Compile-time semantic warnings (this package)

`validateSemantics()` walks the AST and emits `SemanticWarning[]` for:
- Unknown vocabulary terms (with closest-match suggestions)
- Activity types that don't fit the plan type (e.g., a `workout`-typed plan with only nutrition activities)
- Unrecognised exercise refs
- Other DSL-level coherence checks

These are **advisory** — they never make a compile fail. Surfaced in the playground as yellow squiggles.

### 2. Schema + semantic validation (`@gymbile/wpl-validator`)

After compile produces JSON, the validator runs two passes against the canonical schema:

- **Pass 1** — JSON Schema (Draft 2020-12) shape check via ajv
- **Pass 2** — semantic invariants (DUPLICATE_ID, UNRESOLVED_REF, INVALID_PRESCRIPTION, etc.)

Findings are returned as `result.validation: ValidationResult`. **Severity matters:** `error`-severity findings make `result.validation.valid === false`; `warning`-severity findings (e.g., `PHASE_DURATION_MISMATCH`) don't.

See [validator error codes](https://github.com/gymbile/wpl/blob/main/conformance/error-codes.md) for the full list.

---

## Development

```bash
git clone https://github.com/gymbile/wpl-ai.git
cd wpl-ai
npm install
npm test          # 942+ tests across lexer, parser, compiler, validator, integration
npm run typecheck # tsc --noEmit
npm run build     # tsup → dist/ (ESM + CJS + .d.ts + .d.cts)
```

Test layout:

| File | Coverage |
|---|---|
| `__tests__/lexer.test.ts` | 292 tests — every token type, edge cases, error positions |
| `__tests__/parser.test.ts` | 140 tests — every grammar production |
| `__tests__/grammar.test.ts` | Grammar table consistency |
| `__tests__/compiler.test.ts` | 168 tests — compiler emission shapes |
| `__tests__/compile-context.test.ts` | Pointer-tracking contract |
| `__tests__/validator.test.ts` | DSL-level semantic warnings |
| `__tests__/vocabularies.test.ts` | Vocabulary table integrity |
| `__tests__/exercise-matcher.test.ts` | Fuzzy matching, suggestions |
| `__tests__/integration.test.ts` | 107 end-to-end DSL → JSON tests |
| `__tests__/compileWplAi-validation.test.ts` | Compiled output validates against `@gymbile/wpl-validator` |
| `__tests__/pointer-map.test.ts` | Source ranges resolve to expected DSL substrings |

---

## Versioning & releases

| Version | Highlights |
|---|---|
| **1.1.1** | Fix `NutritionTiming` compiler emission (`relative`/`absolute` shape per schema); lex `before_workout`/`after_workout` keywords |
| **1.1.0** | Depend on `@gymbile/wpl-validator`; expose `pointerMap` on `CompileResult`; compiler emits schema-valid Activity shapes (prescription, name, target nesting); drops in-package `schema-validator.ts` |
| **1.0.0** | Initial extraction from wpl.dev — full lexer/parser/compiler/DSL-semantic validator |

See [`CHANGELOG.md`](CHANGELOG.md) for full release history.

Releases are tagged on the GitHub repo. Consumers using `github:gymbile/wpl-ai` get the latest commit on `main` by default; pin to `github:gymbile/wpl-ai#v1.1.1` for reproducibility.

---

## Stability

- **Public API surface**: `compileWplAi` and the types it returns are stable. Re-exports of validator types follow `@gymbile/wpl-validator`'s semver.
- **Lower-level exports** (`tokenize`, `parse`, `compile`, AST types in `Document`): semi-stable. Used by the wpl.dev playground; we won't break them lightly, but they're not as battle-tested as the high-level façade.
- **Vocabulary tables** can grow additively in minor releases. New categories don't break consumers, but ID strings won't be renamed within a major.
- **DSL grammar** is additive only within a major. New keywords/syntax may be added in minors; existing valid inputs continue to compile.
- **Output JSON shape** follows the canonical [WPL schema](https://wpl.dev/schemas/wpl/v1.schema.json). Schema changes are coordinated through `gymbile/wpl` releases.

---

## License

[Apache-2.0](LICENSE). Patent grant included.

"WPL" and "Wellness Plan Language" are trademarks of Gymbile. The compiler is open under the license above; implementations may declare conformance ("WPL-compatible") but may not be named "WPL" or imply endorsement by Gymbile. Forks must rename. See the [schema repo's trademark policy](https://github.com/gymbile/wpl#trademark) for details.

---

## Related

- 📖 [WPL Specification](https://github.com/gymbile/wpl/blob/main/spec/SPECIFICATION.md)
- 📐 [JSON Schema](https://github.com/gymbile/wpl/blob/main/schema/v1.schema.json)
- 🧪 [Conformance suite](https://github.com/gymbile/wpl/tree/main/conformance)
- 🌐 [wpl.dev](https://wpl.dev) — interactive playground
- 📦 [`@gymbile/wpl-validator`](https://www.npmjs.com/package/@gymbile/wpl-validator) — reference validator

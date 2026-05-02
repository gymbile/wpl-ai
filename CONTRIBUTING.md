# Contributing to @gymbile/wpl-ai

Thanks for your interest. This package is the reference TypeScript compiler for the WPL-AI DSL. It turns whitespace-significant source into canonical [WPL](https://wpl.dev) JSON, and depends on [`@gymbile/wpl-validator`](https://www.npmjs.com/package/@gymbile/wpl-validator) for downstream JSON validation.

## Dev setup

```bash
npm install
npm test          # vitest run (~940 tests)
npm run typecheck # tsc --noEmit, strict
npm run build     # tsup → dist/
```

Node.js >= 18 is required.

## Repo layout

```
src/
  index.ts              # public entry — exports compileWplAi() + AST types
  lexer.ts              # source string → Token[] (indent-aware)
  parser.ts             # Token[] → Document AST (recursive descent)
  compiler.ts           # Document AST → WPL JSON + pointerMap
  validator.ts          # DSL-level semantic warnings (vocabulary checks)
  compile-context.ts    # JSON-pointer + source-range tracker used by compiler
  grammar.ts            # GRAMMAR — single source of truth for keyword sets
  types.ts              # AST node interfaces (Document, Phase, Activity, …)
  errors.ts             # WplError union + factories + formatters
  vocabularies.ts       # GOAL_CATEGORIES, EQUIPMENT, MUSCLE_GROUPS, …
  vocabulary-matcher.ts # Jaro-Winkler fuzzy match for "did you mean…"
  exercises.ts          # canonical exercise library (push_up, squat, …)
  exercise-matcher.ts   # validateExercise() — fuzzy exercise-name validator
__tests__/              # vitest specs
  fixtures.ts           # reference DSL plans used by integration tests
```

The pipeline is **lex → parse → compile → validate**. Each stage produces a result object with `ok: boolean`; on failure no later stage runs. The top-level `compileWplAi()` is a façade that runs all four.

## Adding a new DSL keyword

The five-step recipe:

1. **Lexer** (`src/lexer.ts`) — add the literal to the keyword table or, if already covered by the identifier token rule, nothing to do.
2. **Grammar** (`src/grammar.ts`) — register the new keyword in the relevant `_SET` so it round-trips through tooling. `GRAMMAR` is the single source of truth: anything that "knows" the set of valid keywords (parser, validator, formatter) reads from here.
3. **Parser** (`src/parser.ts`) — extend the relevant `parseXyz()` function to consume the new keyword and produce the right AST node. Tighten the AST type in `types.ts` if needed.
4. **Compiler** (`src/compiler.ts`) — extend the corresponding `compileXyz()` function to emit the new field in WPL JSON. Use `ctx.withSegment(...)` so source-range mapping stays accurate.
5. **Validator** (`src/validator.ts`) — if the new keyword takes a vocabulary value, register the vocabulary check.

Then write tests:
- A lexer unit test (the new token is emitted at the right location).
- A parser unit test (the AST shape is correct for both happy-path and missing-args).
- A compiler unit test (the JSON shape is correct).
- A round-trip test in a fixture (see below).

## Adding a fixture

Reference fixtures live in [`__tests__/fixtures.ts`](__tests__/fixtures.ts) — each is a `{ name, source, expectedJson }` record. Integration tests in `compileWplAi-validation.test.ts` and `integration.test.ts` automatically pick them up: they assert that compilation succeeds **and** that the compiled JSON validates cleanly against `@gymbile/wpl-validator`.

Add a fixture when:
- A change touches a new combination of activity types or sections.
- A user-reported bug reproduces best as a complete plan rather than a unit test.

## Release flow

1. Bump `version` in `package.json` and add a `CHANGELOG.md` entry.
2. Commit, tag (`git tag vX.Y.Z`), push tag.
3. CI publishes to npm. (We do not run `npm publish` locally.)

## Code style

- TypeScript strict mode + `noUncheckedIndexedAccess`. No `any` in `src/`.
- Filenames are kebab-case.
- `GRAMMAR` (in `src/grammar.ts`) is the single source of truth for enum keywords. Don't hard-code keyword lists in lexer/parser — read from `GRAMMAR`.
- Source-range tracking is non-negotiable: every compiled JSON node should be reachable from `pointerMap`. Use `ctx.withSegment(...)` when emitting structured fields.
- Fixing a compiler warning (unused variable, unused import) in a file you touch is part of the change, not a separate cleanup.

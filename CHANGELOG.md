# Changelog

## [1.1.0]

### Changed
- BREAKING: `CompileResult.schemaErrors` removed; replaced by `CompileResult.validation: ValidationResult` from `@gymbile/wpl-validator`.

### Added
- `CompileResult.pointerMap: Map<JSONPointer, SourceRange>` — maps JSON output positions back to DSL source ranges.

### Removed
- In-package `src/schema-validator.ts` and `src/schemas/v1.schema.json`. wpl-ai now depends on `@gymbile/wpl-validator` for schema and semantic validation.

// ---------------------------------------------------------------------------
// WPL JSON Schema Validator (ajv-based)
// ---------------------------------------------------------------------------
// Validates compiled WPL JSON against the canonical JSON Schema.
// Uses a singleton Ajv instance so the schema is compiled once and reused.
// ---------------------------------------------------------------------------

import Ajv2020 from "ajv/dist/2020.js";
import schema from "./schemas/v1.schema.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SchemaValidationError {
  path: string;
  message: string;
  keyword: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaValidationError[];
}

// ---------------------------------------------------------------------------
// Singleton Ajv instance
// ---------------------------------------------------------------------------

let validateFn: ReturnType<Ajv2020["compile"]> | null = null;

function getValidateFn(): ReturnType<Ajv2020["compile"]> {
  if (!validateFn) {
    const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
    validateFn = ajv.compile(schema);
  }
  return validateFn;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function validateSchema(json: unknown): SchemaValidationResult {
  const validate = getValidateFn();
  const valid = validate(json);

  if (valid || !validate.errors) {
    return { valid: true, errors: [] };
  }

  const errors: SchemaValidationError[] = validate.errors.map((err) => ({
    path: err.instancePath || "/",
    message: formatAjvError(err),
    keyword: err.keyword,
  }));

  return { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

function formatAjvError(err: NonNullable<ReturnType<Ajv2020["compile"]>["errors"]>[number]): string {
  const path = err.instancePath || "(root)";

  switch (err.keyword) {
    case "required":
      return `${path} is missing required property '${(err.params as { missingProperty: string }).missingProperty}'`;
    case "additionalProperties":
      return `${path} has unknown property '${(err.params as { additionalProperty: string }).additionalProperty}'`;
    case "enum":
      return `${path} must be one of: ${((err.params as { allowedValues: unknown[] }).allowedValues ?? []).join(", ")}`;
    case "const":
      return `${path} must be ${JSON.stringify((err.params as { allowedValue: unknown }).allowedValue)}`;
    case "type":
      return `${path} must be of type ${(err.params as { type: string }).type}`;
    case "minimum":
      return `${path} must be >= ${(err.params as { limit: number }).limit}`;
    case "maximum":
      return `${path} must be <= ${(err.params as { limit: number }).limit}`;
    case "minLength":
      return `${path} must not be empty`;
    case "pattern":
      return `${path} does not match expected pattern`;
    case "oneOf":
      return `${path} must match exactly one activity/condition type`;
    default:
      return `${path} ${err.message ?? "is invalid"}`;
  }
}

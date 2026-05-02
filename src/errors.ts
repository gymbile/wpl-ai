// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

export interface Location {
  line: number;
  column: number;
  length?: number;
  /** Character offset into the original source (added for source-range tracking). */
  offset?: number;
}

// ---------------------------------------------------------------------------
// Lexer errors
// ---------------------------------------------------------------------------

export type LexerErrorType =
  | "invalid_character"
  | "unterminated_string"
  | "invalid_number"
  | "invalid_date"
  | "invalid_time"
  | "inconsistent_indentation"
  | "tab_character"
  | "unexpected_dedent";

export interface LexerError {
  kind: "lexer";
  type: LexerErrorType;
  message: string;
  location: Location;
  context: string | null;
}

// ---------------------------------------------------------------------------
// Parse errors
// ---------------------------------------------------------------------------

export type ParseErrorType =
  | "unexpected_token"
  | "unexpected_eof"
  | "missing_required"
  | "invalid_value"
  | "invalid_keyword"
  | "duplicate_section"
  | "invalid_structure"
  | "unknown_exercise_ref";

export interface ParseError {
  kind: "parse";
  type: ParseErrorType;
  message: string;
  location: Location | null;
  expected: string[] | null;
  got: string | null;
  suggestions: string[] | null;
}

// ---------------------------------------------------------------------------
// Compile errors
// ---------------------------------------------------------------------------

export type CompileErrorType =
  | "missing_section"
  | "invalid_reference"
  | "duration_mismatch"
  | "constraint_violation";

export interface CompileError {
  kind: "compile";
  type: CompileErrorType;
  message: string;
  path: string[] | null;
  details: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Union type
// ---------------------------------------------------------------------------

export type WplError = LexerError | ParseError | CompileError;

// ---------------------------------------------------------------------------
// Lexer error factories
// ---------------------------------------------------------------------------

export function lexerError(
  type: LexerErrorType,
  message: string,
  location: Location,
  context?: string,
): LexerError {
  return {
    kind: "lexer",
    type,
    message,
    location,
    context: context ?? null,
  };
}

export function invalidCharacter(char: string, location: Location): LexerError {
  return lexerError(
    "invalid_character",
    `Invalid character '${char}'`,
    location,
    `The character '${char}' is not allowed here`,
  );
}

export function unterminatedString(location: Location): LexerError {
  return lexerError(
    "unterminated_string",
    "Unterminated string literal",
    location,
    "Strings must be closed with a matching quote character",
  );
}

export function invalidNumber(text: string, location: Location): LexerError {
  return lexerError(
    "invalid_number",
    `Invalid number '${text}'`,
    location,
    "Expected a valid integer or decimal number",
  );
}

export function invalidDate(text: string, location: Location): LexerError {
  return lexerError(
    "invalid_date",
    `Invalid date '${text}'`,
    location,
    "Expected a date in YYYY-MM-DD format",
  );
}

export function invalidTime(text: string, location: Location): LexerError {
  return lexerError(
    "invalid_time",
    `Invalid time '${text}'`,
    location,
    "Expected a time in HH:MM or HH:MM:SS format",
  );
}

export function inconsistentIndentation(
  expected: number,
  got: number,
  location: Location,
): LexerError {
  return lexerError(
    "inconsistent_indentation",
    `Inconsistent indentation: expected ${expected} spaces, got ${got}`,
    location,
    "Use consistent indentation (2 spaces recommended)",
  );
}

export function tabCharacter(location: Location): LexerError {
  return lexerError(
    "tab_character",
    "Tab character found",
    location,
    "Use spaces instead of tabs for indentation",
  );
}

export function unexpectedDedent(location: Location): LexerError {
  return lexerError(
    "unexpected_dedent",
    "Unexpected decrease in indentation",
    location,
    "Indentation does not match any previous level",
  );
}

// ---------------------------------------------------------------------------
// Parse error factories
// ---------------------------------------------------------------------------

interface ParseErrorOpts {
  location?: Location | null;
  expected?: string[] | null;
  got?: string | null;
  suggestions?: string[] | null;
}

export function parseError(
  type: ParseErrorType,
  message: string,
  opts?: ParseErrorOpts,
): ParseError {
  return {
    kind: "parse",
    type,
    message,
    location: opts?.location ?? null,
    expected: opts?.expected ?? null,
    got: opts?.got ?? null,
    suggestions: opts?.suggestions ?? null,
  };
}

export function unexpectedToken(
  expected: string[],
  got: string,
  location: Location,
): ParseError {
  const expectedStr =
    expected.length === 1 ? expected[0] : `one of ${expected.join(", ")}`;
  return parseError("unexpected_token", `Unexpected token '${got}', expected ${expectedStr}`, {
    location,
    expected,
    got,
  });
}

export function unexpectedEof(expected: string[]): ParseError {
  const expectedStr =
    expected.length === 1 ? expected[0] : `one of ${expected.join(", ")}`;
  return parseError("unexpected_eof", `Unexpected end of input, expected ${expectedStr}`, {
    expected,
  });
}

export function missingRequired(
  field: string,
  section: string,
  location: Location,
): ParseError {
  return parseError("missing_required", `Missing required field '${field}' in ${section}`, {
    location,
    expected: [field],
  });
}

export function invalidValue(
  field: string,
  value: string,
  validValues: string[],
  location: Location,
): ParseError {
  return parseError(
    "invalid_value",
    `Invalid value '${value}' for '${field}', expected one of: ${validValues.join(", ")}`,
    {
      location,
      expected: validValues,
      got: value,
    },
  );
}

export function invalidKeyword(
  keyword: string,
  context: string,
  location: Location,
  validKeywords: string[],
): ParseError {
  return parseError(
    "invalid_keyword",
    `Unknown keyword '${keyword}' in ${context}`,
    {
      location,
      expected: validKeywords,
      got: keyword,
      suggestions: validKeywords,
    },
  );
}

export function duplicateSection(section: string, location: Location): ParseError {
  return parseError("duplicate_section", `Duplicate section '${section}'`, {
    location,
  });
}

export function invalidStructure(message: string, location: Location): ParseError {
  return parseError("invalid_structure", message, { location });
}

export function unknownExerciseRef(
  ref: string,
  location: Location,
  suggestions?: string[],
): ParseError {
  const base = `Unknown exercise reference '${ref}'`;
  const msg =
    suggestions && suggestions.length > 0
      ? `${base}. Did you mean: ${suggestions.join(", ")}?`
      : base;
  return parseError("unknown_exercise_ref", msg, {
    location,
    got: ref,
    suggestions: suggestions ?? null,
  });
}

// ---------------------------------------------------------------------------
// Compile error factories
// ---------------------------------------------------------------------------

interface CompileErrorOpts {
  path?: string[] | null;
  details?: Record<string, unknown> | null;
}

export function compileError(
  type: CompileErrorType,
  message: string,
  opts?: CompileErrorOpts,
): CompileError {
  return {
    kind: "compile",
    type,
    message,
    path: opts?.path ?? null,
    details: opts?.details ?? null,
  };
}

export function missingSectionError(section: string, planType: string): CompileError {
  return compileError("missing_section", `Missing required section '${section}' for ${planType}`, {
    path: [section],
  });
}

export function invalidReference(
  refType: string,
  refValue: string,
  path: string[],
): CompileError {
  return compileError(
    "invalid_reference",
    `Invalid ${refType} reference '${refValue}'`,
    { path },
  );
}

export function durationMismatch(
  headerDuration: string,
  computedDuration: string,
): CompileError {
  return compileError(
    "duration_mismatch",
    `Duration mismatch: header says ${headerDuration} but computed ${computedDuration}`,
    {
      details: { headerDuration, computedDuration },
    },
  );
}

// ---------------------------------------------------------------------------
// Source line display
// ---------------------------------------------------------------------------

function getSourceLine(source: string, line: number): string | null {
  const lines = source.split("\n");
  if (line < 1 || line > lines.length) return null;
  return lines[line - 1];
}

function formatSourcePointer(source: string, location: Location): string {
  const sourceLine = getSourceLine(source, location.line);
  if (sourceLine === null) return "";

  const lineNum = String(location.line);
  const gutter = `  ${lineNum} | `;
  const padding = " ".repeat(gutter.length + location.column - 1);
  const pointer =
    location.length && location.length > 1
      ? "^".repeat(location.length)
      : "^";

  return `\n${gutter}${sourceLine}\n${padding}${pointer}`;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function errorKindLabel(error: WplError): string {
  switch (error.kind) {
    case "lexer":
      return "[Lexer Error]";
    case "parse":
      return "[Parse Error]";
    case "compile":
      return "[Compile Error]";
  }
}

function errorLocation(error: WplError): Location | null {
  switch (error.kind) {
    case "lexer":
      return error.location;
    case "parse":
      return error.location;
    case "compile":
      return null;
  }
}

export function formatError(error: WplError, source?: string): string {
  const parts: string[] = [];

  // Kind prefix + message
  parts.push(`${errorKindLabel(error)} ${error.message}`);

  // Location
  const loc = errorLocation(error);
  if (loc) {
    parts.push(`  at line ${loc.line}, column ${loc.column}`);
  }

  // Lexer context hint
  if (error.kind === "lexer" && error.context) {
    parts.push(`  hint: ${error.context}`);
  }

  // Parse suggestions
  if (error.kind === "parse" && error.suggestions && error.suggestions.length > 0) {
    parts.push(`  did you mean: ${error.suggestions.join(", ")}?`);
  }

  // Source line display
  if (source && loc) {
    const pointer = formatSourcePointer(source, loc);
    if (pointer) {
      parts.push(pointer);
    }
  }

  return parts.join("\n");
}

export function formatErrors(errors: WplError[], source?: string): string {
  if (errors.length === 0) return "No errors.";
  if (errors.length === 1) return formatError(errors[0], source);

  return errors
    .map((error, i) => `${i + 1}. ${formatError(error, source)}`)
    .join("\n\n");
}

export function errorSummary(errors: WplError[]): string {
  if (errors.length === 0) return "No errors";

  return errors
    .map((error) => {
      const loc = errorLocation(error);
      const locStr = loc ? ` (line ${loc.line})` : "";
      return `${error.message}${locStr}`;
    })
    .join("; ");
}

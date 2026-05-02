// ---------------------------------------------------------------------------
// WPL-AI Lexer (ported from Elixir lexer.ex)
// ---------------------------------------------------------------------------
// Tokenizes WPL-AI source text with Python-style significant indentation,
// producing INDENT/DEDENT tokens for the parser.
//
// Features:
//   - Significant indentation (2 or 4 spaces, must be consistent)
//   - Keywords, identifiers, strings, numbers
//   - Dates (YYYY-MM-DD), times (HH:MM), datetimes
//   - Comments starting with #
//   - Operators and punctuation
// ---------------------------------------------------------------------------

import type { Location, LexerError } from "./errors.js";
import {
  invalidCharacter,
  unterminatedString,
  invalidNumber,
  invalidDate,
  invalidTime,
  inconsistentIndentation,
  tabCharacter,
  unexpectedDedent,
} from "./errors.js";

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

export type TokenType =
  | "indent"
  | "dedent"
  | "newline"
  | "eof"
  | "keyword"
  | "string"
  | "number"
  | "date"
  | "time"
  | "datetime"
  | "ident"
  | "bare_word"
  | "arrow"
  | "range"
  | "colon"
  | "comma"
  | "lparen"
  | "rparen"
  | "eq"
  | "neq"
  | "gte"
  | "lte"
  | "gt"
  | "lt"
  | "plus"
  | "minus"
  | "percent"
  | "slash"
  | "times";

export interface Token {
  type: TokenType;
  value: any;
  location: Location;
}

// ---------------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------------

const KEYWORDS: Set<string> = new Set([
  // Sections & directives
  "PLAN", "TYPE", "VISIBILITY", "DIFFICULTY", "DURATION", "TAGS",
  "LANGUAGE", "MIN_APP_VERSION", "SCHEMA",
  "GOALS", "GOAL", "REQUIRES", "PERSONALIZATION", "INPUTS", "RULES", "WHEN",
  "PHASES", "PHASE", "WEEK", "DAY",
  "PROGRESS", "NOTIFICATIONS", "RENDERING",
  // Priority
  "primary", "secondary",
  // Plan types
  "workout", "nutrition", "meditation", "recovery", "hybrid",
  // Visibility
  "private", "public", "template",
  // Difficulty
  "beginner", "intermediate", "advanced", "adaptive",
  // Day types
  "training", "rest", "active_recovery", "assessment",
  // Block types
  "warmup", "main", "cooldown", "education",
  // Block structures
  "circuit", "straight_sets", "superset", "emom", "amrap", "tabata",
  // Activity kinds
  "cardio", "habit",
  // Schedule
  "morning", "afternoon", "evening", "any", "strict", "flexible",
  // Requirements
  "age", "fitness", "equipment", "contraindication", "time",
  "required", "optional", "alternatives",
  // Goal fields
  "target", "deadline", "milestone", "reward", "badge", "at",
  // Common fields
  "name", "description",
  // Toggle
  "enabled", "disabled",
  // Progress
  "checkpoints", "points", "achievements", "streaks",
  "checkpoint", "trigger", "measure", "ask",
  "achievement", "condition",
  // Cardio / activity fields
  "total", "zone", "intensity", "duration", "guided", "audio",
  // Nutrition
  "timing", "suggestions", "protein", "carbs", "fat", "calories",
  // Habit
  "frequency", "reminders",
  // Block fields
  "rounds", "rest_between_rounds",
  // Day fields
  "schedule", "notes",
  // Logical
  "AND", "OR",
  // Comparison operators (keyword form)
  "contains", "not_contains",
  // Actions
  "reduce", "modify", "add", "replace", "exclude", "remove", "increase",
  // Scope
  "scope",
  "activity", "block", "day", "week", "phase", "plan",
  // Exercise params
  "rpe", "rir", "tempo", "rest", "weight",
  // Prepositions
  "before", "after", "in",
  // Time units
  "seconds", "minutes", "hours", "days", "weeks",
  // Weight units
  "kg", "lbs", "percentage_1rm",
  // Distance units
  "meters", "km", "miles",
  // Intensity types
  "heart_rate_zone", "bpm", "pace",
  // Weight types
  "bodyweight",
  // Measurement types
  "absolute", "relative", "percentage",
  // Booleans
  "true", "false",
  // Recovery
  "sides", "both", "left", "right",
  // Misc
  "rules", "types",
  "work",
  "x",
]);

// ---------------------------------------------------------------------------
// Lexer state
// ---------------------------------------------------------------------------

interface LexerState {
  source: string;
  pos: number;
  line: number;
  column: number;
  indentStack: number[];
  indentUnit: number | null;
  tokens: Token[];
  errors: LexerError[];
}

// ---------------------------------------------------------------------------
// Character helpers
// ---------------------------------------------------------------------------

function peek(state: LexerState, offset = 0): string | null {
  const target = state.pos + offset;
  if (target < state.source.length) {
    return state.source[target];
  }
  return null;
}

function advance(state: LexerState): void {
  state.pos++;
  state.column++;
}

function advanceBy(state: LexerState, n: number): void {
  state.pos += n;
  state.column += n;
}

function incrementLine(state: LexerState): void {
  state.line++;
  state.column = 1;
}

function loc(state: LexerState): Location {
  return { line: state.line, column: state.column, offset: state.pos };
}

function emitToken(state: LexerState, type: TokenType, value: any): void {
  state.tokens.push({ type, value, location: loc(state) });
}

function emitTokenAt(state: LexerState, type: TokenType, value: any, location: Location): void {
  state.tokens.push({ type, value, location });
}

function addError(state: LexerState, error: LexerError): void {
  state.errors.push(error);
}

function isDigit(c: string | null): boolean {
  return c !== null && c >= "0" && c <= "9";
}

function isAlpha(c: string | null): boolean {
  return c !== null && ((c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_");
}

function isIdentChar(c: string | null): boolean {
  return c !== null && (isAlpha(c) || isDigit(c) || c === "-" || c === ".");
}

// ---------------------------------------------------------------------------
// Number parsing
// ---------------------------------------------------------------------------

function parseNumber(text: string): { ok: true; value: number } | { ok: false } {
  if (text.includes(".")) {
    const num = parseFloat(text);
    if (!isNaN(num) && String(num) === text) {
      return { ok: true, value: num };
    }
    // Also accept cases like "1.0" which parseFloat handles but String(num) might differ
    if (!isNaN(num) && /^-?\d+\.\d+$/.test(text)) {
      return { ok: true, value: num };
    }
    return { ok: false };
  }
  const num = parseInt(text, 10);
  if (!isNaN(num) && String(num) === text) {
    return { ok: true, value: num };
  }
  return { ok: false };
}

// ---------------------------------------------------------------------------
// Regex patterns for date/time
// ---------------------------------------------------------------------------

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const NUMBER_WITH_UNIT_RE = /^-?\d+(\.\d+)?[smhd]$/;

// ---------------------------------------------------------------------------
// Skip blank lines and comments
// ---------------------------------------------------------------------------

function skipBlankLinesAndComments(state: LexerState): void {
  while (state.pos < state.source.length) {
    const c = peek(state);

    if (c === "\n") {
      advance(state);
      incrementLine(state);
      continue;
    }

    if (c === "#") {
      skipComment(state);
      continue;
    }

    // At start of line, check for whitespace-only-then-comment lines
    if (state.column === 1) {
      const rest = state.source.substring(state.pos);
      const match = rest.match(/^([ ]*)#/);
      if (match) {
        advanceBy(state, match[1].length);
        skipComment(state);
        continue;
      }
    }

    break;
  }
}

// ---------------------------------------------------------------------------
// Skip comment to end of line
// ---------------------------------------------------------------------------

function skipComment(state: LexerState): void {
  while (state.pos < state.source.length) {
    const c = peek(state);
    if (c === "\n") {
      emitToken(state, "newline", null);
      advance(state);
      incrementLine(state);
      return;
    }
    advance(state);
  }
  // Reached EOF inside comment - that is fine
}

// ---------------------------------------------------------------------------
// Indentation handling
// ---------------------------------------------------------------------------

function countLeadingSpaces(state: LexerState): number {
  let count = 0;
  while (state.pos < state.source.length) {
    const c = peek(state);
    if (c === " ") {
      advance(state);
      count++;
    } else if (c === "\t") {
      const l = loc(state);
      addError(state, tabCharacter(l));
      advance(state);
      count += 4;
    } else {
      break;
    }
  }
  return count;
}

function handleIndent(state: LexerState, spaces: number): void {
  const currentIndent = state.indentStack[state.indentStack.length - 1];
  const diff = spaces - currentIndent;

  if (state.indentUnit === null) {
    // First indentation - set the unit (2 or 4 spaces)
    if (diff === 2 || diff === 4) {
      state.indentUnit = diff;
    } else {
      const l = loc(state);
      addError(state, inconsistentIndentation(2, diff, l));
    }
  } else if (diff !== state.indentUnit) {
    const l = loc(state);
    addError(state, inconsistentIndentation(state.indentUnit, diff, l));
  }

  emitToken(state, "indent", spaces);
  state.indentStack.push(spaces);
}

function handleDedent(state: LexerState, targetSpaces: number): void {
  while (true) {
    const current = state.indentStack[state.indentStack.length - 1];

    if (current === targetSpaces) {
      return;
    }

    if (state.indentStack.length <= 1) {
      // Cannot dedent below 0
      const l = loc(state);
      addError(state, unexpectedDedent(l));
      return;
    }

    const below = state.indentStack[state.indentStack.length - 2];

    if (below >= targetSpaces) {
      emitToken(state, "dedent", below);
      state.indentStack.pop();
      // Continue loop to keep unwinding
    } else {
      // Target spaces does not match any indent level
      const l = loc(state);
      addError(state, unexpectedDedent(l));
      return;
    }
  }
}

function handleIndentation(state: LexerState): void {
  const spaces = countLeadingSpaces(state);
  const currentIndent = state.indentStack[state.indentStack.length - 1];

  if (spaces > currentIndent) {
    handleIndent(state, spaces);
  } else if (spaces < currentIndent) {
    handleDedent(state, spaces);
  }
  // else: same indentation level, nothing to do
}

// ---------------------------------------------------------------------------
// String tokenization
// ---------------------------------------------------------------------------

function tokenizeString(state: LexerState): void {
  const startLoc = loc(state);
  advance(state); // skip opening quote

  const parts: string[] = [];

  while (state.pos < state.source.length) {
    const c = peek(state)!;

    if (c === "\n") {
      addError(state, unterminatedString(startLoc));
      return;
    }

    if (c === '"') {
      advance(state); // skip closing quote
      emitTokenAt(state, "string", parts.join(""), startLoc);
      return;
    }

    if (c === "\\") {
      advance(state);
      const escaped = peek(state);
      if (escaped === null) {
        addError(state, unterminatedString(startLoc));
        return;
      }
      switch (escaped) {
        case '"':
          parts.push('"');
          break;
        case "\\":
          parts.push("\\");
          break;
        case "n":
          parts.push("\n");
          break;
        case "t":
          parts.push("\t");
          break;
        default:
          parts.push(escaped);
          break;
      }
      advance(state);
      continue;
    }

    parts.push(c);
    advance(state);
  }

  // Reached EOF without closing quote
  addError(state, unterminatedString(startLoc));
}

// ---------------------------------------------------------------------------
// Number-like tokenization (numbers, dates, times, datetimes)
// ---------------------------------------------------------------------------

function consumeNumberLike(state: LexerState): string {
  const parts: string[] = [];

  while (state.pos < state.source.length) {
    const c = peek(state)!;

    // Colon - only valid in time/datetime patterns
    if (c === ":") {
      const accStr = parts.join("");
      // Valid time pattern: 2 digits before colon OR datetime pattern: date + T + 2 digits
      if (/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(accStr) || /^\d{2}$/.test(accStr)) {
        parts.push(c);
        advance(state);
        continue;
      }
      // Not a time pattern - stop (e.g., "WEEK 1:")
      break;
    }

    // Dot - single dot is decimal, ".." is range operator
    if (c === ".") {
      if (peek(state, 1) === ".") {
        // Range operator - stop
        break;
      }
      parts.push(c);
      advance(state);
      continue;
    }

    // Digits, minus, T, Z
    if (isDigit(c) || c === "-" || c === "T" || c === "Z") {
      parts.push(c);
      advance(state);
      continue;
    }

    // Trailing unit letters: s, m, h, d
    if ((c === "s" || c === "m" || c === "h" || c === "d") && parts.length > 0) {
      const next = peek(state, 1);
      if (next !== null && next >= "a" && next <= "z") {
        // It is an identifier continuation, stop here
        break;
      }
      // Consume the unit letter and stop
      parts.push(c);
      advance(state);
      break;
    }

    // Anything else ends the number-like token
    break;
  }

  return parts.join("");
}

function tokenizeNumber(state: LexerState): void {
  const startLoc = loc(state);
  const text = consumeNumberLike(state);

  // DateTime: 2024-01-15T10:30 or 2024-01-15T10:30:00Z
  if (DATETIME_RE.test(text)) {
    emitTokenAt(state, "datetime", text, startLoc);
    return;
  }

  // Date: YYYY-MM-DD
  if (DATE_RE.test(text)) {
    if (isValidDate(text)) {
      emitTokenAt(state, "date", text, startLoc);
    } else {
      addError(state, invalidDate(text, startLoc));
    }
    return;
  }

  // Time: HH:MM
  if (TIME_RE.test(text)) {
    if (isValidTime(text)) {
      emitTokenAt(state, "time", text, startLoc);
    } else {
      addError(state, invalidTime(text, startLoc));
    }
    return;
  }

  // Number with unit suffix (e.g., 60s, 2m, 45h, 7d)
  if (NUMBER_WITH_UNIT_RE.test(text)) {
    const numStr = text.slice(0, -1);
    const unit = text.slice(-1);
    const parsed = parseNumber(numStr);
    if (parsed.ok) {
      emitTokenAt(state, "number", parsed.value, startLoc);
      emitToken(state, "bare_word", unit);
    } else {
      addError(state, invalidNumber(text, startLoc));
    }
    return;
  }

  // Plain number
  const parsed = parseNumber(text);
  if (parsed.ok) {
    emitTokenAt(state, "number", parsed.value, startLoc);
  } else {
    addError(state, invalidNumber(text, startLoc));
  }
}

// ---------------------------------------------------------------------------
// Date / time validation
// ---------------------------------------------------------------------------

function isValidDate(text: string): boolean {
  const [yearStr, monthStr, dayStr] = text.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Use Date constructor for a simple validity check
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function isValidTime(text: string): boolean {
  const [hourStr, minStr] = text.split(":");
  const hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  return hour >= 0 && hour <= 23 && min >= 0 && min <= 59;
}

// ---------------------------------------------------------------------------
// Identifier / keyword tokenization
// ---------------------------------------------------------------------------

function consumeIdentifier(state: LexerState): string {
  const parts: string[] = [];

  while (state.pos < state.source.length) {
    const c = peek(state)!;

    // Digit - but if accumulator is exactly "x", stop (for 3x10 pattern)
    if (isDigit(c)) {
      const accStr = parts.join("");
      if (accStr === "x") {
        return accStr;
      }
      parts.push(c);
      advance(state);
      continue;
    }

    // Alpha, underscore, hyphen, dot
    if (isAlpha(c) || c === "-" || c === ".") {
      parts.push(c);
      advance(state);
      continue;
    }

    break;
  }

  return parts.join("");
}

function tokenizeIdentifier(state: LexerState): void {
  const startLoc = loc(state);
  const text = consumeIdentifier(state);

  let tokenType: TokenType;
  if (KEYWORDS.has(text)) {
    tokenType = "keyword";
  } else if (text.length > 0 && text[0] >= "A" && text[0] <= "Z") {
    // Capitalized identifiers are treated as keywords
    tokenType = "keyword";
  } else {
    tokenType = "bare_word";
  }

  emitTokenAt(state, tokenType, text, startLoc);
}

// ---------------------------------------------------------------------------
// Minus / arrow
// ---------------------------------------------------------------------------

function tokenizeMinusOrArrow(state: LexerState): void {
  const next = peek(state, 1);

  if (next === ">") {
    emitToken(state, "arrow", "->");
    advanceBy(state, 2);
    return;
  }

  if (isDigit(next)) {
    tokenizeNumber(state);
    return;
  }

  emitToken(state, "minus", "-");
  advance(state);
}

// ---------------------------------------------------------------------------
// Dots (range operator or start of identifier)
// ---------------------------------------------------------------------------

function tokenizeDots(state: LexerState): void {
  if (peek(state, 1) === ".") {
    emitToken(state, "range", "..");
    advanceBy(state, 2);
    return;
  }

  // Single dot - part of an identifier or slug
  tokenizeIdentifier(state);
}

// ---------------------------------------------------------------------------
// Equality / comparison operators
// ---------------------------------------------------------------------------

function tokenizeEquals(state: LexerState): void {
  if (peek(state, 1) === "=") {
    emitToken(state, "eq", "==");
    advanceBy(state, 2);
  } else {
    emitToken(state, "eq", "=");
    advance(state);
  }
}

function tokenizeNotEquals(state: LexerState): void {
  if (peek(state, 1) === "=") {
    emitToken(state, "neq", "!=");
    advanceBy(state, 2);
  } else {
    const l = loc(state);
    addError(state, invalidCharacter("!", l));
    advance(state);
  }
}

function tokenizeGreater(state: LexerState): void {
  if (peek(state, 1) === "=") {
    emitToken(state, "gte", ">=");
    advanceBy(state, 2);
  } else {
    emitToken(state, "gt", ">");
    advance(state);
  }
}

function tokenizeLess(state: LexerState): void {
  if (peek(state, 1) === "=") {
    emitToken(state, "lte", "<=");
    advanceBy(state, 2);
  } else {
    emitToken(state, "lt", "<");
    advance(state);
  }
}

// ---------------------------------------------------------------------------
// Line content tokenization
// ---------------------------------------------------------------------------

function tokenizeLineContent(state: LexerState): void {
  while (state.pos < state.source.length) {
    const c = peek(state)!;

    switch (c) {
      // End of line
      case "\n":
        emitToken(state, "newline", null);
        advance(state);
        incrementLine(state);
        return;

      // Whitespace within line - skip
      case " ":
        advance(state);
        continue;

      // Tab - error
      case "\t": {
        const l = loc(state);
        addError(state, tabCharacter(l));
        advance(state);
        continue;
      }

      // Comment - skip to end of line
      case "#":
        skipComment(state);
        return;

      // String literal
      case '"':
        tokenizeString(state);
        continue;

      // Punctuation / operators
      case ":":
        emitToken(state, "colon", ":");
        advance(state);
        continue;

      case ",":
        emitToken(state, "comma", ",");
        advance(state);
        continue;

      case "(":
        emitToken(state, "lparen", "(");
        advance(state);
        continue;

      case ")":
        emitToken(state, "rparen", ")");
        advance(state);
        continue;

      case "/":
        emitToken(state, "slash", "/");
        advance(state);
        continue;

      case "%":
        emitToken(state, "percent", "%");
        advance(state);
        continue;

      case "+":
        emitToken(state, "plus", "+");
        advance(state);
        continue;

      case "*":
        emitToken(state, "times", "*");
        advance(state);
        continue;

      case "-":
        tokenizeMinusOrArrow(state);
        continue;

      case ".":
        tokenizeDots(state);
        continue;

      case "=":
        tokenizeEquals(state);
        continue;

      case "!":
        tokenizeNotEquals(state);
        continue;

      case ">":
        tokenizeGreater(state);
        continue;

      case "<":
        tokenizeLess(state);
        continue;

      default:
        if (isDigit(c)) {
          tokenizeNumber(state);
          continue;
        }

        if (isAlpha(c)) {
          tokenizeIdentifier(state);
          continue;
        }

        // Invalid character
        {
          const l = loc(state);
          addError(state, invalidCharacter(c, l));
          advance(state);
        }
        continue;
    }
  }
}

// ---------------------------------------------------------------------------
// Line tokenization (indentation + content)
// ---------------------------------------------------------------------------

function tokenizeLine(state: LexerState): void {
  if (state.pos >= state.source.length) return;

  // Handle indentation at start of line
  if (state.column === 1) {
    handleIndentation(state);
  }

  // Tokenize the rest of the line
  tokenizeLineContent(state);
}

// ---------------------------------------------------------------------------
// EOF handling
// ---------------------------------------------------------------------------

function emitRemainingDedents(state: LexerState): void {
  while (state.indentStack.length > 1) {
    state.indentStack.pop();
    const below = state.indentStack[state.indentStack.length - 1];
    emitToken(state, "dedent", below);
  }
}

function emitEof(state: LexerState): void {
  emitRemainingDedents(state);
  emitToken(state, "eof", null);
}

// ---------------------------------------------------------------------------
// Finalization - remove redundant consecutive newlines
// ---------------------------------------------------------------------------

function removeRedundantNewlines(tokens: Token[]): Token[] {
  const result: Token[] = [];
  let lastType: TokenType | null = null;

  for (const token of tokens) {
    if (token.type === "newline" && lastType === "newline") {
      continue; // skip consecutive newlines
    }
    result.push(token);
    lastType = token.type;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function tokenize(
  source: string,
): { ok: true; tokens: Token[] } | { ok: false; errors: LexerError[] } {
  // Normalize line endings
  source = source.replace(/\r\n/g, "\n");

  const state: LexerState = {
    source,
    pos: 0,
    line: 1,
    column: 1,
    indentStack: [0],
    indentUnit: null,
    tokens: [],
    errors: [],
  };

  // Main tokenization loop (iterative)
  while (state.pos < state.source.length) {
    skipBlankLinesAndComments(state);

    if (state.pos >= state.source.length) break;

    tokenizeLine(state);
  }

  emitEof(state);

  if (state.errors.length > 0) {
    return { ok: false, errors: state.errors };
  }

  const tokens = removeRedundantNewlines(state.tokens);
  return { ok: true, tokens };
}

// ---------------------------------------------------------------------------
// WPL-AI Recursive Descent Parser (ported from Elixir parser.ex)
// ---------------------------------------------------------------------------
// Builds an AST from tokens produced by the Lexer.
// Uses mutable ParseState for efficiency.
// ---------------------------------------------------------------------------

import type {
  Document,
  Header,
  PlanType,
  Visibility,
  Difficulty,
  Duration,
  TimeUnit,
  Goal,
  GoalPriority,
  MeasurementType,
  Target,
  Milestone,
  Requirements,
  Equipment,
  Contraindication,
  ContraindicationAction,
  ContraindicationSeverity,
  TimeCommitment,
  Personalization,
  Input,
  InputType,
  Condition,
  ComparisonOp,
  Action,
  ActionScope,
  Rule,
  Phase,
  Week,
  Day,
  DayType,
  SchedulePref,
  ScheduleFlex,
  Block,
  BlockType,
  BlockStructure,
  Activity,
  RepsSpec,
  Weight,
  WeightType,
  Cardio,
  CardioType,
  Intensity,
  IntervalPattern,
  Nutrition,
  NutritionTiming,
  MacroRange,
  Macros,
  Meditation,
  Recovery,
  RecoveryExercise,
  RecoverySides,
  PnfParams,
  Habit,
  Progress,
  Checkpoint,
  CheckpointTrigger,
  PointsConfig,
  PointsRule,
  Achievement,
  StreaksConfig,
  Notification,
  Rendering,
  MeasurementSpec,
  MeasurementMetric,
} from "./types.js";

import type { Location, WplError, ParseError } from "./errors.js";
import {
  unexpectedToken,
  missingRequired,
  invalidValue,
  unknownExerciseRef,
  invalidStructure,
  weekHasNoValidDays,
} from "./errors.js";

import { validateExercise } from "./exercise-matcher.js";
import type { Token, TokenType } from "./lexer.js";
import {
  GRAMMAR,
  PLAN_TYPE_SET,
  VISIBILITY_SET,
  DIFFICULTY_SET,
  GOAL_PRIORITY_SET,
  MEASUREMENT_TYPE_SET,
  CONTRAINDICATION_ACTION_SET,
  CONTRAINDICATION_SEVERITY_SET,
  INPUT_TYPE_SET,
  ACTION_SCOPE_SET,
  DAY_NAME_SET,
  DAY_TYPE_SET,
  BLOCK_TYPE_SET,
  BLOCK_STRUCTURE_SET,
  CARDIO_TYPE_SET,
  RECOVERY_SIDES_SET,
  TIME_UNIT_SHORT_SET,
  SCHEDULE_PREF_SET,
  SCHEDULE_FLEX_SET,
  PHASE_TYPE_SET,
  MUSCLE_GROUP_SET,
  MOVEMENT_PATTERN_SET,
  INTENSITY_ZONE_MODEL_SET,
  RECOVERY_MODALITY_SET_GRAMMAR,
} from "./grammar.js";

import {
  WEIGHT_METRIC_SYNONYMS,
  MEASUREMENT_METRIC_ENUM_SET,
  QUESTIONNAIRE_SET,
  RECOVERY_MODALITY_SYNONYMS,
} from "./vocabularies.js";

// ---------------------------------------------------------------------------
// Parse State (mutable)
// ---------------------------------------------------------------------------

interface ParseState {
  tokens: Token[];
  pos: number;
  errors: ParseError[];
}

// ---------------------------------------------------------------------------
// Token access helpers
// ---------------------------------------------------------------------------

const EOF_TOKEN: Token = {
  type: "eof",
  value: null,
  location: { line: 0, column: 0 },
};

function currentToken(state: ParseState): Token {
  if (state.pos < state.tokens.length) {
    return state.tokens[state.pos]!;
  }
  return EOF_TOKEN;
}

function currentLocation(state: ParseState): Location {
  return currentToken(state).location;
}

// ---------------------------------------------------------------------------
// Source-range tracking helpers
// ---------------------------------------------------------------------------

import type { SourceRange } from "./types.js";

/** Get the character offset of the current token (start of next consumed token). */
function currentOffset(state: ParseState): number {
  return currentToken(state).location.offset ?? 0;
}

/**
 * Compute the end offset of the most recently consumed token.
 *
 * This is approximate: we use the start offset of the *current* token
 * (which is the next-to-consume token). For most well-formed AST nodes
 * the difference is acceptable for source-range mapping in editor UIs.
 */
function endOffset(state: ParseState): number {
  // Walk backwards over newline/indent/dedent tokens to find the last meaningful
  // content token, then return its start. This is approximate but stays
  // within source bounds.
  const cur = currentToken(state);
  if (cur.type === "eof") {
    for (let i = state.pos - 1; i >= 0; i--) {
      const t = state.tokens[i];
      if (!t) continue;
      if (t.type === "newline" || t.type === "indent" || t.type === "dedent") {
        continue;
      }
      if (t.location.offset !== undefined) {
        return t.location.offset;
      }
    }
  }
  return cur.location.offset ?? 0;
}

/** Build a SourceRange from a captured start offset to current position. */
function makeRange(state: ParseState, fromOffset: number): SourceRange {
  return { from: fromOffset, to: endOffset(state) };
}

function advance(state: ParseState): void {
  state.pos++;
}

function skipNewlines(state: ParseState): void {
  while (currentToken(state).type === "newline") {
    advance(state);
  }
}

function skipDedents(state: ParseState): void {
  while (currentToken(state).type === "dedent") {
    advance(state);
  }
}

function addError(state: ParseState, error: ParseError): void {
  state.errors.push(error);
}

/** Skip all tokens until the next newline, dedent, or eof (does not consume the terminator). */
function skipToEndOfLine(state: ParseState): void {
  while (true) {
    const t = currentToken(state);
    if (t.type === "newline" || t.type === "dedent" || t.type === "eof") break;
    advance(state);
  }
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

export function parse(
  tokens: Token[],
): { ok: true; document: Document } | { ok: false; errors: WplError[] } {
  const state: ParseState = {
    tokens,
    pos: 0,
    errors: [],
  };

  const document = parseDocument(state);

  if (document === null) {
    return { ok: false, errors: state.errors };
  }

  if (state.errors.length > 0) {
    return { ok: false, errors: state.errors };
  }

  return { ok: true, document };
}

// ---------------------------------------------------------------------------
// Document Parsing
// ---------------------------------------------------------------------------

function parseDocument(state: ParseState): Document | null {
  skipNewlines(state);

  const fromOffset = currentOffset(state);
  const header = parseHeader(state);
  if (header === null) return null;

  skipNewlines(state);

  const sections = parseSections(state);

  return {
    header,
    goals: sections.goals ?? null,
    requirements: sections.requirements ?? null,
    personalization: sections.personalization ?? null,
    athlete_thresholds: sections.athlete_thresholds ?? null,
    phases: sections.phases ?? [],
    progress: sections.progress ?? null,
    notifications: sections.notifications ?? null,
    rendering: sections.rendering ?? null,
    range: makeRange(state, fromOffset),
  };
}

// ---------------------------------------------------------------------------
// Header Parsing
// ---------------------------------------------------------------------------

function parseHeader(state: ParseState): Header | null {
  const name = expectPlanName(state);
  if (name === null) return null;

  skipNewlines(state);

  const attrs = parseHeaderAttributes(state);

  const header: Header = {
    name,
    type: (attrs.type as PlanType) ?? null!,
    visibility: (attrs.visibility as Visibility) ?? null,
    difficulty: (attrs.difficulty as Difficulty) ?? null,
    duration: (attrs.duration as Duration) ?? null,
    tags: (attrs.tags as string[]) ?? null,
    language: (attrs.language as string) ?? "en",
    min_app_version: (attrs.min_app_version as string) ?? null,
    schema: (attrs.schema as string) ?? null,
  };

  if (!header.type) {
    addError(
      state,
      missingRequired("TYPE", "header", currentLocation(state)),
    );
    return null;
  }

  return header;
}

function expectPlanName(state: ParseState): string | null {
  const tok = currentToken(state);
  if (tok.type === "keyword" && tok.value === "PLAN") {
    advance(state);
    const nameTok = currentToken(state);
    if (nameTok.type === "string") {
      advance(state);
      return nameTok.value as string;
    }
    addError(
      state,
      unexpectedToken(
        ["string"],
        `${nameTok.type}:${nameTok.value}`,
        nameTok.location,
      ),
    );
    return null;
  }

  addError(
    state,
    unexpectedToken(
      ["PLAN"],
      `${tok.type}:${tok.value}`,
      tok.location,
    ),
  );
  return null;
}

function parseHeaderAttributes(
  state: ParseState,
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type !== "keyword") break;

    switch (tok.value) {
      case "TYPE": {
        advance(state);
        const loc = currentLocation(state);
        const val = expectBareWord(state);
        attrs.type = parsePlanType(state, val, loc);
        break;
      }
      case "VISIBILITY": {
        advance(state);
        const loc = currentLocation(state);
        const val = expectBareWord(state);
        attrs.visibility = parseVisibility(state, val, loc);
        break;
      }
      case "DIFFICULTY": {
        advance(state);
        const loc = currentLocation(state);
        const val = expectBareWord(state);
        attrs.difficulty = parseDifficulty(state, val, loc);
        break;
      }
      case "DURATION":
        advance(state);
        attrs.duration = parseDuration(state);
        break;
      case "TAGS":
        advance(state);
        attrs.tags = parseTagList(state);
        break;
      case "LANGUAGE":
        advance(state);
        attrs.language = expectBareWord(state);
        break;
      case "MIN_APP_VERSION":
        advance(state);
        attrs.min_app_version = expectString(state);
        break;
      case "SCHEMA":
        advance(state);
        attrs.schema = expectString(state);
        break;
      default:
        // Not a header attribute; stop
        return attrs;
    }
  }

  return attrs;
}

function parsePlanType(state: ParseState, value: string, loc: Location): PlanType {
  if (PLAN_TYPE_SET.has(value)) return value as PlanType;
  addError(state, invalidValue("TYPE", value, [...GRAMMAR.plan_type], loc));
  return GRAMMAR.plan_type[0] as PlanType;
}

function parseVisibility(state: ParseState, value: string, loc: Location): Visibility {
  if (VISIBILITY_SET.has(value)) return value as Visibility;
  addError(state, invalidValue("VISIBILITY", value, [...GRAMMAR.visibility], loc));
  return GRAMMAR.visibility[0] as Visibility;
}

function parseDifficulty(state: ParseState, value: string, loc: Location): Difficulty {
  if (DIFFICULTY_SET.has(value)) return value as Difficulty;
  addError(state, invalidValue("DIFFICULTY", value, [...GRAMMAR.difficulty], loc));
  return GRAMMAR.difficulty[0] as Difficulty;
}

// ---------------------------------------------------------------------------
// Sections Parsing
// ---------------------------------------------------------------------------

interface Sections {
  goals?: Goal[];
  requirements?: Requirements;
  personalization?: Personalization;
  athlete_thresholds?: import("./types.js").AthleteThresholds;
  phases?: Phase[];
  progress?: Progress;
  notifications?: Notification[];
  rendering?: Rendering;
}

function parseSections(state: ParseState): Sections {
  const sections: Sections = {};

  for (;;) {
    skipNewlines(state);
    skipDedents(state);

    const tok = currentToken(state);
    if (tok.type === "eof") break;
    if (tok.type !== "keyword") break;

    switch (tok.value) {
      case "GOALS":
        sections.goals = parseGoalsSection(state);
        break;
      case "REQUIRES":
        sections.requirements = parseRequiresSection(state);
        break;
      case "PERSONALIZATION":
        sections.personalization = parsePersonalizationSection(state);
        break;
      case "ATHLETE_THRESHOLDS":
        sections.athlete_thresholds = parseAthleteThresholdsSection(state);
        break;
      case "PHASES":
        sections.phases = parsePhasesSection(state);
        break;
      case "PROGRESS":
        sections.progress = parseProgressSection(state);
        break;
      case "NOTIFICATIONS":
        sections.notifications = parseNotificationsSection(state);
        break;
      case "RENDERING":
        sections.rendering = parseRenderingSection(state);
        break;
      default: {
        // All-caps words look like misspelled section keywords — flag them.
        // Lowercase/mixed-case keywords (e.g. "minutes") are leftover nested
        // tokens that the section parser didn't consume — exit silently.
        const val = String(tok.value);
        if (/^[A-Z_]+$/.test(val)) {
          addError(
            state,
            unexpectedToken(
              [...GRAMMAR.sections.required, ...GRAMMAR.sections.optional],
              val,
              tok.location,
            ),
          );
        }
        return sections;
      }
    }
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Goals Section
// ---------------------------------------------------------------------------

function parseGoalsSection(state: ParseState): Goal[] {
  advance(state); // skip GOALS
  skipNewlines(state);

  const tok = currentToken(state);
  if (tok.type === "indent") {
    advance(state);
    return parseGoals(state);
  }
  return [];
}

function parseGoals(state: ParseState): Goal[] {
  const goals: Goal[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword" && tok.value === "GOAL") {
      goals.push(parseGoal(state));
    } else if (tok.type === "dedent") {
      advance(state);
      break;
    } else {
      break;
    }
  }

  return goals;
}

function parseGoal(state: ParseState): Goal {
  const fromOffset = currentOffset(state);
  advance(state); // skip GOAL

  const priority = expectBareWord(state);
  const category = expectBareWord(state);
  expectColon(state);
  skipNewlines(state);

  let goalAttrs: Record<string, unknown> = {};

  if (currentToken(state).type === "indent") {
    advance(state);
    goalAttrs = parseGoalBody(state);
  }

  return {
    priority: parsePriority(priority),
    category,
    name: (goalAttrs.name as string) ?? null,
    description: (goalAttrs.description as string) ?? null,
    target: (goalAttrs.target as Target) ?? null,
    deadline: (goalAttrs.deadline as string) ?? null,
    milestones: (goalAttrs.milestones as Milestone[]) ?? null,
    range: makeRange(state, fromOffset),
  };
}

function parseGoalBody(state: ParseState): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword") {
      switch (tok.value) {
        case "name":
          advance(state);
          attrs.name = expectString(state);
          continue;
        case "description":
          advance(state);
          attrs.description = expectString(state);
          continue;
        case "target":
          advance(state);
          attrs.target = parseTarget(state);
          continue;
        case "deadline":
          advance(state);
          attrs.deadline = expectDate(state);
          continue;
        case "milestone": {
          const milestone = parseMilestone(state);
          const milestones = (attrs.milestones as Milestone[]) ?? [];
          milestones.push(milestone);
          attrs.milestones = milestones;
          continue;
        }
        default:
          break;
      }
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    break;
  }

  return attrs;
}

function parseTarget(state: ParseState): Target {
  const fromOffset = currentOffset(state);
  const metric = expectBareWord(state);
  const value = expectNumber(state);
  const unit = expectBareWord(state);

  let measurementType: MeasurementType = GRAMMAR.measurement_type[0] as MeasurementType;
  const tok = currentToken(state);
  if (tok.type === "keyword" && MEASUREMENT_TYPE_SET.has(tok.value as string)) {
    measurementType = tok.value as MeasurementType;
    advance(state);
  }

  return {
    metric,
    value,
    unit,
    measurement_type: measurementType,
    range: makeRange(state, fromOffset),
  };
}

function parseMilestone(state: ParseState): Milestone {
  const fromOffset = currentOffset(state);
  advance(state); // skip "milestone"
  const name = expectString(state);
  expectColon(state);
  skipNewlines(state);

  if (currentToken(state).type === "indent") {
    advance(state);
  }

  const attrs = parseMilestoneBody(state);

  return {
    name,
    at_value: (attrs.at_value as number) ?? 0,
    at_unit: (attrs.at_unit as string) ?? "",
    reward_points: (attrs.reward_points as number) ?? null,
    badge: (attrs.badge as string) ?? null,
    range: makeRange(state, fromOffset),
  };
}

function parseMilestoneBody(
  state: ParseState,
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword") {
      switch (tok.value) {
        case "at": {
          advance(state);
          const value = expectNumber(state);
          const unit = expectBareWord(state);
          attrs.at_value = value;
          attrs.at_unit = unit;
          continue;
        }
        case "reward": {
          advance(state);
          const points = expectNumber(state);
          expectKeyword(state, "points");
          attrs.reward_points = Math.trunc(points);
          continue;
        }
        case "badge":
          advance(state);
          attrs.badge = expectBareWord(state);
          continue;
        default:
          break;
      }
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    break;
  }

  return attrs;
}

function parsePriority(value: string): GoalPriority {
  if (GOAL_PRIORITY_SET.has(value)) return value as GoalPriority;
  return GRAMMAR.goal_priority[0] as GoalPriority;
}

// ---------------------------------------------------------------------------
// Requirements Section
// ---------------------------------------------------------------------------

function parseRequiresSection(state: ParseState): Requirements {
  const fromOffset = currentOffset(state);
  advance(state); // skip REQUIRES
  skipNewlines(state);

  if (currentToken(state).type === "indent") {
    advance(state);
    const attrs = parseRequiresBody(state);

    return {
      age_range: (attrs.age_range as [number, number]) ?? null,
      fitness_levels: (attrs.fitness_levels as string[]) ?? null,
      equipment: (attrs.equipment as Equipment[]) ?? null,
      contraindications:
        (attrs.contraindications as Contraindication[]) ?? null,
      time_commitment: (attrs.time_commitment as TimeCommitment) ?? null,
      range: makeRange(state, fromOffset),
    };
  }

  return {
    age_range: null,
    fitness_levels: null,
    equipment: null,
    contraindications: null,
    time_commitment: null,
    range: makeRange(state, fromOffset),
  };
}

function parseRequiresBody(
  state: ParseState,
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword") {
      switch (tok.value) {
        case "age": {
          advance(state);
          const min = expectNumber(state);
          expectRange(state);
          const max = expectNumber(state);
          attrs.age_range = [Math.trunc(min), Math.trunc(max)] as [
            number,
            number,
          ];
          continue;
        }
        case "fitness":
          advance(state);
          attrs.fitness_levels = parseEnumList(state);
          continue;
        case "equipment":
          advance(state);
          expectColon(state);
          skipNewlines(state);
          expectIndent(state);
          attrs.equipment = parseEquipmentList(state);
          continue;
        case "contraindication": {
          const contra = parseContraindication(state);
          const contras =
            (attrs.contraindications as Contraindication[]) ?? [];
          contras.push(contra);
          attrs.contraindications = contras;
          continue;
        }
        case "time":
          advance(state);
          expectColon(state);
          skipNewlines(state);
          expectIndent(state);
          attrs.time_commitment = parseTimeCommitment(state);
          continue;
        default: {
          // Collect the unrecognised directive text for the error message.
          // Consume tokens until end-of-line so parsing can resume at the
          // next directive rather than silently terminating the block.
          const directiveName = String(tok.value);
          const directiveLoc = tok.location;
          advance(state); // skip the unrecognised keyword
          const rest: string[] = [];
          while (true) {
            const t = currentToken(state);
            if (t.type === "newline" || t.type === "dedent" || t.type === "eof") break;
            rest.push(String(t.value ?? ""));
            advance(state);
          }
          const lineText = rest.length > 0 ? `${directiveName} ${rest.join(" ")}` : directiveName;
          addError(
            state,
            invalidStructure(
              `Unknown REQUIRES directive: '${lineText}'. Recognized: contraindication, fitness, equipment, age, time_commitment.`,
              directiveLoc,
            ),
          );
          continue;
        }
      }
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    if (tok.type === "eof" || tok.type === "newline") {
      break;
    }

    // Any other token (e.g. bare_word used as an unknown directive) —
    // collect the line as an unknown directive and emit an error.
    {
      const directiveName = String(tok.value ?? "");
      const directiveLoc = tok.location;
      advance(state); // skip the unknown token
      const rest: string[] = [];
      while (true) {
        const t = currentToken(state);
        if (t.type === "newline" || t.type === "dedent" || t.type === "eof") break;
        rest.push(String(t.value ?? ""));
        advance(state);
      }
      const lineText = rest.length > 0 ? `${directiveName} ${rest.join(" ")}` : directiveName;
      addError(
        state,
        invalidStructure(
          `Unknown REQUIRES directive: '${lineText}'. Recognized: contraindication, fitness, equipment, age, time_commitment.`,
          directiveLoc,
        ),
      );
      continue;
    }
  }

  return attrs;
}

function parseEquipmentList(state: ParseState): Equipment[] {
  const equipment: Equipment[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "bare_word") {
      const fromOffset = currentOffset(state);
      const name = tok.value as string;
      advance(state);
      const flags = parseEquipmentFlags(state);

      equipment.push({
        name,
        required: (flags.required as boolean) ?? false,
        alternatives: (flags.alternatives as string[]) ?? null,
        range: makeRange(state, fromOffset),
      });
    } else if (tok.type === "dedent") {
      advance(state);
      break;
    } else {
      break;
    }
  }

  return equipment;
}

function parseEquipmentFlags(
  state: ParseState,
): Record<string, unknown> {
  if (currentToken(state).type === "lparen") {
    advance(state);
    const flags = parseEquipmentFlagsContent(state);
    expectRparen(state);
    return flags;
  }
  // Also handle bare `required` / `optional` keyword without parentheses
  // (inline form: `equipment sandbag required`).
  const tok = currentToken(state);
  if (tok.type === "keyword") {
    if (tok.value === "required") {
      advance(state);
      return { required: true };
    }
    if (tok.value === "optional") {
      advance(state);
      return { required: false };
    }
  }
  return {};
}

function parseEquipmentFlagsContent(
  state: ParseState,
): Record<string, unknown> {
  const flags: Record<string, unknown> = {};

  for (;;) {
    const tok = currentToken(state);
    if (tok.type === "rparen") break;

    if (tok.type === "keyword") {
      switch (tok.value) {
        case "required":
          advance(state);
          flags.required = true;
          maybeSkipComma(state);
          continue;
        case "optional":
          advance(state);
          flags.required = false;
          maybeSkipComma(state);
          continue;
        case "alternatives":
          advance(state);
          expectColon(state);
          flags.alternatives = parseEnumList(state);
          maybeSkipComma(state);
          continue;
        default:
          break;
      }
    }

    break;
  }

  return flags;
}

/**
 * Reads a contraindication condition name, which may be a plain identifier
 * or a colon-qualified identifier (e.g. icd10:M54.5, acsm:cardiac_rehab_phase_2,
 * snomed:72704001, acog:pregnancy).
 *
 * The lexer emits prefix, colon, and suffix as three separate tokens; this
 * helper glues them into a single string.
 */
function expectContraindicationName(state: ParseState): string {
  const first = expectBareWord(state);
  // Check for a colon token immediately following (qualified name form).
  if (currentToken(state).type === "colon") {
    advance(state); // consume ":"
    const rest = expectBareWord(state);
    return `${first}:${rest}`;
  }
  return first;
}

function parseContraindication(state: ParseState): Contraindication {
  advance(state); // skip "contraindication"
  const condition = expectContraindicationName(state);

  // Support two forms:
  // v1.6.0 new form:  contraindication <name> [severity <level>] [action <action>]
  // Legacy form:      contraindication <name> -> <action>
  let severity: ContraindicationSeverity | undefined;
  let action: ContraindicationAction = GRAMMAR.contraindication_action[0] as ContraindicationAction;

  // Check for new-style keyword modifiers first
  const tok = currentToken(state);
  if (tok.type === "keyword" && tok.value === "severity") {
    advance(state);
    const sevStr = currentToken(state).value as string;
    advance(state);
    if (CONTRAINDICATION_SEVERITY_SET.has(sevStr)) {
      severity = sevStr as ContraindicationSeverity;
    }
  }

  const tok2 = currentToken(state);
  if (tok2.type === "keyword" && tok2.value === "action") {
    advance(state);
    const actionStr = currentToken(state).value as string;
    advance(state);
    if (CONTRAINDICATION_ACTION_SET.has(actionStr)) {
      action = actionStr as ContraindicationAction;
    }
  } else if (tok2.type === "arrow") {
    // Legacy form: -> <action>
    advance(state); // skip arrow
    const actionStr = currentToken(state).value as string;
    advance(state);
    if (CONTRAINDICATION_ACTION_SET.has(actionStr)) {
      action = actionStr as ContraindicationAction;
    }
  }

  let affectsList: string[] | null = null;

  if (currentToken(state).type === "indent") {
    advance(state);
    skipNewlines(state);

    if (
      currentToken(state).type === "keyword" &&
      currentToken(state).value === "affects"
    ) {
      advance(state);
      affectsList = parseEnumList(state);

      if (currentToken(state).type === "dedent") {
        advance(state);
      }
    } else if (currentToken(state).type === "dedent") {
      advance(state);
    }
  }

  const result: Contraindication = {
    condition,
    action,
    affects: affectsList,
  };

  if (severity !== undefined) {
    result.severity = severity;
  }

  return result;
}

function parseTimeCommitment(state: ParseState): TimeCommitment {
  skipNewlines(state);
  const attrs: Record<string, unknown> = {};

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword") {
      switch (tok.value) {
        case "days_per_week": {
          advance(state);
          const min = expectNumber(state);
          expectRange(state);
          const max = expectNumber(state);
          attrs.days_per_week = [Math.trunc(min), Math.trunc(max)];
          continue;
        }
        case "minutes_per_day": {
          advance(state);
          const min = expectNumber(state);
          expectRange(state);
          const max = expectNumber(state);
          attrs.minutes_per_day = [Math.trunc(min), Math.trunc(max)];
          continue;
        }
        default:
          break;
      }
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    break;
  }

  return {
    days_per_week: (attrs.days_per_week as [number, number]) ?? [0, 0],
    minutes_per_day: (attrs.minutes_per_day as [number, number]) ?? [
      0, 0,
    ],
  };
}

// ---------------------------------------------------------------------------
// Athlete Thresholds Section (schema v1.3.0+)
// ---------------------------------------------------------------------------

function parseAthleteThresholdsSection(
  state: ParseState,
): import("./types.js").AthleteThresholds {
  advance(state); // skip ATHLETE_THRESHOLDS
  skipNewlines(state);

  const out: import("./types.js").AthleteThresholds = {};

  if (currentToken(state).type !== "indent") {
    return out;
  }
  advance(state);

  const oneRm: import("./types.js").OneRMEntry[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type !== "bare_word" && tok.type !== "keyword") break;

    const field = String(tok.value);

    if (field === "one_rm") {
      advance(state);
      const exerciseRef = expectBareWord(state);
      const value = expectNumber(state);
      const unitTok = currentToken(state);
      let unit: "kg" | "lb" = "kg";
      if (unitTok.type === "bare_word" || unitTok.type === "keyword") {
        const u = String(unitTok.value);
        if (u === "kg" || u === "lb" || u === "lbs") {
          unit = u === "lbs" ? "lb" : (u as "kg" | "lb");
          advance(state);
        }
      }
      oneRm.push({ exercise_ref: exerciseRef, value, unit });
      continue;
    }

    // Numeric scalar fields. Schema names them with implied units, so we
    // accept just a bare number and skip an optional matching unit token
    // (e.g. "kg", "bpm", "watts", "ml/kg/min") for readability.
    if (
      field === "hr_max" ||
      field === "lthr" ||
      field === "resting_hr" ||
      field === "ftp" ||
      field === "vo2max" ||
      field === "critical_pace_seconds_per_km" ||
      field === "body_weight"
    ) {
      advance(state);
      const value = expectNumber(state);
      // Soak up an optional descriptive unit bareword.
      const next = currentToken(state);
      if (next.type === "bare_word" || next.type === "keyword") {
        const lit = String(next.value);
        if (
          lit === "bpm" ||
          lit === "watts" ||
          lit === "kg" ||
          lit === "lbs"
        ) {
          advance(state);
        }
      }

      switch (field) {
        case "hr_max":
          out.hr_max_bpm = Math.trunc(value);
          break;
        case "lthr":
          out.lthr_bpm = Math.trunc(value);
          break;
        case "resting_hr":
          out.resting_hr_bpm = Math.trunc(value);
          break;
        case "ftp":
          out.ftp_watts = value;
          break;
        case "vo2max":
          out.vo2max_ml_kg_min = value;
          break;
        case "critical_pace_seconds_per_km":
          out.critical_pace_seconds_per_km = value;
          break;
        case "body_weight":
          out.body_weight_kg = value;
          break;
      }
      continue;
    }

    // Unknown field — stop, let outer parser see the token.
    break;
  }

  if (currentToken(state).type === "dedent") advance(state);

  if (oneRm.length > 0) {
    out.one_rm = oneRm;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Personalization Section
// ---------------------------------------------------------------------------

function parsePersonalizationSection(state: ParseState): Personalization {
  const fromOffset = currentOffset(state);
  advance(state); // skip PERSONALIZATION
  skipNewlines(state);

  if (currentToken(state).type === "indent") {
    advance(state);
    const { inputs, rules } = parsePersonalizationBody(state);
    return {
      inputs: inputs.length === 0 ? null : inputs,
      rules,
      range: makeRange(state, fromOffset),
    };
  }

  return { inputs: null, rules: [], range: makeRange(state, fromOffset) };
}

function parsePersonalizationBody(state: ParseState): {
  inputs: Input[];
  rules: Rule[];
} {
  let inputs: Input[] = [];
  let rules: Rule[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword") {
      switch (tok.value) {
        case "INPUTS":
          advance(state);
          skipNewlines(state);
          expectIndent(state);
          inputs = inputs.concat(parseInputs(state));
          continue;
        case "RULES":
          advance(state);
          skipNewlines(state);
          expectIndent(state);
          rules = rules.concat(parseRules(state));
          continue;
        default:
          break;
      }
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    break;
  }

  return { inputs, rules };
}

function parseInputs(state: ParseState): Input[] {
  const inputs: Input[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "bare_word") {
      const fromOffset = currentOffset(state);
      const name = tok.value as string;
      advance(state);
      expectEq(state);
      const source = parseInputSource(state);
      expectKeyword(state, "as");
      const typeStr = expectBareWord(state);

      const inputType: InputType = INPUT_TYPE_SET.has(typeStr)
        ? (typeStr as InputType)
        : ("string" as InputType);

      const { options, label } = parseInputOptionsAndLabel(state);

      inputs.push({
        name,
        source,
        type: inputType,
        options: options ?? null,
        label: label ?? null,
        range: makeRange(state, fromOffset),
      });
    } else if (tok.type === "dedent") {
      advance(state);
      break;
    } else {
      break;
    }
  }

  return inputs;
}

function parseInputSource(state: ParseState): string {
  const tok = currentToken(state);
  if (tok.type === "bare_word" || tok.type === "keyword") {
    advance(state);
    return tok.value as string;
  }
  return "";
}

function parseInputOptionsAndLabel(state: ParseState): {
  options: string[] | null;
  label: string | null;
} {
  let options: string[] | null = null;
  let label: string | null = null;

  for (;;) {
    const tok = currentToken(state);
    if (tok.type === "keyword") {
      if (tok.value === "options") {
        advance(state);
        expectLparen(state);
        options = parseEnumList(state);
        expectRparen(state);
        continue;
      }
      if (tok.value === "label") {
        advance(state);
        label = expectString(state);
        continue;
      }
    }
    break;
  }

  return { options, label };
}

function parseRules(state: ParseState): Rule[] {
  const rules: Rule[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword" && tok.value === "WHEN") {
      rules.push(parseRule(state));
    } else if (tok.type === "dedent") {
      advance(state);
      break;
    } else {
      break;
    }
  }

  return rules;
}

function parseRule(state: ParseState): Rule {
  const fromOffset = currentOffset(state);
  advance(state); // skip WHEN
  const condition = parseCondition(state);
  expectColon(state);
  skipNewlines(state);
  expectIndent(state);
  const actions = parseActions(state);

  return { condition, actions, range: makeRange(state, fromOffset) };
}

// ---------------------------------------------------------------------------
// Condition Parsing (OR / AND / predicate precedence)
// ---------------------------------------------------------------------------

function parseCondition(state: ParseState): Condition {
  return parseOrExpr(state);
}

function parseOrExpr(state: ParseState): Condition {
  let left = parseAndExpr(state);

  while (
    currentToken(state).type === "keyword" &&
    currentToken(state).value === "OR"
  ) {
    advance(state);
    const right = parseAndExpr(state);
    left = {
      type: "compound",
      operator: "or",
      field: null,
      op: null,
      value: null,
      conditions: [left, right],
    };
  }

  return left;
}

function parseAndExpr(state: ParseState): Condition {
  let left = parsePredicate(state);

  while (
    currentToken(state).type === "keyword" &&
    currentToken(state).value === "AND"
  ) {
    advance(state);
    const right = parsePredicate(state);
    left = {
      type: "compound",
      operator: "and",
      field: null,
      op: null,
      value: null,
      conditions: [left, right],
    };
  }

  return left;
}

function parsePredicate(state: ParseState): Condition {
  const tok = currentToken(state);

  if (tok.type === "lparen") {
    advance(state);
    const condition = parseCondition(state);
    expectRparen(state);
    return condition;
  }

  if (tok.type === "bare_word" || tok.type === "keyword") {
    return parseSimplePredicate(state);
  }

  // Dummy condition on error
  return {
    type: "simple",
    operator: null,
    field: "unknown",
    op: "eq",
    value: null,
    conditions: null,
  };
}

function parseSimplePredicate(state: ParseState): Condition {
  const field = expectBareWordOrKeyword(state);
  const op = parseComparisonOp(state);
  const value = parseValue(state);

  return {
    type: "simple",
    operator: null,
    field,
    op,
    value,
    conditions: null,
  };
}

function parseComparisonOp(state: ParseState): ComparisonOp {
  const tok = currentToken(state);

  switch (tok.type) {
    case "eq":
      advance(state);
      return "eq";
    case "neq":
      advance(state);
      return "neq";
    case "gte":
      advance(state);
      return "gte";
    case "lte":
      advance(state);
      return "lte";
    case "gt":
      advance(state);
      return "gt";
    case "lt":
      advance(state);
      return "lt";
    case "keyword":
      if (tok.value === "contains") {
        advance(state);
        return "contains";
      }
      if (tok.value === "not_contains") {
        advance(state);
        return "not_contains";
      }
      return "eq";
    default:
      return "eq";
  }
}

function parseValue(state: ParseState): unknown {
  const tok = currentToken(state);

  switch (tok.type) {
    case "number":
      advance(state);
      return tok.value;
    case "string":
      advance(state);
      return tok.value;
    case "bare_word":
      advance(state);
      return tok.value;
    case "keyword":
      advance(state);
      return tok.value;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Actions Parsing
// ---------------------------------------------------------------------------

const ACTION_KEYWORDS = new Set([
  "reduce",
  "modify",
  "add",
  "replace",
  "exclude",
  "remove",
  "increase",
]);

function parseActions(state: ParseState): Action[] {
  const actions: Action[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (
      tok.type === "keyword" &&
      ACTION_KEYWORDS.has(tok.value as string)
    ) {
      actions.push(parseAction(state));
    } else if (tok.type === "dedent") {
      advance(state);
      break;
    } else {
      break;
    }
  }

  return actions;
}

function parseAction(state: ParseState): Action {
  const tok = currentToken(state);
  const actionWord = tok.value as string;

  switch (actionWord) {
    case "reduce":
      advance(state);
      return parseReduceAction(state);
    case "modify":
      advance(state);
      return parseModifyAction(state);
    case "add":
      advance(state);
      return parseAddAction(state);
    case "replace":
      advance(state);
      return parseReplaceAction(state);
    case "exclude":
    case "remove":
      advance(state);
      return parseExcludeAction(state);
    case "increase":
      advance(state);
      return parseIncreaseAction(state);
    default:
      return {
        type: "modify_intensity",
        params: {},
        scope: "plan",
      };
  }
}

function parseReduceAction(state: ParseState): Action {
  const tok = currentToken(state);
  const word = tok.value as string;

  if (
    (tok.type === "keyword" || tok.type === "bare_word") &&
    word === "intensity"
  ) {
    advance(state);
    expectKeyword(state, "by");
    const value = expectNumber(state);
    expectPercent(state);
    const scope = parseOptionalScope(state);

    return {
      type: "modify_intensity",
      params: { factor: 1 - value / 100 },
      scope,
    };
  }

  if (
    (tok.type === "keyword" || tok.type === "bare_word") &&
    word === "sets"
  ) {
    advance(state);
    expectKeyword(state, "by");
    const value = expectNumber(state);
    const scope = parseOptionalScope(state);

    return {
      type: "reduce_sets",
      params: { amount: Math.trunc(value) },
      scope,
    };
  }

  if (
    (tok.type === "keyword" || tok.type === "bare_word") &&
    word === "reps"
  ) {
    advance(state);
    expectKeyword(state, "by");
    const value = expectNumber(state);
    const scope = parseOptionalScope(state);

    return {
      type: "reduce_reps",
      params: { amount: Math.trunc(value) },
      scope,
    };
  }

  return { type: "modify_intensity", params: {}, scope: "plan" };
}

function parseModifyAction(state: ParseState): Action {
  expectKeyword(state, "intensity");
  expectKeyword(state, "factor");
  const factor = expectNumber(state);
  const scope = parseOptionalScope(state);

  return {
    type: "modify_intensity",
    params: { factor },
    scope,
  };
}

function parseAddAction(state: ParseState): Action {
  const tok = currentToken(state);

  if (tok.type === "keyword" && tok.value === "warmup") {
    advance(state);
    const minutes = expectNumber(state);
    expectKeyword(state, "minutes");
    const scope = parseOptionalScope(state);

    return {
      type: "add_warmup_time",
      params: { minutes: Math.trunc(minutes) },
      scope,
    };
  }

  if (tok.type === "keyword" && tok.value === "activity") {
    advance(state);
    const activityName = expectBareWord(state);
    const placement = parseOptionalPlacement(state);
    const scope = parseOptionalScope(state);

    return {
      type: "add_activity",
      params: { activity: activityName, placement },
      scope,
    };
  }

  return { type: "add_activity", params: {}, scope: "plan" };
}

function parseReplaceAction(state: ParseState): Action {
  const from = expectBareWord(state);
  expectArrow(state);
  const to = expectBareWord(state);
  const scope = parseOptionalScope(state);

  return {
    type: "replace_exercise",
    params: { from, to },
    scope,
  };
}

function parseExcludeAction(state: ParseState): Action {
  const exercise = expectBareWord(state);
  const scope = parseOptionalScope(state);

  return {
    type: "exclude_exercise",
    params: { exercise },
    scope,
  };
}

function parseIncreaseAction(state: ParseState): Action {
  expectKeyword(state, "rest");
  expectKeyword(state, "by");
  const duration = parseDuration(state);
  const scope = parseOptionalScope(state);

  return {
    type: "increase_rest",
    params: { duration },
    scope,
  };
}

function parseOptionalScope(state: ParseState): ActionScope {
  const tok = currentToken(state);
  if (tok.type === "keyword" && tok.value === "scope") {
    advance(state);
    const scopeStr = expectBareWord(state);
    if (ACTION_SCOPE_SET.has(scopeStr)) return scopeStr as ActionScope;
    return "plan";
  }
  return "plan";
}

function parseOptionalPlacement(
  state: ParseState,
): { type: string; target: string } | null {
  const tok = currentToken(state);
  if (tok.type === "keyword") {
    switch (tok.value) {
      case "before": {
        advance(state);
        const target = expectBareWord(state);
        return { type: "before", target };
      }
      case "after": {
        advance(state);
        const target = expectBareWord(state);
        return { type: "after", target };
      }
      case "in": {
        advance(state);
        const target = expectBareWord(state);
        return { type: "in", target };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Phases Section
// ---------------------------------------------------------------------------

function parsePhasesSection(state: ParseState): Phase[] {
  advance(state); // skip PHASES
  skipNewlines(state);

  if (currentToken(state).type === "indent") {
    advance(state);
    return parsePhases(state);
  }
  return [];
}

function parsePhases(state: ParseState): Phase[] {
  const phases: Phase[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword" && tok.value === "PHASE") {
      phases.push(parsePhase(state));
    } else if (tok.type === "dedent") {
      advance(state);
      break;
    } else {
      break;
    }
  }

  return phases;
}

function parsePhase(state: ParseState): Phase {
  const fromOffset = currentOffset(state);
  advance(state); // skip PHASE
  const name = expectString(state);

  // Optional periodization role (schema v1.2.0+): PHASE "Name" accumulation (4 weeks):
  let phaseType: import("./types.js").PhaseType | null = null;
  const peek = currentToken(state);
  if (peek.type === "keyword" && PHASE_TYPE_SET.has(peek.value as string)) {
    phaseType = peek.value as import("./types.js").PhaseType;
    advance(state);
  } else if (peek.type === "bare_word" || peek.type === "keyword") {
    // A word appears in the phase-type slot that is not a recognised phase type.
    // Emit an error and consume the unknown word so parsing can continue.
    const unknown = String(peek.value);
    addError(
      state,
      invalidStructure(
        `Unknown phase type '${unknown}'. Allowed: ${[...PHASE_TYPE_SET].join(", ")}.`,
        peek.location,
      ),
    );
    advance(state);
  }

  expectLparen(state);
  const duration = parseDuration(state);
  expectRparen(state);
  expectColon(state);
  skipNewlines(state);

  if (currentToken(state).type === "indent") {
    advance(state);
  }

  const { attrs, weeks } = parsePhaseBody(state);

  return {
    name,
    type: phaseType,
    duration,
    goals: (attrs.goals as string[]) ?? null,
    description: (attrs.description as string) ?? null,
    weeks,
    range: makeRange(state, fromOffset),
  };
}

function parsePhaseBody(state: ParseState): {
  attrs: Record<string, unknown>;
  weeks: Week[];
} {
  const attrs: Record<string, unknown> = {};
  const weeks: Week[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword") {
      switch (tok.value) {
        case "goals":
          advance(state);
          attrs.goals = parseEnumList(state);
          continue;
        case "description":
          advance(state);
          attrs.description = expectString(state);
          continue;
        case "WEEK":
          weeks.push(parseWeek(state));
          continue;
        default:
          break;
      }
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    break;
  }

  return { attrs, weeks };
}

function parseWeek(state: ParseState): Week {
  const fromOffset = currentOffset(state);
  advance(state); // skip WEEK
  const number = expectNumber(state);

  // Optional deload flag (schema v1.2.0+): WEEK 4 deload:
  let isDeload = false;
  {
    const peek = currentToken(state);
    if (peek.type === "keyword" && peek.value === "deload") {
      isDeload = true;
      advance(state);
    }
  }

  let name: string | null = null;
  if (currentToken(state).type === "string") {
    name = currentToken(state).value as string;
    advance(state);
  }

  expectColon(state);
  skipNewlines(state);

  // Track whether we entered an indented body. Used to distinguish
  // legitimate empty weeks (no indent emitted; next token is a peer
  // keyword like WEEK or PHASE) from the silent-drop case (indent
  // emitted; body contains non-DAY content like inline `Monday: ...`
  // summaries).
  let enteredIndent = false;
  if (currentToken(state).type === "indent") {
    advance(state);
    enteredIndent = true;
  }

  const weekNumber = Math.trunc(number);
  const days = parseDays(state, enteredIndent ? weekNumber : null);

  return {
    number: weekNumber,
    name,
    is_deload: isDeload ? true : null,
    days,
    range: makeRange(state, fromOffset),
  };
}

function parseDays(state: ParseState, weekNumber: number | null = null): Day[] {
  const days: Day[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword" && tok.value === "DAY") {
      days.push(parseDay(state));
      continue;
    }
    if (tok.type === "dedent") {
      advance(state);
      break;
    }
    if (tok.type === "eof") {
      break;
    }
    // Silent-drop guard. `weekNumber` is only non-null when parseWeek
    // entered an indented body — i.e., the week declared content. Any
    // non-{DAY,dedent,eof} token here means the body has content that
    // is not a valid DAY block (common LLM mistake: writing `Monday:
    // walk/run` as an inline summary instead of the full `DAY Monday
    // training 45m "...":` block). Without this guard the parser
    // silently discarded the body and only the downstream
    // PHASE_DURATION_MISMATCH validator caught the gap — without a
    // precise pointer. Emit a parse error here with a repair_hint so
    // agentic loops can regenerate this specific week.
    //
    // When `weekNumber` is null, parseDays was called outside an
    // indented week body (legitimate empty-week scaffold). Silent
    // break in that case.
    if (weekNumber === null) {
      break;
    }
    if (days.length === 0) {
      addError(
        state,
        weekHasNoValidDays(weekNumber, String(tok.value ?? tok.type), tok.location),
      );
    }
    // Recover: skip until dedent/eof/top-level keyword so subsequent
    // weeks still parse.
    while (
      currentToken(state).type !== "dedent" &&
      currentToken(state).type !== "eof" &&
      currentToken(state).type !== "keyword"
    ) {
      advance(state);
    }
    if (currentToken(state).type === "dedent") advance(state);
    break;
  }

  return days;
}

function parseDay(state: ParseState): Day {
  const fromOffset = currentOffset(state);
  advance(state); // skip DAY

  const dayName = parseDayName(state);
  const dayTypeStr = expectBareWord(state);

  const dayType: DayType = DAY_TYPE_SET.has(dayTypeStr)
    ? (dayTypeStr as DayType)
    : (GRAMMAR.day_type[0] as DayType);

  const duration = parseDurationInline(state);

  let label: string | null = null;
  if (currentToken(state).type === "string") {
    label = currentToken(state).value as string;
    advance(state);
  }

  expectColon(state);
  skipNewlines(state);

  if (currentToken(state).type === "indent") {
    advance(state);
  }

  const { attrs, blocks } = parseDayBody(state);

  return {
    day_name: dayName,
    day_type: dayType,
    duration,
    label,
    schedule: (attrs.schedule as [SchedulePref, ScheduleFlex]) ?? null,
    blocks,
    notes: (attrs.notes as string) ?? null,
    range: makeRange(state, fromOffset),
  };
}

function parseDayName(state: ParseState): string | number {
  const tok = currentToken(state);

  if (tok.type === "keyword" && DAY_NAME_SET.has(tok.value as string)) {
    advance(state);
    return tok.value as string;
  }

  if (tok.type === "number") {
    advance(state);
    return Math.trunc(tok.value as number);
  }

  if (tok.type === "bare_word") {
    advance(state);
    return tok.value as string;
  }

  return "Monday";
}

function parseDayBody(state: ParseState): {
  attrs: Record<string, unknown>;
  blocks: Block[];
} {
  const attrs: Record<string, unknown> = {};
  const blocks: Block[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword") {
      if (tok.value === "schedule") {
        advance(state);
        const pref = expectBareWord(state);
        const flex = expectBareWord(state);
        attrs.schedule = [parseSchedulePref(pref), parseScheduleFlex(flex)];
        continue;
      }

      if (tok.value === "notes") {
        advance(state);
        attrs.notes = expectString(state);
        continue;
      }

      if (BLOCK_TYPE_SET.has(tok.value as string)) {
        blocks.push(parseBlock(state));
        continue;
      }
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    break;
  }

  return { attrs, blocks };
}

function parseSchedulePref(value: string): SchedulePref {
  if (SCHEDULE_PREF_SET.has(value)) return value as SchedulePref;
  return "any";
}

function parseScheduleFlex(value: string): ScheduleFlex {
  if (SCHEDULE_FLEX_SET.has(value)) return value as ScheduleFlex;
  return "flexible";
}

// ---------------------------------------------------------------------------
// Blocks and Activities
// ---------------------------------------------------------------------------

function parseBlock(state: ParseState): Block {
  const fromOffset = currentOffset(state);
  const blockTypeStr = expectBareWord(state);

  const blockType: BlockType = BLOCK_TYPE_SET.has(blockTypeStr)
    ? (blockTypeStr as BlockType)
    : (GRAMMAR.block_type[1] as BlockType); // default "main"

  // Optional structure
  let structure: BlockStructure | null = null;
  const structTok = currentToken(state);
  if (
    (structTok.type === "keyword" || structTok.type === "bare_word") &&
    BLOCK_STRUCTURE_SET.has(structTok.value as string)
  ) {
    structure = structTok.value as BlockStructure;
    advance(state);
  }

  expectColon(state);
  skipNewlines(state);

  if (currentToken(state).type === "indent") {
    advance(state);
  }

  const { attrs, activities } = parseBlockBody(state, blockType);

  return {
    type: blockType,
    structure,
    rounds: (attrs.rounds as number) ?? null,
    rest_between_rounds: (attrs.rest_between_rounds as Duration) ?? null,
    activities,
    range: makeRange(state, fromOffset),
  };
}

function parseBlockBody(
  state: ParseState,
  blockType: BlockType,
): { attrs: Record<string, unknown>; activities: Activity[] } {
  const attrs: Record<string, unknown> = {};
  const activities: Activity[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword") {
      switch (tok.value) {
        case "rounds":
          advance(state);
          attrs.rounds = Math.trunc(expectNumber(state));
          continue;
        case "rest_between_rounds":
          advance(state);
          attrs.rest_between_rounds = parseDuration(state);
          continue;
        case "cardio":
          activities.push(parseCardioActivity(state));
          continue;
        case "nutrition":
          activities.push(parseNutritionActivity(state));
          continue;
        case "meditation":
          activities.push(parseMeditationActivity(state));
          continue;
        case "recovery":
          activities.push(parseRecoveryActivity(state));
          continue;
        case "habit":
          activities.push(parseHabitActivity(state));
          continue;
        case "subplan":
          activities.push(parseSubPlanActivity(state));
          continue;
        default:
          break;
      }
    }

    if (tok.type === "bare_word") {
      if (blockType === "cooldown" && isCooldownCardioPattern(state)) {
        // `<modality> <duration>` in a cooldown block — treat as inline CardioActivity.
        activities.push(parseCooldownInlineCardio(state));
      } else if (blockType === "cooldown") {
        activities.push(parseRecoveryExerciseAsActivity(state));
      } else {
        activities.push(parseExerciseOrSimpleActivity(state));
      }
      continue;
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    break;
  }

  return { attrs, activities };
}

// ---------------------------------------------------------------------------
// Cooldown inline cardio detection + parsing
// ---------------------------------------------------------------------------

/**
 * Returns true if the current token stream matches the inline cardio pattern:
 *   bare_word  number  time_unit_bare_word  (newline | dedent | eof)
 * (i.e. `jogging 10m` or `walking 5m`) — which should be parsed as an
 * inline cardio activity in a cooldown block rather than as a recovery exercise.
 *
 * This is deliberately narrow: it only matches when the duration is the LAST
 * thing on the line (no trailing `x<reps>` or `sides` tokens), which avoids
 * misclassifying recovery exercises like `chest_stretch 30s x2 sides both`.
 */
function isCooldownCardioPattern(state: ParseState): boolean {
  const t0 = state.tokens[state.pos];
  const t1 = state.tokens[state.pos + 1];
  const t2 = state.tokens[state.pos + 2];
  const t3 = state.tokens[state.pos + 3];
  if (!t0 || !t1 || !t2) return false;
  if (t0.type !== "bare_word") return false;
  if (t1.type !== "number") return false;
  // t2 must be a time-unit bare_word (m, s, h, d, minutes, seconds, hours)
  if (t2.type !== "bare_word") return false;
  if (!TIME_UNIT_SHORT_SET.has(String(t2.value))) return false;
  // t3 must be newline, dedent, or eof — nothing else after the duration.
  // If there's more (e.g. "x2", "sides"), it's a recovery exercise.
  if (!t3) return true;
  return t3.type === "newline" || t3.type === "dedent" || t3.type === "eof";
}

/**
 * Parses a `<modality> <duration>` inline cardio activity inside a cooldown
 * block. Produces a `Cardio` AST node with `category: "cooldown"`.
 */
function parseCooldownInlineCardio(state: ParseState): Cardio {
  const fromOffset = currentOffset(state);
  const modality = expectBareWord(state);                    // e.g. "jogging"
  const durationValue = expectNumber(state);                 // e.g. 10
  const unitTok = currentToken(state);
  const unit: TimeUnit = TIME_UNIT_SHORT_SET.has(String(unitTok.value))
    ? parseTimeUnit(String(unitTok.value))
    : "minutes";
  if (unitTok.type === "bare_word" && TIME_UNIT_SHORT_SET.has(String(unitTok.value))) {
    advance(state); // consume the unit token
  }

  return {
    kind: "cardio",
    modality,
    cardio_type: "continuous",
    total_duration: { value: durationValue, unit },
    zone: null,
    intensity: null,
    intervals: null,
    range: makeRange(state, fromOffset),
  };
}

// ---------------------------------------------------------------------------
// Exercise / Simple Activity dispatch
// ---------------------------------------------------------------------------

function parseExerciseOrSimpleActivity(state: ParseState): Activity {
  const fromOffset = currentOffset(state);
  const name = expectBareWord(state);
  const tok = currentToken(state);

  if (tok.type === "number") {
    const setsOrDuration = tok.value as number;
    advance(state);

    let next = currentToken(state);

    // Handle compact xAMRAP / xN style tokens (schema v1.6.0+).
    // The lexer produces `xAMRAP` as a single bare_word. Synthesise a virtual
    // "x" + the remainder so the exercise branch below is entered correctly.
    if (next.type === "bare_word") {
      const bw = String(next.value);
      if (/^x/i.test(bw) && bw.length > 1) {
        // Replace the token in-place by advancing and re-inserting two tokens.
        // Simplest approach: overwrite the token value and insert a synthetic
        // number or AMRAP keyword at the current position after advancing.
        const rest = bw.slice(1); // the part after "x"
        // Mutate the current token to value "x" so the check below fires.
        state.tokens[state.pos] = {
          ...next,
          type: "keyword",
          value: "x",
        } as typeof next;
        // Insert the reps part as a synthetic token immediately after.
        const numericRest = /^\d+$/.test(rest) ? Number(rest) : null;
        const syntheticToken = numericRest !== null
          ? { ...next, type: "number" as const, value: numericRest }
          : {
              ...next,
              type: "keyword" as const,
              value: rest.toLowerCase(), // e.g. "amrap"
            };
        state.tokens.splice(state.pos + 1, 0, syntheticToken as typeof next);
        // Refresh next after mutation
        next = currentToken(state);
      }
    }

    // Check for "x" (sets x reps)
    if (
      (next.type === "keyword" && next.value === "x") ||
      (next.type === "bare_word" && next.value === "x")
    ) {
      advance(state); // skip "x"
      const { reps, amrap: repsAmrap } = parseRepsSpec(state);

      const modifiers = parseExerciseModifiers(state);

      // Validate the exercise ref
      validateExerciseRef(state, name);

      const primaryMuscles = modifiers.primary_muscles as string[] | undefined;
      const secondaryMuscles = modifiers.secondary_muscles as string[] | undefined;

      return {
        kind: "exercise",
        exercise_ref: name,
        name: (modifiers.name as string) ?? null,
        sets: Math.trunc(setsOrDuration),
        reps,
        reps_amrap: repsAmrap || null,
        rpe: (modifiers.rpe as number) ?? null,
        rir: (modifiers.rir as number) ?? null,
        tempo: (modifiers.tempo as string) ?? null,
        rest: (modifiers.rest as Duration) ?? null,
        weight: (modifiers.weight as Weight) ?? null,
        to_failure: (modifiers.to_failure as boolean) ?? null,
        primary_muscles:
          primaryMuscles && primaryMuscles.length > 0
            ? (primaryMuscles as import("./types.js").MuscleGroup[])
            : null,
        secondary_muscles:
          secondaryMuscles && secondaryMuscles.length > 0
            ? (secondaryMuscles as import("./types.js").MuscleGroup[])
            : null,
        movement_pattern:
          (modifiers.movement_pattern as
            | import("./types.js").MovementPattern
            | undefined) ?? null,
        range: makeRange(state, fromOffset),
      };
    }

    // Check for duration unit after number (e.g., "jumping_jacks 2m" or
    // "cycling 10 minutes"). Accept both short and long unit forms so the
    // unit token is always consumed; otherwise the long-word `minutes` /
    // `seconds` / `hours` would leak into block-body parsing.
    const isShortUnit = next.type === "bare_word" && TIME_UNIT_SHORT_SET.has(next.value as string);
    const isLongUnit =
      next.type === "keyword" &&
      typeof next.value === "string" &&
      (next.value === "minutes" ||
        next.value === "seconds" ||
        next.value === "hours" ||
        next.value === "days");
    if (isShortUnit || isLongUnit) {
      advance(state);
      const duration = {
        value: setsOrDuration,
        unit: parseTimeUnit(next.value as string),
      };
      // Tolerate trailing intensity/effort modifiers on a simple
      // duration-based activity (e.g. `cycling 20m rpe 6` or
      // `rowing 5m heart_rate_zone 2`). The simple-activity schema does
      // not carry these fields, so the values are intentionally dropped —
      // the goal is to prevent the modifier keywords from leaking into
      // block-body parsing and silently truncating subsequent WEEK blocks.
      consumeSimpleActivityModifiers(state);
      return {
        kind: "simple",
        name,
        duration,
        params: null,
        range: makeRange(state, fromOffset),
      };
    }

    // Simple activity with number only (assume minutes)
    consumeSimpleActivityModifiers(state);
    return {
      kind: "simple",
      name,
      duration: { value: setsOrDuration, unit: "minutes" },
      params: null,
      range: makeRange(state, fromOffset),
    };
  }

  // Simple activity without parameters, check for optional inline duration
  const duration = parseOptionalInlineDuration(state);

  return {
    kind: "simple",
    name,
    duration,
    params: null,
    range: makeRange(state, fromOffset),
  };
}

function validateExerciseRef(state: ParseState, ref: string): void {
  const result = validateExercise(ref);
  if (!result.ok) {
    addError(
      state,
      unknownExerciseRef(ref, currentLocation(state), result.suggestions),
    );
  }
}

// ---------------------------------------------------------------------------
// Reps Spec: single | range | range+target
// ---------------------------------------------------------------------------

/**
 * Parses a reps spec. Returns `{ reps, amrap }` where:
 *   - reps:  the parsed RepsSpec (0 sentinel when AMRAP)
 *   - amrap: true when the AMRAP token was consumed (schema v1.6.0+)
 *
 * Accepted forms:
 *   - A plain number:             10
 *   - A range:                    6..8
 *   - A range with target:        6..8 target 7
 *   - AMRAP (any case):           amrap / AMRAP → reps=0, amrap=true
 */
function parseRepsSpec(state: ParseState): { reps: RepsSpec; amrap: boolean } {
  // Accept AMRAP / amrap as a bare reps token (schema v1.6.0+).
  const tok = currentToken(state);
  if (
    (tok.type === "keyword" || tok.type === "bare_word") &&
    String(tok.value).toLowerCase() === "amrap"
  ) {
    advance(state);
    return { reps: 0, amrap: true };
  }

  const first = expectNumber(state);

  if (currentToken(state).type === "range") {
    advance(state);
    const second = expectNumber(state);

    // Check for target
    if (
      currentToken(state).type === "keyword" &&
      currentToken(state).value === "target"
    ) {
      advance(state);
      const target = expectNumber(state);
      return {
        reps: [Math.trunc(first), Math.trunc(second), Math.trunc(target)],
        amrap: false,
      };
    }

    return { reps: [Math.trunc(first), Math.trunc(second)], amrap: false };
  }

  // Tolerate trailing time-unit suffix on the reps number ("20s", "2m") —
  // BUT only when followed by an exercise modifier keyword. Models often
  // write `plank 3x30s rpe 6 rest 60 seconds` meaning "3 sets × 30 sec at
  // RPE 6." Without consuming the `s`, the modifier keywords leak into
  // parent parsing and silently truncate subsequent WEEK blocks.
  //
  // When `s`/`m` is followed by anything else (newline, indent, dedent),
  // it stays in the stream so existing conformance behaviour (where a
  // standalone `s` after `NxN` becomes its own simple activity) is
  // preserved.
  const next = currentToken(state);
  if (next.type === "bare_word" && (next.value === "s" || next.value === "m")) {
    const after = state.tokens[state.pos + 1];
    const modifierKeywords = new Set([
      "rpe",
      "rir",
      "rest",
      "tempo",
      "weight",
      "name",
      "to_failure",
      "bodyweight",
    ]);
    if (
      after &&
      after.type === "keyword" &&
      typeof after.value === "string" &&
      modifierKeywords.has(after.value)
    ) {
      advance(state);
    }
  }

  return { reps: Math.trunc(first), amrap: false };
}

// ---------------------------------------------------------------------------
// Exercise Modifiers: rpe, rir, tempo, rest, weight, name
// ---------------------------------------------------------------------------

// Consume trailing exercise-modifier keywords on a simple activity and
// discard them. SimpleActivity has no fields for rpe/rir/rest/etc, so the
// values are dropped — but consuming the tokens prevents them from leaking
// into block-body parsing where they would silently truncate downstream
// WEEK blocks. Tolerant; bails on the first token that isn't a known
// modifier keyword.
function consumeSimpleActivityModifiers(state: ParseState): void {
  const modifierKeywords = new Set([
    "rpe",
    "rir",
    "rest",
    "tempo",
    "weight",
    "name",
    "to_failure",
    "bodyweight",
    "heart_rate_zone",
    "bpm",
    "pace",
  ]);
  for (;;) {
    const tok = currentToken(state);
    if (tok.type !== "keyword") return;
    if (typeof tok.value !== "string" || !modifierKeywords.has(tok.value)) return;
    advance(state);
    // Each known modifier takes at least one argument; consume tokens
    // until we hit a newline, dedent, eof, or another modifier keyword.
    while (true) {
      const t = currentToken(state);
      if (
        t.type === "newline" ||
        t.type === "dedent" ||
        t.type === "eof" ||
        t.type === "indent"
      )
        break;
      if (
        t.type === "keyword" &&
        typeof t.value === "string" &&
        modifierKeywords.has(t.value)
      )
        break;
      advance(state);
    }
  }
}

function parseExerciseModifiers(
  state: ParseState,
): Record<string, unknown> {
  const modifiers: Record<string, unknown> = {};

  for (;;) {
    const tok = currentToken(state);
    if (tok.type !== "keyword") break;

    switch (tok.value) {
      case "rpe":
        advance(state);
        // Support both `rpe 7` and `rpe 7..8`. Models frequently write
        // ranges; previously the range tokens leaked into downstream
        // parsing and silently truncated entire WEEK blocks.
        {
          const first = Math.trunc(expectNumber(state));
          if (currentToken(state).type === "range") {
            advance(state);
            const second = Math.trunc(expectNumber(state));
            modifiers.rpe_min = first;
            modifiers.rpe_max = second;
          } else {
            modifiers.rpe = first;
          }
        }
        continue;
      case "rir":
        advance(state);
        {
          const first = Math.trunc(expectNumber(state));
          if (currentToken(state).type === "range") {
            advance(state);
            const second = Math.trunc(expectNumber(state));
            modifiers.rir_min = first;
            modifiers.rir_max = second;
          } else {
            modifiers.rir = first;
          }
        }
        continue;
      case "tempo":
        advance(state);
        modifiers.tempo = parseTempo(state);
        continue;
      case "rest":
        advance(state);
        modifiers.rest = parseDuration(state);
        continue;
      case "weight":
        advance(state);
        modifiers.weight = parseWeightSpec(state);
        continue;
      case "name":
        advance(state);
        modifiers.name = expectString(state);
        continue;
      case "to_failure":
        // v1.6.0: perform set to momentary muscular failure
        advance(state);
        modifiers.to_failure = true;
        continue;
      case "bodyweight":
        // `pull_up 3x8 bodyweight` — bare bodyweight keyword as weight modifier
        advance(state);
        modifiers.weight = { type: "bodyweight", value: null, unit: null };
        continue;
      case "muscles": {
        advance(state);
        const { primary, secondary } = parseMuscleSpec(state);
        modifiers.primary_muscles = primary;
        modifiers.secondary_muscles = secondary;
        continue;
      }
      case "pattern":
        advance(state);
        modifiers.movement_pattern = parseMovementPattern(state);
        continue;
      default:
        return modifiers;
    }
  }

  return modifiers;
}

/**
 * Parses a muscle-group spec following the `muscles` keyword. Two forms:
 *   muscles chest, triceps                       — all primary
 *   muscles primary chest, triceps secondary front_delts
 */
function parseMuscleSpec(state: ParseState): {
  primary: string[];
  secondary: string[];
} {
  const peek = currentToken(state);

  // Explicit form starts with `primary` keyword.
  if (peek.type === "keyword" && peek.value === "primary") {
    advance(state);
    const primary = parseMuscleList(state);
    let secondary: string[] = [];
    const next = currentToken(state);
    if (next.type === "keyword" && next.value === "secondary") {
      advance(state);
      secondary = parseMuscleList(state);
    }
    return { primary, secondary };
  }

  // Shorthand: comma list, all primary.
  return { primary: parseMuscleList(state), secondary: [] };
}

/** Comma-separated list of muscle-group bare words. Stops at any non-muscle token. */
function parseMuscleList(state: ParseState): string[] {
  const items: string[] = [];
  for (;;) {
    const tok = currentToken(state);
    if (tok.type !== "bare_word") break;
    const value = tok.value as string;
    if (!MUSCLE_GROUP_SET.has(value)) break;
    items.push(value);
    advance(state);
    const sep = currentToken(state);
    if (sep.type === "comma") {
      advance(state);
      continue;
    }
    break;
  }
  return items;
}

function parseMovementPattern(state: ParseState): string | null {
  const tok = currentToken(state);
  if (tok.type !== "bare_word") return null;
  const value = tok.value as string;
  if (!MOVEMENT_PATTERN_SET.has(value)) return null;
  advance(state);
  return value;
}

function parseTempo(state: ParseState): string {
  const tok = currentToken(state);

  if (tok.type === "number") {
    const first = tok.value as number;
    advance(state);

    if (currentToken(state).type === "minus") {
      advance(state);
      const second = expectNumber(state);
      expectMinus(state);
      const third = expectNumber(state);
      expectMinus(state);
      const fourth = expectNumber(state);
      return `${Math.trunc(first)}-${Math.trunc(second)}-${Math.trunc(third)}-${Math.trunc(fourth)}`;
    }

    return `${Math.trunc(first)}`;
  }

  if (tok.type === "bare_word" && (tok.value as string).length === 7) {
    advance(state);
    return tok.value as string;
  }

  return "2-0-2-0";
}

function parseWeightSpec(state: ParseState): Weight {
  const fromOffset = currentOffset(state);
  const tok = currentToken(state);

  if (tok.type === "keyword" && tok.value === "bodyweight") {
    advance(state);
    return { type: "bodyweight", value: null, unit: null, range: makeRange(state, fromOffset) };
  }

  if (tok.type === "number") {
    const value = tok.value as number;
    advance(state);

    // Optional `%` symbol enables `weight 33% bw` / `weight 80% rm` forms.
    let percentSyntax = false;
    if (currentToken(state).type === "percent") {
      percentSyntax = true;
      advance(state);
    }

    // Unit token may be a bareword (`kg`, `lbs`, `bw`, `rm`) or one of the
    // weight-type keywords (`bodyweight`, `percentage_1rm`,
    // `percentage_bodyweight`) — both classifications surface the value
    // string we need.
    const unitTok = currentToken(state);
    if (unitTok.type !== "bare_word" && unitTok.type !== "keyword") {
      return expectBareWord(state) as never;
    }
    const unit = String(unitTok.value);
    advance(state);

    let type: WeightType;
    if (
      unit === "bw" ||
      unit === "bodyweight" ||
      unit === "percentage_bodyweight"
    ) {
      type = "percentage_bodyweight";
    } else if (
      percentSyntax ||
      unit === "rm" ||
      unit === "1rm" ||
      unit === "percentage_1rm"
    ) {
      type = "percentage_1rm";
    } else {
      type = "absolute";
    }

    // Optional `metric <value>` qualifier (schema v1.6.0+).
    // Only meaningful for percentage_1rm weights; safely ignored otherwise.
    let metric: import("./types.js").WeightMetric | undefined;
    const metricTok = currentToken(state);
    if (
      (metricTok.type === "keyword" || metricTok.type === "bare_word") &&
      metricTok.value === "metric"
    ) {
      advance(state);
      const metricValTok = currentToken(state);
      if (metricValTok.type === "bare_word" || metricValTok.type === "keyword") {
        const metricStr = String(metricValTok.value).toLowerCase();
        // Map to canonical enum: 1rm -> 1RM, e1rm -> e1RM, training_max, daily_max
        metric = WEIGHT_METRIC_SYNONYMS[metricStr] as import("./types.js").WeightMetric | undefined;
        if (metric) {
          advance(state);
        }
      } else if (metricValTok.type === "number") {
        // Handle "1rm": lexer tokenizes `1` as number, `rm` as bare_word.
        // Reconstruct by concatenating number + next bare_word.
        const nextTok = state.tokens[state.pos + 1];
        if (nextTok && nextTok.type === "bare_word") {
          const combined = `${metricValTok.value}${nextTok.value}`.toLowerCase();
          metric = WEIGHT_METRIC_SYNONYMS[combined] as import("./types.js").WeightMetric | undefined;
          if (metric) {
            advance(state); // skip number
            advance(state); // skip bare_word
          }
        }
      }
    }

    const w: Weight = { type, value, unit, range: makeRange(state, fromOffset) };
    if (metric) w.metric = metric;
    return w;
  }

  return { type: "bodyweight", value: null, unit: null, range: makeRange(state, fromOffset) };
}

function parseOptionalInlineDuration(
  state: ParseState,
): Duration | null {
  const tok = currentToken(state);

  if (tok.type === "number") {
    const value = tok.value as number;
    advance(state);

    const next = currentToken(state);
    if (next.type === "bare_word" && TIME_UNIT_SHORT_SET.has(next.value as string)) {
      advance(state);
      return { value, unit: parseTimeUnit(next.value as string) };
    }

    // Put back - number without unit isn't an inline duration
    state.pos--;
    return null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Cardio Activity
// ---------------------------------------------------------------------------

function parseCardioActivity(state: ParseState): Cardio {
  const fromOffset = currentOffset(state);
  advance(state); // skip "cardio"
  const modality = expectBareWord(state);
  const cardioTypeStr = expectBareWord(state);
  expectColon(state);
  skipNewlines(state);

  if (currentToken(state).type === "indent") {
    advance(state);
  }

  const attrs = parseCardioBody(state);

  const cardioType: CardioType = CARDIO_TYPE_SET.has(cardioTypeStr)
    ? (cardioTypeStr as CardioType)
    : (GRAMMAR.cardio_type[0] as CardioType);

  // If the source said `zone N model M`, propagate the zone_model so the
  // compiler can emit `intensity.zone_model` (schema v1.3.0+).
  let intensity = (attrs.intensity as Intensity | undefined) ?? null;
  const zoneModel = attrs.zone_model as
    | import("./types.js").IntensityZoneModel
    | undefined;
  if (zoneModel) {
    intensity = intensity
      ? { ...intensity, zone_model: zoneModel }
      : {
          type: "heart_rate_zone",
          value: (attrs.zone as number | undefined) ?? null,
          bounds: null,
          zone_model: zoneModel,
          range: makeRange(state, fromOffset),
        };
  }

  return {
    kind: "cardio",
    modality,
    cardio_type: cardioType,
    total_duration: (attrs.total_duration as Duration) ?? {
      value: 0,
      unit: "minutes",
    },
    zone: (attrs.zone as number) ?? null,
    intensity,
    intervals: (attrs.intervals as IntervalPattern) ?? null,
    range: makeRange(state, fromOffset),
  };
}

function parseCardioBody(
  state: ParseState,
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword") {
      switch (tok.value) {
        case "total":
          advance(state);
          attrs.total_duration = parseDuration(state);
          continue;
        case "zone": {
          advance(state);
          attrs.zone = Math.trunc(expectNumber(state));
          // Optional `model <zone_model>` qualifier (schema v1.3.0+).
          const next = currentToken(state);
          if (next.type === "keyword" && next.value === "model") {
            advance(state);
            const modelTok = currentToken(state);
            if (
              (modelTok.type === "bare_word" || modelTok.type === "keyword") &&
              INTENSITY_ZONE_MODEL_SET.has(String(modelTok.value))
            ) {
              attrs.zone_model = String(modelTok.value);
              advance(state);
            }
          }
          continue;
        }
        case "intensity":
          advance(state);
          attrs.intensity = parseIntensity(state);
          continue;
        default:
          break;
      }
    }

    // Interval pattern: starts with a number
    if (tok.type === "number") {
      attrs.intervals = parseIntervalPattern(state);
      continue;
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    break;
  }

  return attrs;
}

function parseIntensity(state: ParseState): Intensity | null {
  const fromOffset = currentOffset(state);
  const tok = currentToken(state);

  if (tok.type !== "keyword") return null;

  switch (tok.value) {
    case "rpe": {
      advance(state);
      const first = expectNumber(state);
      // Support `rpe 7..8` (range) in addition to `rpe 7` (single value).
      // Models commonly emit ranges to express target zones; treating them
      // as a syntax error silently truncated the rest of the document.
      if (currentToken(state).type === "range") {
        advance(state);
        const second = expectNumber(state);
        return {
          type: "rpe",
          value: null,
          bounds: [first, second],
          range: makeRange(state, fromOffset),
        };
      }
      return { type: "rpe", value: first, bounds: null, range: makeRange(state, fromOffset) };
    }
    case "heart_rate_zone": {
      advance(state);
      const value = Math.trunc(expectNumber(state));
      return { type: "heart_rate_zone", value, bounds: null, range: makeRange(state, fromOffset) };
    }
    case "bpm": {
      advance(state);
      const min = expectNumber(state);
      expectRange(state);
      const max = expectNumber(state);
      return {
        type: "bpm",
        value: null,
        bounds: [Math.trunc(min), Math.trunc(max)],
        range: makeRange(state, fromOffset),
      };
    }
    case "pace": {
      advance(state);
      const pace = expectString(state);
      return { type: "pace", value: pace, bounds: null, range: makeRange(state, fromOffset) };
    }
    default:
      return null;
  }
}

function parseIntervalPattern(state: ParseState): IntervalPattern {
  const fromOffset = currentOffset(state);
  const work = expectNumber(state);

  // Expect 's' for seconds
  if (
    currentToken(state).type === "bare_word" &&
    currentToken(state).value === "s"
  ) {
    advance(state);
  }

  expectKeyword(state, "work");
  expectSlash(state);
  const restSeconds = expectNumber(state);

  if (
    currentToken(state).type === "bare_word" &&
    currentToken(state).value === "s"
  ) {
    advance(state);
  }

  expectKeyword(state, "rest");

  // Handle both "x" as keyword and bare_word
  const xTok = currentToken(state);
  if (
    (xTok.type === "keyword" || xTok.type === "bare_word") &&
    xTok.value === "x"
  ) {
    advance(state);
  }

  const repeats = expectNumber(state);

  return {
    work_seconds: Math.trunc(work),
    rest_seconds: Math.trunc(restSeconds),
    repeats: Math.trunc(repeats),
    range: makeRange(state, fromOffset),
  };
}

// ---------------------------------------------------------------------------
// Nutrition Activity
// ---------------------------------------------------------------------------

function parseNutritionActivity(state: ParseState): Nutrition {
  const fromOffset = currentOffset(state);
  advance(state); // skip "nutrition"
  const category = expectBareWord(state);
  expectColon(state);
  skipNewlines(state);

  if (currentToken(state).type === "indent") {
    advance(state);
  }

  const attrs = parseNutritionBody(state);

  const out: Nutrition = {
    kind: "nutrition",
    category,
    timing: (attrs.timing as NutritionTiming) ?? null,
    macros: (attrs.macros as Macros) ?? null,
    calories: (attrs.calories as [number, number]) ?? null,
    suggestions: (attrs.suggestions as string[]) ?? null,
    range: makeRange(state, fromOffset),
  };
  if (attrs.calories_unit) {
    out.calories_unit = attrs.calories_unit as import("./types.js").CalorieUnit;
  }
  return out;
}

function parseNutritionBody(
  state: ParseState,
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  let macrosFromOffset = -1;

  const ensureMacros = (fromOffset: number): Macros => {
    let macros = attrs.macros as Macros | undefined;
    if (!macros) {
      macrosFromOffset = fromOffset;
      macros = { protein: null, carbs: null, fat: null };
      attrs.macros = macros;
    }
    return macros;
  };

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword") {
      switch (tok.value) {
        case "timing":
          advance(state);
          attrs.timing = parseNutritionTiming(state);
          continue;
        case "protein": {
          const fromOffset = currentOffset(state);
          advance(state);
          const range = parseMacroRange(state);
          const macros = ensureMacros(fromOffset);
          macros.protein = range;
          macros.range = makeRange(state, macrosFromOffset);
          continue;
        }
        case "carbs": {
          const fromOffset = currentOffset(state);
          advance(state);
          const range = parseMacroRange(state);
          const macros = ensureMacros(fromOffset);
          macros.carbs = range;
          macros.range = makeRange(state, macrosFromOffset);
          continue;
        }
        case "fat": {
          const fromOffset = currentOffset(state);
          advance(state);
          const range = parseFatRange(state);
          const macros = ensureMacros(fromOffset);
          macros.fat = range;
          macros.range = makeRange(state, macrosFromOffset);
          continue;
        }
        case "calories": {
          advance(state);
          const min = expectNumber(state);
          expectRange(state);
          const max = expectNumber(state);

          // Optional unit token after the range:
          //   bareword `kcal` (default), `kcal_per_kg`, or
          //   `multiplier_of_tdee`. Absent → kcal.
          let calorieUnit: import("./types.js").CalorieUnit = "kcal";
          const unitTok = currentToken(state);
          if (unitTok.type === "bare_word" || unitTok.type === "keyword") {
            const v = String(unitTok.value);
            if (v === "kcal" || v === "kcal_per_kg" || v === "multiplier_of_tdee") {
              calorieUnit = v;
              advance(state);
            }
          }

          // Truncate to integers only for absolute kcal — per-kg and tdee
          // multipliers are typically fractional.
          attrs.calories =
            calorieUnit === "kcal"
              ? [Math.trunc(min), Math.trunc(max)]
              : [min, max];
          attrs.calories_unit = calorieUnit;
          continue;
        }
        case "suggestions":
          advance(state);
          expectColon(state);
          skipNewlines(state);
          expectIndent(state);
          attrs.suggestions = parseSuggestionList(state);
          continue;
        default:
          break;
      }
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    break;
  }

  return attrs;
}

function parseNutritionTiming(
  state: ParseState,
): NutritionTiming | null {
  const fromOffset = currentOffset(state);
  const tok = currentToken(state);
  if (tok.type !== "keyword") return null;

  switch (tok.value) {
    case "after_workout": {
      advance(state);
      expectPlus(state);
      const duration = parseDuration(state);
      return { type: "after_workout", duration, time: null, range: makeRange(state, fromOffset) };
    }
    case "before_workout": {
      advance(state);
      expectMinus(state);
      const duration = parseDuration(state);
      return { type: "before_workout", duration, time: null, range: makeRange(state, fromOffset) };
    }
    case "at": {
      advance(state);
      const time = expectTime(state);
      return { type: "at_time", duration: null, time, range: makeRange(state, fromOffset) };
    }
    default:
      return null;
  }
}

function parseMacroRange(state: ParseState): MacroRange {
  const min = expectNumber(state);
  expectRange(state);
  const max = expectNumber(state);
  const unit = consumeMacroUnit(state);

  // Per-kg values are typically fractional (e.g. 1.6 g/kg) — preserve;
  // absolute grams are conventionally integer, so truncate to match
  // existing behavior.
  if (unit === "g_per_kg") return [min, max, unit];
  return [Math.trunc(min), Math.trunc(max), unit];
}

function parseFatRange(state: ParseState): MacroRange {
  if (currentToken(state).type === "lte") {
    advance(state);
    const max = expectNumber(state);
    const unit = consumeMacroUnit(state);

    if (unit === "g_per_kg") return [0, max, unit];
    // For fat with "<=", set min to 0
    return [0, Math.trunc(max), unit];
  }

  return parseMacroRange(state);
}

/**
 * Consume the optional unit token after a macro range.
 *   • bareword `g`         → "g" (default)
 *   • bareword `g_per_kg`  → "g_per_kg"
 *   • bareword `g/kg`-like → not currently emitted by the lexer (slash is
 *     not a punctuation token in this grammar); use `g_per_kg` instead.
 */
function consumeMacroUnit(state: ParseState): import("./types.js").MacroUnit {
  const tok = currentToken(state);
  if (tok.type === "bare_word") {
    const v = String(tok.value);
    if (v === "g") {
      advance(state);
      return "g";
    }
    if (v === "g_per_kg") {
      advance(state);
      return "g_per_kg";
    }
  }
  return "g";
}

function parseSuggestionList(state: ParseState): string[] {
  const suggestions: string[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "minus") {
      advance(state);
      const value = parseValue(state);
      suggestions.push(String(value ?? ""));
    } else if (tok.type === "dedent") {
      advance(state);
      break;
    } else {
      break;
    }
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Meditation Activity
// ---------------------------------------------------------------------------

function parseMeditationActivity(state: ParseState): Meditation {
  const fromOffset = currentOffset(state);
  advance(state); // skip "meditation"
  const category = expectBareWord(state);
  expectColon(state);
  skipNewlines(state);

  if (currentToken(state).type === "indent") {
    advance(state);
  }

  const attrs = parseMeditationBody(state);

  return {
    kind: "meditation",
    category,
    duration: (attrs.duration as Duration) ?? { value: 0, unit: "minutes" },
    guided: (attrs.guided as boolean) ?? null,
    audio_id: (attrs.audio_id as string) ?? null,
    range: makeRange(state, fromOffset),
  };
}

function parseMeditationBody(
  state: ParseState,
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword") {
      switch (tok.value) {
        case "duration":
          advance(state);
          attrs.duration = parseDuration(state);
          continue;
        case "guided":
          advance(state);
          attrs.guided = expectBoolean(state);
          continue;
        case "audio":
          advance(state);
          attrs.audio_id = expectBareWord(state);
          continue;
        default:
          break;
      }
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    break;
  }

  return attrs;
}

// ---------------------------------------------------------------------------
// Recovery Activity
// ---------------------------------------------------------------------------

function parseRecoveryActivity(state: ParseState): Recovery {
  const fromOffset = currentOffset(state);
  advance(state); // skip "recovery"
  const category = expectBareWord(state);
  expectColon(state);
  skipNewlines(state);

  if (currentToken(state).type === "indent") {
    advance(state);
  }

  const { attrs, exercises } = parseRecoveryBody(state);

  return {
    kind: "recovery",
    category,
    duration: (attrs.duration as Duration) ?? { value: 0, unit: "minutes" },
    exercises: exercises.length === 0 ? null : exercises,
    range: makeRange(state, fromOffset),
  };
}

function parseRecoveryBody(state: ParseState): {
  attrs: Record<string, unknown>;
  exercises: RecoveryExercise[];
} {
  const attrs: Record<string, unknown> = {};
  const exercises: RecoveryExercise[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword" && tok.value === "duration") {
      advance(state);
      attrs.duration = parseDuration(state);
      continue;
    }

    if (tok.type === "bare_word") {
      const ex = parseRecoveryExercise(state);
      exercises.push(ex);
      // Check for a pnf continuation line (schema v1.6.0+)
      skipNewlines(state);
      const pnfTok = currentToken(state);
      if (
        (pnfTok.type === "keyword" || pnfTok.type === "bare_word") &&
        pnfTok.value === "pnf"
      ) {
        const pnfParams = parsePnfContinuation(state);
        if (pnfParams) {
          ex.pnf = pnfParams;
        }
      }
      continue;
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    break;
  }

  return { attrs, exercises };
}

function parseRecoveryExercise(state: ParseState): RecoveryExercise {
  const fromOffset = currentOffset(state);
  const name = expectBareWord(state);
  const hold = expectNumber(state);

  // Skip "s" for seconds
  if (
    currentToken(state).type === "bare_word" &&
    currentToken(state).value === "s"
  ) {
    advance(state);
  }

  // Handle both "x" as keyword and bare_word
  const xTok = currentToken(state);
  if (
    (xTok.type === "keyword" || xTok.type === "bare_word") &&
    xTok.value === "x"
  ) {
    advance(state);
  }

  const reps = expectNumber(state);

  let sides: RecoverySides | null = null;
  if (
    currentToken(state).type === "keyword" &&
    currentToken(state).value === "sides"
  ) {
    advance(state);
    const sideStr = expectBareWord(state);
    sides = RECOVERY_SIDES_SET.has(sideStr)
      ? (sideStr as RecoverySides)
      : (GRAMMAR.recovery_sides[0] as RecoverySides);
  }

  // v1.6.0 extensions: modality, intensity (→ intensity_rpe), body (→ body_part)
  let modality: import("./types.js").RecoveryModality | undefined;
  let intensityRpe: number | undefined;
  let bodyPart: string | undefined;

  // Parse optional modifiers in any order (modality, intensity, body)
  for (;;) {
    const t = currentToken(state);
    if (t.type !== "keyword" && t.type !== "bare_word") break;

    if (t.value === "modality") {
      advance(state);
      const modalTok = currentToken(state);
      if (modalTok.type === "keyword" || modalTok.type === "bare_word") {
        const modalStr = String(modalTok.value);
        if (RECOVERY_MODALITY_SET_GRAMMAR.has(modalStr)) {
          modality = modalStr as import("./types.js").RecoveryModality;
          advance(state);
        } else {
          // Resolve via synonym map (e.g. foam_roll → smr_foam_roll)
          const resolved = RECOVERY_MODALITY_SYNONYMS[modalStr];
          if (resolved !== undefined) {
            modality = resolved as import("./types.js").RecoveryModality;
            advance(state);
          }
        }
      }
      continue;
    }

    if (t.value === "intensity") {
      advance(state);
      intensityRpe = Math.trunc(expectNumber(state));
      continue;
    }

    if (t.value === "body") {
      advance(state);
      // Accept any bare_word or keyword as the body part identifier
      const bodyTok = currentToken(state);
      if (bodyTok.type === "bare_word" || bodyTok.type === "keyword") {
        bodyPart = String(bodyTok.value);
        advance(state);
      }
      continue;
    }

    break;
  }

  const ex: RecoveryExercise = {
    name,
    hold_seconds: Math.trunc(hold),
    reps: Math.trunc(reps),
    sides,
    range: makeRange(state, fromOffset),
  };

  if (modality !== undefined) ex.modality = modality;
  if (intensityRpe !== undefined) ex.intensity_rpe = intensityRpe;
  if (bodyPart !== undefined) ex.body_part = bodyPart;

  return ex;
}

/**
 * Parses a `pnf` continuation line (schema v1.6.0+):
 *   pnf <Ns> contract <Ns> relax <int> contractions
 * Expects the `pnf` keyword as the current token.
 */
function parsePnfContinuation(state: ParseState): PnfParams | null {
  advance(state); // skip "pnf"

  const contractionSec = expectNumber(state);

  // Skip "s" for seconds
  if (
    currentToken(state).type === "bare_word" &&
    currentToken(state).value === "s"
  ) {
    advance(state);
  }

  // Expect "contract" keyword
  const contractTok = currentToken(state);
  if (
    (contractTok.type === "keyword" || contractTok.type === "bare_word") &&
    contractTok.value === "contract"
  ) {
    advance(state);
  }

  const relaxSec = expectNumber(state);

  // Skip "s" for seconds
  if (
    currentToken(state).type === "bare_word" &&
    currentToken(state).value === "s"
  ) {
    advance(state);
  }

  // Expect "relax" keyword
  const relaxTok = currentToken(state);
  if (
    (relaxTok.type === "keyword" || relaxTok.type === "bare_word") &&
    relaxTok.value === "relax"
  ) {
    advance(state);
  }

  const contractions = expectNumber(state);

  // Skip "contractions" label if present
  const contractionsLabelTok = currentToken(state);
  if (
    (contractionsLabelTok.type === "keyword" || contractionsLabelTok.type === "bare_word") &&
    contractionsLabelTok.value === "contractions"
  ) {
    advance(state);
  }

  return {
    contraction_seconds: Math.trunc(contractionSec),
    relax_seconds: Math.trunc(relaxSec),
    contractions: Math.trunc(contractions),
  };
}

/** Wraps a recovery exercise as a Recovery Activity for cooldown blocks */
function parseRecoveryExerciseAsActivity(state: ParseState): Recovery {
  const fromOffset = currentOffset(state);
  const exercise = parseRecoveryExercise(state);
  return {
    kind: "recovery",
    category: "cooldown",
    duration: { value: 0, unit: "minutes" },
    exercises: [exercise],
    range: makeRange(state, fromOffset),
  };
}

// ---------------------------------------------------------------------------
// Habit Activity
// ---------------------------------------------------------------------------

/**
 * Parses a sub-plan inclusion (schema v1.5.0+):
 *   subplan plan_warmup_full_body
 *   subplan plan_warmup_full_body "Standard warmup"
 */
function parseSubPlanActivity(state: ParseState): import("./types.js").SubPlan {
  const fromOffset = currentOffset(state);
  advance(state); // skip "subplan"
  const ref = expectBareWord(state);

  let name: string | null = null;
  if (currentToken(state).type === "string") {
    name = currentToken(state).value as string;
    advance(state);
  }

  return {
    kind: "sub_plan",
    sub_plan_ref: ref,
    name,
    range: makeRange(state, fromOffset),
  };
}

function parseHabitActivity(state: ParseState): Habit {
  const fromOffset = currentOffset(state);
  advance(state); // skip "habit"
  const category = expectBareWord(state);
  expectColon(state);
  skipNewlines(state);

  if (currentToken(state).type === "indent") {
    advance(state);
  }

  const attrs = parseHabitBody(state);

  return {
    kind: "habit",
    category,
    target: (attrs.target as number) ?? null,
    target_unit: (attrs.target_unit as string) ?? null,
    frequency: (attrs.frequency as string) ?? null,
    reminders: (attrs.reminders as string[]) ?? null,
    range: makeRange(state, fromOffset),
  };
}

function parseHabitBody(state: ParseState): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword") {
      switch (tok.value) {
        case "target": {
          advance(state);
          const value = expectNumber(state);
          const unit = expectBareWord(state);
          attrs.target = value;
          attrs.target_unit = unit;
          continue;
        }
        case "frequency":
          advance(state);
          attrs.frequency = expectBareWord(state);
          continue;
        case "reminders":
          advance(state);
          attrs.reminders = parseTimeList(state);
          continue;
        default:
          break;
      }
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    break;
  }

  return attrs;
}

function parseTimeList(state: ParseState): string[] {
  const times: string[] = [];

  for (;;) {
    const tok = currentToken(state);
    if (tok.type === "time") {
      times.push(tok.value as string);
      advance(state);
      maybeSkipComma(state);
    } else {
      break;
    }
  }

  return times;
}

// ---------------------------------------------------------------------------
// Progress Section
// ---------------------------------------------------------------------------

function parseProgressSection(state: ParseState): Progress {
  const fromOffset = currentOffset(state);
  advance(state); // skip PROGRESS
  skipNewlines(state);

  if (currentToken(state).type === "indent") {
    advance(state);
    const attrs = parseProgressBody(state);

    return {
      checkpoints: (attrs.checkpoints as Checkpoint[]) ?? null,
      points: (attrs.points as PointsConfig) ?? null,
      achievements: (attrs.achievements as Achievement[]) ?? null,
      streaks: (attrs.streaks as StreaksConfig) ?? null,
      range: makeRange(state, fromOffset),
    };
  }

  return {
    checkpoints: null,
    points: null,
    achievements: null,
    streaks: null,
    range: makeRange(state, fromOffset),
  };
}

function parseProgressBody(
  state: ParseState,
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword") {
      switch (tok.value) {
        case "checkpoints":
          advance(state);
          expectColon(state);
          skipNewlines(state);
          expectIndent(state);
          attrs.checkpoints = parseCheckpoints(state);
          continue;
        case "checkpoint":
        case "CHECKPOINT": {
          // Short form: CHECKPOINT items directly inside PROGRESS (no wrapper block)
          const cp = parseCheckpoint(state);
          const cps = (attrs.checkpoints as Checkpoint[]) ?? [];
          cps.push(cp);
          attrs.checkpoints = cps;
          continue;
        }
        case "points": {
          advance(state);
          const enabled = expectEnabledDisabled(state);
          const rules = parsePointsRules(state);
          attrs.points = { enabled, rules } as PointsConfig;
          continue;
        }
        case "achievements":
          advance(state);
          expectColon(state);
          skipNewlines(state);
          expectIndent(state);
          attrs.achievements = parseAchievements(state);
          continue;
        case "streaks": {
          const fromOffset = currentOffset(state);
          advance(state);
          const enabled = expectEnabledDisabled(state);
          const types = parseStreaksTypes(state);
          attrs.streaks = {
            enabled,
            types,
            range: makeRange(state, fromOffset),
          } as StreaksConfig;
          continue;
        }
        default:
          break;
      }
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    break;
  }

  return attrs;
}

function parseCheckpoints(state: ParseState): Checkpoint[] {
  const checkpoints: Checkpoint[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword" && tok.value === "checkpoint") {
      checkpoints.push(parseCheckpoint(state));
    } else if (tok.type === "dedent") {
      advance(state);
      break;
    } else {
      break;
    }
  }

  return checkpoints;
}

function parseCheckpoint(state: ParseState): Checkpoint {
  const fromOffset = currentOffset(state);
  advance(state); // skip "checkpoint"
  const name = expectString(state);
  expectColon(state);
  skipNewlines(state);
  expectIndent(state);
  const attrs = parseCheckpointBody(state);

  return {
    name,
    trigger: (attrs.trigger as CheckpointTrigger) ?? { type: "manual" },
    measurements: (attrs.measurements as (string | MeasurementSpec)[]) ?? null,
    questions: (attrs.questions as string[]) ?? null,
    range: makeRange(state, fromOffset),
  };
}

function parseCheckpointBody(
  state: ParseState,
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword") {
      switch (tok.value) {
        case "trigger":
          advance(state);
          attrs.trigger = parseTrigger(state);
          continue;
        case "at": {
          // Alternative trigger syntax: `at N weeks` / `at N days`
          advance(state);
          const atVal = Math.trunc(expectNumber(state));
          // Consume optional unit (weeks / days)
          const unitTok = currentToken(state);
          if (unitTok.type === "keyword" || unitTok.type === "bare_word") {
            advance(state); // skip unit; we treat `at N weeks` as every=N unit_count=1
          }
          attrs.trigger = { type: "time", every: atVal, unit_count: 1 } as CheckpointTrigger;
          continue;
        }
        case "measure":
          advance(state);
          expectColon(state);
          skipNewlines(state);
          expectIndent(state);
          attrs.measurements = parseMeasurementList(state);
          continue;
        case "ask":
          advance(state);
          expectColon(state);
          skipNewlines(state);
          expectIndent(state);
          attrs.questions = parseStringList(state);
          continue;
        default:
          break;
      }
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    break;
  }

  return attrs;
}

function parseTrigger(state: ParseState): CheckpointTrigger {
  const tok = currentToken(state);

  // `completion` may be tokenised as bare_word (not in the keyword list) or
  // as keyword. Handle both token types so the error is always emitted.
  const tokValue = String(tok.value ?? "");
  if (tokValue === "completion" && (tok.type === "keyword" || tok.type === "bare_word")) {
    // "trigger completion" (no-arg) is not a supported form.
    // The caller should use `at N weeks` or `at N days` instead.
    addError(
      state,
      invalidStructure(
        "Unsupported checkpoint trigger 'completion' — use 'at N weeks' or 'at N days'.",
        tok.location,
      ),
    );
    advance(state);
    return { type: "manual" };
  }

  if (tok.type === "keyword") {
    switch (tok.value) {
      case "time": {
        advance(state);
        expectKeyword(state, "week");
        const week = expectNumber(state);
        expectKeyword(state, "day");
        const day = expectNumber(state);
        return {
          type: "time",
          every: Math.trunc(week),
          unit_count: Math.trunc(day),
        };
      }
      case "manual":
        advance(state);
        return { type: "manual" };
    }
  }

  return { type: "manual" };
}

function parseStringList(state: ParseState): string[] {
  const items: string[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "minus") {
      advance(state);
      const next = currentToken(state);
      if (next.type === "string") {
        items.push(next.value as string);
        advance(state);
      } else if (next.type === "bare_word") {
        items.push(next.value as string);
        advance(state);
      } else {
        items.push("");
      }
    } else if (tok.type === "dedent") {
      advance(state);
      break;
    } else {
      break;
    }
  }

  return items;
}

/**
 * Parses a measurement list under the `measure:` key (schema v1.6.0+).
 * Accepts both the legacy dash-prefixed string list AND new undecorated items:
 *
 * Legacy form (back-compat):
 *   - body_weight                    → plain string "body_weight"
 *   - "quoted string"                → plain string "quoted string"
 *
 * New structured forms (schema v1.6.0+):
 *   body_weight_kg                   → { metric: "body_weight_kg" }
 *   "free form string"               → "free form string" (plain string)
 *   questionnaire_score questionnaire psqi [note "text"]
 *                                    → { metric, questionnaire, note? }
 *
 * Unknown bare words are emitted as plain strings (warn-not-error policy).
 */
function parseMeasurementList(state: ParseState): (string | MeasurementSpec)[] {
  const items: (string | MeasurementSpec)[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    // Dash-prefixed form — handles both legacy plain strings and typed MeasurementSpec
    if (tok.type === "minus") {
      advance(state);
      const next = currentToken(state);
      if (next.type === "string") {
        items.push(next.value as string);
        advance(state);
      } else if (next.type === "bare_word" || next.type === "keyword") {
        const metricStr = String(next.value);
        if (MEASUREMENT_METRIC_ENUM_SET.has(metricStr)) {
          // Typed spec — parse optional questionnaire and note qualifiers
          advance(state);
          const spec: MeasurementSpec = { metric: metricStr as MeasurementMetric };

          // Optional questionnaire qualifier
          const questTok = currentToken(state);
          if (
            (questTok.type === "keyword" || questTok.type === "bare_word") &&
            questTok.value === "questionnaire"
          ) {
            advance(state);
            const questValTok = currentToken(state);
            if (questValTok.type === "bare_word" || questValTok.type === "keyword") {
              const questStr = String(questValTok.value).toLowerCase();
              if (QUESTIONNAIRE_SET.has(questStr)) {
                spec.questionnaire = questStr as import("./types.js").Questionnaire;
                advance(state);
              }
            }
          }

          // Optional note qualifier
          const noteTok = currentToken(state);
          if (
            (noteTok.type === "keyword" || noteTok.type === "bare_word") &&
            noteTok.value === "note"
          ) {
            advance(state);
            if (currentToken(state).type === "string") {
              spec.note = currentToken(state).value as string;
              advance(state);
            }
          }

          items.push(spec);
        } else {
          // Unknown bare word — emit as plain string
          items.push(metricStr);
          advance(state);
        }
      } else {
        items.push("");
      }
      continue;
    }

    // Quoted string → plain string (back-compat, no type wrapping)
    if (tok.type === "string") {
      items.push(tok.value as string);
      advance(state);
      continue;
    }

    // Bare word — check if it's a known MeasurementMetric enum value
    if (tok.type === "bare_word" || tok.type === "keyword") {
      const metricStr = String(tok.value);
      if (MEASUREMENT_METRIC_ENUM_SET.has(metricStr)) {
        advance(state);
        const spec: MeasurementSpec = { metric: metricStr as MeasurementMetric };

        // Optional questionnaire qualifier
        const questTok = currentToken(state);
        if (
          (questTok.type === "keyword" || questTok.type === "bare_word") &&
          questTok.value === "questionnaire"
        ) {
          advance(state);
          const questValTok = currentToken(state);
          if (questValTok.type === "bare_word" || questValTok.type === "keyword") {
            const questStr = String(questValTok.value).toLowerCase();
            if (QUESTIONNAIRE_SET.has(questStr)) {
              spec.questionnaire = questStr as import("./types.js").Questionnaire;
              advance(state);
            }
          }
        }

        // Optional note qualifier
        const noteTok = currentToken(state);
        if (
          (noteTok.type === "keyword" || noteTok.type === "bare_word") &&
          noteTok.value === "note"
        ) {
          advance(state);
          if (currentToken(state).type === "string") {
            spec.note = currentToken(state).value as string;
            advance(state);
          }
        }

        items.push(spec);
      } else {
        // Unknown bare word — emit as plain string (warn-not-error policy)
        items.push(metricStr);
        advance(state);
      }
      continue;
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    break;
  }

  return items;
}

function parsePointsRules(
  state: ParseState,
): PointsRule[] | null {
  if (currentToken(state).type !== "indent") return null;

  advance(state);
  skipNewlines(state);

  if (
    currentToken(state).type === "keyword" &&
    currentToken(state).value === "rules"
  ) {
    advance(state);
    expectColon(state);
    skipNewlines(state);
    expectIndent(state);
    const rules = parsePointsRulesList(state);

    if (currentToken(state).type === "dedent") {
      advance(state);
    }

    return rules;
  }

  if (currentToken(state).type === "dedent") {
    advance(state);
    return null;
  }

  return null;
}

function parsePointsRulesList(state: ParseState): PointsRule[] {
  const rules: PointsRule[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "minus") {
      const fromOffset = currentOffset(state);
      advance(state);
      const name = expectBareWord(state);
      const points = expectNumber(state);
      rules.push({
        activity: name,
        points: Math.trunc(points),
        range: makeRange(state, fromOffset),
      });
    } else if (tok.type === "dedent") {
      advance(state);
      break;
    } else {
      break;
    }
  }

  return rules;
}

function parseAchievements(state: ParseState): Achievement[] {
  const achievements: Achievement[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword" && tok.value === "achievement") {
      achievements.push(parseAchievement(state));
    } else if (tok.type === "dedent") {
      advance(state);
      break;
    } else {
      break;
    }
  }

  return achievements;
}

function parseAchievement(state: ParseState): Achievement {
  const fromOffset = currentOffset(state);
  advance(state); // skip "achievement"
  const id = expectBareWord(state);
  expectColon(state);
  skipNewlines(state);
  expectIndent(state);
  const attrs = parseAchievementBody(state);

  return {
    id,
    name: (attrs.name as string) ?? "",
    description: (attrs.description as string) ?? "",
    condition: (attrs.condition as string) ?? "",
    condition_value: (attrs.condition_value as number) ?? 0,
    points: (attrs.points as number) ?? 0,
    range: makeRange(state, fromOffset),
  };
}

function parseAchievementBody(
  state: ParseState,
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword") {
      switch (tok.value) {
        case "name":
          advance(state);
          attrs.name = expectString(state);
          continue;
        case "description":
          advance(state);
          attrs.description = expectString(state);
          continue;
        case "condition": {
          advance(state);
          const condName = expectBareWord(state);
          const condValue = expectNumber(state);
          attrs.condition = condName;
          attrs.condition_value = Math.trunc(condValue);
          continue;
        }
        case "points":
          advance(state);
          attrs.points = Math.trunc(expectNumber(state));
          continue;
        default:
          break;
      }
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    break;
  }

  return attrs;
}

function parseStreaksTypes(state: ParseState): string[] | null {
  if (currentToken(state).type !== "indent") return null;

  advance(state);
  skipNewlines(state);

  if (
    currentToken(state).type === "keyword" &&
    currentToken(state).value === "types"
  ) {
    advance(state);
    const types = parseEnumList(state);

    if (currentToken(state).type === "dedent") {
      advance(state);
    }

    return types;
  }

  if (currentToken(state).type === "dedent") {
    advance(state);
    return null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Notifications Section
// ---------------------------------------------------------------------------

function parseNotificationsSection(state: ParseState): Notification[] {
  advance(state); // skip NOTIFICATIONS
  skipNewlines(state);

  if (currentToken(state).type === "indent") {
    advance(state);
    return parseNotifications(state);
  }
  return [];
}

function parseNotifications(state: ParseState): Notification[] {
  const notifications: Notification[] = [];

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "bare_word") {
      notifications.push(parseNotification(state));
    } else if (tok.type === "dedent") {
      advance(state);
      break;
    } else {
      break;
    }
  }

  return notifications;
}

function parseNotification(state: ParseState): Notification {
  const fromOffset = currentOffset(state);
  const id = expectBareWord(state);
  expectColon(state);
  skipNewlines(state);
  expectIndent(state);
  const attrs = parseNotificationBody(state);

  return {
    id,
    enabled: (attrs.enabled as boolean) ?? false,
    timing: (attrs.timing as { duration: Duration; relative_to: string }) ?? null,
    message: (attrs.message as string) ?? "",
    range: makeRange(state, fromOffset),
  };
}

function parseNotificationBody(
  state: ParseState,
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword") {
      switch (tok.value) {
        case "enabled":
          advance(state);
          attrs.enabled = expectBoolean(state);
          continue;
        case "timing": {
          advance(state);
          const duration = parseDuration(state);
          expectKeyword(state, "before");
          const event = expectBareWord(state);
          attrs.timing = { duration, relative_to: event };
          continue;
        }
        case "message":
          advance(state);
          attrs.message = expectString(state);
          continue;
        default:
          break;
      }
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    break;
  }

  return attrs;
}

// ---------------------------------------------------------------------------
// Rendering Section
// ---------------------------------------------------------------------------

function parseRenderingSection(state: ParseState): Rendering {
  const fromOffset = currentOffset(state);
  advance(state); // skip RENDERING
  skipNewlines(state);

  if (currentToken(state).type === "indent") {
    advance(state);
    const attrs = parseRenderingBody(state);

    return {
      primary_color: (attrs.primary as string) ?? null,
      secondary_color: (attrs.secondary as string) ?? null,
      accent_color: (attrs.accent as string) ?? null,
      icons: (attrs.icons as Record<string, string>) ?? null,
      difficulty_colors:
        (attrs.difficulty_colors as Record<string, string>) ?? null,
      range: makeRange(state, fromOffset),
    };
  }

  return {
    primary_color: null,
    secondary_color: null,
    accent_color: null,
    icons: null,
    difficulty_colors: null,
    range: makeRange(state, fromOffset),
  };
}

function parseRenderingBody(
  state: ParseState,
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};

  for (;;) {
    skipNewlines(state);
    const tok = currentToken(state);

    if (tok.type === "keyword") {
      switch (tok.value) {
        case "primary":
          advance(state);
          attrs.primary = expectString(state);
          continue;
        case "secondary":
          advance(state);
          attrs.secondary = expectString(state);
          continue;
        case "accent":
          advance(state);
          attrs.accent = expectString(state);
          continue;
        case "icon": {
          advance(state);
          const iconName = expectBareWord(state);
          expectEq(state);
          const iconValue = expectBareWord(state);
          const icons =
            (attrs.icons as Record<string, string>) ?? {};
          icons[iconName] = iconValue;
          attrs.icons = icons;
          continue;
        }
        case "difficulty_color": {
          advance(state);
          const difficulty = expectBareWord(state);
          expectEq(state);
          const color = expectString(state);
          const colors =
            (attrs.difficulty_colors as Record<string, string>) ?? {};
          colors[difficulty] = color;
          attrs.difficulty_colors = colors;
          continue;
        }
        default:
          break;
      }
    }

    if (tok.type === "dedent") {
      advance(state);
      break;
    }

    break;
  }

  return attrs;
}

// ---------------------------------------------------------------------------
// Duration Helpers
// ---------------------------------------------------------------------------

function parseDuration(state: ParseState): Duration {
  const value = expectNumber(state);
  const unit = expectBareWord(state);

  return { value, unit: parseTimeUnit(unit) };
}

function parseDurationInline(state: ParseState): Duration {
  const tok = currentToken(state);

  if (tok.type === "number") {
    const value = tok.value as number;
    advance(state);

    const next = currentToken(state);
    if (
      next.type === "bare_word" &&
      TIME_UNIT_SHORT_SET.has(next.value as string)
    ) {
      advance(state);
      return { value, unit: parseTimeUnit(next.value as string) };
    }

    // Assume minutes
    return { value, unit: "minutes" };
  }

  return { value: 0, unit: "minutes" };
}

function parseTimeUnit(unit: string): TimeUnit {
  switch (unit) {
    case "s":
    case "seconds":
      return "seconds";
    case "m":
    case "minutes":
      return "minutes";
    case "h":
    case "hours":
      return "hours";
    case "d":
    case "days":
      return "days";
    case "weeks":
      return "weeks";
    default:
      return "minutes";
  }
}

// ---------------------------------------------------------------------------
// Tag / Enum List
// ---------------------------------------------------------------------------

function parseTagList(state: ParseState): string[] {
  // Tags may begin with a digit (e.g. "531", "1rm_estimate").
  // The lexer tokenises digit-leading text as a number followed by an
  // identifier, so we need to accept number tokens here and also detect
  // the digit-prefix + identifier continuation pattern (e.g. 1 + rm_estimate
  // → "1rm_estimate").
  const items: string[] = [];

  for (;;) {
    const tok = currentToken(state);

    if (tok.type === "bare_word" || tok.type === "keyword") {
      items.push(tok.value as string);
      advance(state);
      maybeSkipComma(state);
      continue;
    }

    if (tok.type === "number") {
      // Could be a plain digit tag ("531") or the prefix of a digit-leading
      // identifier ("1rm_estimate"). Peek at the next token to decide.
      const numStr = String(tok.value as number);
      advance(state);
      const next = currentToken(state);
      if (next.type === "bare_word" || next.type === "keyword") {
        // Digit-leading identifier: concatenate without separator.
        items.push(numStr + (next.value as string));
        advance(state);
      } else {
        // Plain numeric tag.
        items.push(numStr);
      }
      maybeSkipComma(state);
      continue;
    }

    break;
  }

  return items;
}

function parseEnumList(state: ParseState): string[] {
  const items: string[] = [];

  for (;;) {
    const tok = currentToken(state);

    if (tok.type === "bare_word" || tok.type === "keyword") {
      items.push(tok.value as string);
      advance(state);
      maybeSkipComma(state);
    } else {
      break;
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Expect Helpers (lenient - return defaults on mismatch)
// ---------------------------------------------------------------------------

function expectBareWord(state: ParseState): string {
  const tok = currentToken(state);
  if (tok.type === "bare_word" || tok.type === "keyword") {
    advance(state);
    return tok.value as string;
  }
  // Lenient: return the value as string without advancing
  return `${tok.value}`;
}

function expectBareWordOrKeyword(state: ParseState): string {
  const tok = currentToken(state);
  if (tok.type === "bare_word" || tok.type === "keyword") {
    advance(state);
    return tok.value as string;
  }
  return "";
}

function expectString(state: ParseState): string {
  const tok = currentToken(state);
  if (tok.type === "string") {
    advance(state);
    return tok.value as string;
  }
  return "";
}

function expectNumber(state: ParseState): number {
  const tok = currentToken(state);
  if (tok.type === "number") {
    advance(state);
    return tok.value as number;
  }
  return 0;
}

function expectDate(state: ParseState): string {
  const tok = currentToken(state);
  if (tok.type === "date") {
    advance(state);
    return tok.value as string;
  }
  return new Date().toISOString().slice(0, 10);
}

function expectTime(state: ParseState): string {
  const tok = currentToken(state);
  if (tok.type === "time") {
    advance(state);
    return tok.value as string;
  }
  return "00:00";
}

function expectBoolean(state: ParseState): boolean {
  const tok = currentToken(state);
  if (
    (tok.type === "keyword" || tok.type === "bare_word") &&
    (tok.value === "true" || tok.value === "false")
  ) {
    advance(state);
    return tok.value === "true";
  }
  return false;
}

function expectEnabledDisabled(state: ParseState): boolean {
  const tok = currentToken(state);
  if (tok.type === "keyword") {
    if (tok.value === "enabled") {
      advance(state);
      return true;
    }
    if (tok.value === "disabled") {
      advance(state);
      return false;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Punctuation Expect Helpers (lenient - skip if present)
// ---------------------------------------------------------------------------

function expectColon(state: ParseState): void {
  if (currentToken(state).type === "colon") advance(state);
}

function expectLparen(state: ParseState): void {
  if (currentToken(state).type === "lparen") advance(state);
}

function expectRparen(state: ParseState): void {
  if (currentToken(state).type === "rparen") advance(state);
}

function expectRange(state: ParseState): void {
  if (currentToken(state).type === "range") advance(state);
}

function expectArrow(state: ParseState): void {
  if (currentToken(state).type === "arrow") advance(state);
}

function expectEq(state: ParseState): void {
  if (currentToken(state).type === "eq") advance(state);
}

function expectPercent(state: ParseState): void {
  if (currentToken(state).type === "percent") advance(state);
}

function expectPlus(state: ParseState): void {
  if (currentToken(state).type === "plus") advance(state);
}

function expectMinus(state: ParseState): void {
  if (currentToken(state).type === "minus") advance(state);
}

function expectSlash(state: ParseState): void {
  if (currentToken(state).type === "slash") advance(state);
}

function expectIndent(state: ParseState): void {
  if (currentToken(state).type === "indent") advance(state);
}

function expectKeyword(state: ParseState, expected: string): void {
  const tok = currentToken(state);
  if (
    (tok.type === "keyword" || tok.type === "bare_word") &&
    tok.value === expected
  ) {
    advance(state);
  }
}

function maybeSkipComma(state: ParseState): void {
  if (currentToken(state).type === "comma") advance(state);
}

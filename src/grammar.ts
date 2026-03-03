// ---------------------------------------------------------------------------
// WPL-AI Grammar Definition (derived from WPL-AI EBNF spec)
// ---------------------------------------------------------------------------
// Single source of truth for all parser enums, keywords, and vocabulary.
// The parser references these tables instead of hardcoding values in
// switch/case statements. The lexer KEYWORDS set is separate (tokenization).
// ---------------------------------------------------------------------------

export const GRAMMAR = {
  // -- Header enums (EBNF §3) --
  plan_type: ["workout", "nutrition", "meditation", "recovery", "hybrid"],
  visibility: ["private", "public", "template"],
  difficulty: ["beginner", "intermediate", "advanced", "adaptive"],

  // -- Top-level sections (EBNF §2) --
  sections: {
    required: ["PHASES"],
    optional: ["GOALS", "REQUIRES", "PERSONALIZATION", "PROGRESS", "NOTIFICATIONS", "RENDERING"],
  },

  // -- Goals (EBNF §4) --
  goal_priority: ["primary", "secondary"],
  measurement_type: ["absolute", "relative", "percentage"],

  // -- Requirements (EBNF §5) --
  contraindication_action: ["exclude", "modify"],

  // -- Personalization (EBNF §6) --
  input_type: ["number", "string", "array", "enum", "boolean"],
  comparison_op: ["==", "!=", ">=", "<=", ">", "<", "contains", "not_contains"],
  logical_op: ["AND", "OR"],
  action_type: [
    "modify_intensity", "add_warmup_time", "add_activity",
    "replace_exercise", "exclude_exercise", "reduce_sets",
    "reduce_reps", "increase_rest",
  ],
  action_scope: ["activity", "block", "day", "week", "phase", "plan"],

  // -- Phases/Days/Blocks (EBNF §7) --
  day_name: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  day_type: ["training", "rest", "active_recovery", "assessment"],
  block_type: ["warmup", "main", "cooldown", "nutrition", "meditation", "education", "assessment"],
  block_structure: ["circuit", "straight_sets", "superset", "emom", "amrap", "tabata"],

  // -- Activities (EBNF §8) --
  cardio_modality: ["running", "cycling", "swimming", "rowing", "elliptical", "jump_rope"],
  cardio_type: ["continuous", "intervals", "fartlek"],
  nutrition_category: ["meal", "snack", "supplement", "hydration"],
  meditation_category: ["breathing", "mindfulness", "visualization", "body_scan", "sleep"],
  recovery_category: ["stretching", "foam_rolling", "massage", "cold_therapy", "heat_therapy", "sleep", "cooldown"],
  habit_category: ["hydration", "sleep", "steps", "screen_time", "custom"],
  recovery_sides: ["both", "left", "right"],
  weight_type: ["bodyweight", "absolute", "percentage_1rm"],

  // -- Units (EBNF §1.3) --
  unit_time: ["seconds", "minutes", "hours", "days", "weeks"],
  unit_time_short: ["s", "m", "h", "seconds", "minutes", "hours"],
  unit_weight: ["kg", "lbs", "percentage_1rm"],

  // -- Schedule (EBNF §7) --
  schedule_pref: ["morning", "afternoon", "evening", "any"],
  schedule_flex: ["strict", "flexible"],
} as const;

// ---------------------------------------------------------------------------
// Set-based lookups for O(1) validation
// ---------------------------------------------------------------------------

export const PLAN_TYPE_SET = new Set<string>(GRAMMAR.plan_type);
export const VISIBILITY_SET = new Set<string>(GRAMMAR.visibility);
export const DIFFICULTY_SET = new Set<string>(GRAMMAR.difficulty);
export const SECTION_REQUIRED_SET = new Set<string>(GRAMMAR.sections.required);
export const SECTION_ALL_SET = new Set<string>([
  ...GRAMMAR.sections.required,
  ...GRAMMAR.sections.optional,
]);
export const GOAL_PRIORITY_SET = new Set<string>(GRAMMAR.goal_priority);
export const MEASUREMENT_TYPE_SET = new Set<string>(GRAMMAR.measurement_type);
export const CONTRAINDICATION_ACTION_SET = new Set<string>(GRAMMAR.contraindication_action);
export const INPUT_TYPE_SET = new Set<string>(GRAMMAR.input_type);
export const ACTION_SCOPE_SET = new Set<string>(GRAMMAR.action_scope);
export const DAY_NAME_SET = new Set<string>(GRAMMAR.day_name);
export const DAY_TYPE_SET = new Set<string>(GRAMMAR.day_type);
export const BLOCK_TYPE_SET = new Set<string>(GRAMMAR.block_type);
export const BLOCK_STRUCTURE_SET = new Set<string>(GRAMMAR.block_structure);
export const CARDIO_TYPE_SET = new Set<string>(GRAMMAR.cardio_type);
export const RECOVERY_SIDES_SET = new Set<string>(GRAMMAR.recovery_sides);
export const TIME_UNIT_SHORT_SET = new Set<string>(GRAMMAR.unit_time_short);
export const SCHEDULE_PREF_SET = new Set<string>(GRAMMAR.schedule_pref);
export const SCHEDULE_FLEX_SET = new Set<string>(GRAMMAR.schedule_flex);

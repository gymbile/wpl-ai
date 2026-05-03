// ---------------------------------------------------------------------------
// Source range (character offsets in the original DSL source)
// ---------------------------------------------------------------------------

export interface SourceRange {
  from: number; // character offset (inclusive)
  to: number;   // character offset (exclusive)
}

export type PointerSourceMap = Map<string, SourceRange>;

// ---------------------------------------------------------------------------
// WPL AST Type Definitions (ported from Elixir ast.ex)
// ---------------------------------------------------------------------------
// Design decisions:
//   - Elixir atoms   -> string literal union types
//   - Elixir structs -> interfaces
//   - Elixir tuples  -> typed arrays or dedicated interfaces
//   - Optional fields use `| null` (not undefined) for JSON compatibility
//   - Activity union is discriminated by a `kind` field
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

export type TimeUnit = "seconds" | "minutes" | "hours" | "days" | "weeks";

export interface Duration {
  value: number;
  unit: TimeUnit;
}

// ---------------------------------------------------------------------------
// Plan types
// ---------------------------------------------------------------------------

export type PlanType =
  | "workout"
  | "nutrition"
  | "meditation"
  | "recovery"
  | "hybrid";

export type Visibility = "private" | "public" | "template";

export type Difficulty =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "adaptive";

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export interface Header {
  name: string;
  type: PlanType;
  visibility: Visibility | null;
  difficulty: Difficulty | null;
  duration: Duration | null;
  tags: string[] | null;
  language: string;
  min_app_version: string | null;
  schema: string | null;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export type GoalPriority = "primary" | "secondary";

export type MeasurementType = "absolute" | "relative" | "percentage";

export interface Target {
  metric: string;
  value: number;
  unit: string;
  measurement_type: MeasurementType;
  range?: SourceRange;
}

export interface Milestone {
  name: string;
  at_value: number;
  at_unit: string;
  reward_points: number | null;
  badge: string | null;
  range?: SourceRange;
}

export interface Goal {
  priority: GoalPriority;
  category: string;
  name: string | null;
  description: string | null;
  target: Target | null;
  deadline: string | null; // ISO date string
  milestones: Milestone[] | null;
  range?: SourceRange;
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

export interface Equipment {
  name: string;
  required: boolean;
  alternatives: string[] | null;
  range?: SourceRange;
}

export type ContraindicationAction = "exclude" | "modify";

export interface Contraindication {
  condition: string;
  action: ContraindicationAction;
  affects: string[] | null;
}

export interface TimeCommitment {
  days_per_week: [number, number];
  minutes_per_day: [number, number];
}

export interface Requirements {
  age_range: [number, number] | null;
  fitness_levels: string[] | null;
  equipment: Equipment[] | null;
  contraindications: Contraindication[] | null;
  time_commitment: TimeCommitment | null;
  range?: SourceRange;
}

// ---------------------------------------------------------------------------
// Personalization
// ---------------------------------------------------------------------------

export type InputType = "number" | "string" | "array" | "enum" | "boolean";

export interface Input {
  name: string;
  source: string;
  type: InputType;
  options: string[] | null;
  label: string | null;
  range?: SourceRange;
}

export type ConditionType = "simple" | "compound";

export type LogicalOp = "and" | "or";

export type ComparisonOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "not_contains";

export interface Condition {
  type: ConditionType;
  operator: LogicalOp | null; // for compound
  field: string | null; // for simple
  op: ComparisonOp | null; // for simple
  value: unknown | null; // for simple
  conditions: Condition[] | null; // for compound (recursive)
}

export type ActionType =
  | "modify_intensity"
  | "add_warmup_time"
  | "add_activity"
  | "replace_exercise"
  | "exclude_exercise"
  | "reduce_sets"
  | "reduce_reps"
  | "increase_rest";

export type ActionScope =
  | "activity"
  | "block"
  | "day"
  | "week"
  | "phase"
  | "plan";

export interface Action {
  type: ActionType;
  params: Record<string, unknown>;
  scope: ActionScope;
}

export interface Rule {
  condition: Condition;
  actions: Action[];
  range?: SourceRange;
}

export interface Personalization {
  inputs: Input[] | null;
  rules: Rule[];
  range?: SourceRange;
}

// ---------------------------------------------------------------------------
// Phases structure
// ---------------------------------------------------------------------------

export type PhaseType =
  | "accumulation"
  | "intensification"
  | "realization"
  | "deload"
  | "base"
  | "build"
  | "peak"
  | "recovery"
  | "transition";

export interface Phase {
  name: string;
  type: PhaseType | null;
  duration: Duration;
  goals: string[] | null;
  description: string | null;
  weeks: Week[];
  range?: SourceRange;
}

export interface Week {
  number: number;
  name: string | null;
  is_deload: boolean | null;
  days: Day[];
  range?: SourceRange;
}

export type DayType =
  | "training"
  | "rest"
  | "active_recovery"
  | "assessment";

export type SchedulePref = "morning" | "afternoon" | "evening" | "any";

export type ScheduleFlex = "strict" | "flexible";

export interface Day {
  day_name: string | number;
  day_type: DayType;
  duration: Duration;
  label: string | null;
  schedule: [SchedulePref, ScheduleFlex] | null;
  blocks: Block[];
  notes: string | null;
  range?: SourceRange;
}

export type BlockType =
  | "warmup"
  | "main"
  | "cooldown"
  | "nutrition"
  | "meditation"
  | "education"
  | "assessment";

export type BlockStructure =
  | "circuit"
  | "straight_sets"
  | "superset"
  | "emom"
  | "amrap"
  | "tabata";

export interface Block {
  type: BlockType;
  structure: BlockStructure | null;
  rounds: number | null;
  rest_between_rounds: Duration | null;
  activities: Activity[];
  range?: SourceRange;
}

// ---------------------------------------------------------------------------
// Activities (discriminated union via `kind`)
// ---------------------------------------------------------------------------

export type Activity =
  | Exercise
  | Cardio
  | Nutrition
  | Meditation
  | Recovery
  | Habit
  | SimpleActivity
  | SubPlan;

// single | range | range+target
export type RepsSpec = number | [number, number] | [number, number, number];

export type WeightType =
  | "bodyweight"
  | "absolute"
  | "percentage_1rm"
  | "percentage_bodyweight";

export interface Weight {
  type: WeightType;
  value: number | null;
  unit: string | null;
  range?: SourceRange;
}

/**
 * Lifting tempo. Either the conventional 4-digit string ("3-1-1-0", "30X1")
 * or a structured object that consuming tools can compute time-under-tension
 * from. The string form is preserved for human authoring.
 */
export type Tempo = string | StructuredTempo;

export interface StructuredTempo {
  eccentric: number;
  pause_bottom?: number;
  concentric: number;
  pause_top?: number;
  /** True = X in conventional notation: explosive/intent-maximal concentric. */
  explosive_concentric?: boolean;
}

export type MuscleGroup =
  | "chest"
  | "upper_back"
  | "lats"
  | "traps"
  | "front_delts"
  | "side_delts"
  | "rear_delts"
  | "biceps"
  | "triceps"
  | "forearms"
  | "abs"
  | "obliques"
  | "lower_back"
  | "spinal_erectors"
  | "glutes"
  | "quadriceps"
  | "hamstrings"
  | "calves"
  | "hip_adductors"
  | "hip_abductors"
  | "hip_flexors"
  | "neck";

export type MovementPattern =
  | "squat"
  | "hinge"
  | "lunge"
  | "push_horizontal"
  | "push_vertical"
  | "pull_horizontal"
  | "pull_vertical"
  | "carry"
  | "rotate"
  | "anti_rotate"
  | "gait"
  | "jump"
  | "isolation";

export interface Exercise {
  kind: "exercise";
  exercise_ref: string;
  name: string | null;
  sets: number;
  reps: RepsSpec;
  rpe: number | null;
  rir: number | null;
  tempo: Tempo | null;
  rest: Duration | null;
  weight: Weight | null;
  primary_muscles: MuscleGroup[] | null;
  secondary_muscles: MuscleGroup[] | null;
  movement_pattern: MovementPattern | null;
  range?: SourceRange;
}

export type CardioType = "continuous" | "intervals" | "fartlek";

export type IntensityType = "rpe" | "heart_rate_zone" | "bpm" | "pace" | "power";

export type IntensityZoneModel =
  | "hr_3_zone_seiler"
  | "hr_5_zone"
  | "hr_7_zone"
  | "power_coggan_7_zone"
  | "pace_critical_speed"
  | "rpe_borg_10"
  | "rpe_borg_20";

export interface Intensity {
  type: IntensityType;
  value: number | string | null;
  bounds: [number, number] | null;
  zone_model: IntensityZoneModel | null;
  range?: SourceRange;
}

export interface IntervalPattern {
  work_seconds: number;
  rest_seconds: number;
  repeats: number;
  range?: SourceRange;
}

export interface Cardio {
  kind: "cardio";
  modality: string;
  cardio_type: CardioType;
  total_duration: Duration;
  zone: number | null;
  intensity: Intensity | null;
  intervals: IntervalPattern | null;
  range?: SourceRange;
}

export type NutritionTimingType =
  | "after_workout"
  | "before_workout"
  | "at_time";

export interface NutritionTiming {
  type: NutritionTimingType;
  duration: Duration | null;
  time: string | null; // HH:MM string
  range?: SourceRange;
}

export type MacroRange = [number, number]; // [min, max]

export interface Macros {
  protein: MacroRange | null;
  carbs: MacroRange | null;
  fat: MacroRange | null;
  range?: SourceRange;
}

export interface Nutrition {
  kind: "nutrition";
  category: string;
  timing: NutritionTiming | null;
  macros: Macros | null;
  calories: [number, number] | null;
  suggestions: string[] | null;
  range?: SourceRange;
}

export interface Meditation {
  kind: "meditation";
  category: string;
  duration: Duration;
  guided: boolean | null;
  audio_id: string | null;
  range?: SourceRange;
}

export type RecoverySides = "both" | "left" | "right";

export interface RecoveryExercise {
  name: string;
  hold_seconds: number;
  reps: number;
  sides: RecoverySides | null;
  range?: SourceRange;
}

export interface Recovery {
  kind: "recovery";
  category: string;
  duration: Duration;
  exercises: RecoveryExercise[] | null;
  range?: SourceRange;
}

export interface Habit {
  kind: "habit";
  category: string;
  target: number;
  target_unit: string;
  frequency: string | null;
  reminders: string[] | null; // HH:MM strings
  range?: SourceRange;
}

export interface SimpleActivity {
  kind: "simple";
  name: string;
  duration: Duration | null;
  params: string[] | null;
  range?: SourceRange;
}

/**
 * Activity that includes another plan by reference. Lets a workout reuse a
 * 'warmup plan' or compose larger sessions from smaller plans. Resolution is
 * the consumer's responsibility; validators emit `CYCLIC_SUBPLAN` for
 * self-references and (with a `sub_plans` resolution map) for known cycles.
 */
export interface SubPlan {
  kind: "sub_plan";
  sub_plan_ref: string;
  name: string | null;
  range?: SourceRange;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export type CheckpointTrigger =
  | { type: "time"; every: number; unit_count: number }
  | { type: "completion" }
  | { type: "manual" };

export interface Checkpoint {
  name: string;
  trigger: CheckpointTrigger;
  measurements: string[] | null;
  questions: string[] | null;
  range?: SourceRange;
}

export interface PointsRule {
  activity: string;
  points: number;
  range?: SourceRange;
}

export interface PointsConfig {
  enabled: boolean;
  rules: PointsRule[] | null;
  range?: SourceRange;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  condition: string;
  condition_value: number;
  points: number;
  range?: SourceRange;
}

export interface StreaksConfig {
  enabled: boolean;
  types: string[] | null;
  range?: SourceRange;
}

export interface Progress {
  checkpoints: Checkpoint[] | null;
  points: PointsConfig | null;
  achievements: Achievement[] | null;
  streaks: StreaksConfig | null;
  range?: SourceRange;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  enabled: boolean;
  timing: { duration: Duration; relative_to: string } | null;
  message: string;
  range?: SourceRange;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export interface Rendering {
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  icons: Record<string, string> | null;
  difficulty_colors: Record<string, string> | null;
  range?: SourceRange;
}

// ---------------------------------------------------------------------------
// Document root
// ---------------------------------------------------------------------------

export interface OneRMEntry {
  exercise_ref: string;
  value: number;
  unit: "kg" | "lb";
}

export interface AthleteThresholds {
  hr_max_bpm?: number;
  lthr_bpm?: number;
  resting_hr_bpm?: number;
  ftp_watts?: number;
  vo2max_ml_kg_min?: number;
  critical_pace_seconds_per_km?: number;
  body_weight_kg?: number;
  one_rm?: OneRMEntry[];
}

export interface Document {
  header: Header;
  goals: Goal[] | null;
  requirements: Requirements | null;
  personalization: Personalization | null;
  athlete_thresholds: AthleteThresholds | null;
  phases: Phase[];
  progress: Progress | null;
  notifications: Notification[] | null;
  rendering: Rendering | null;
  range?: SourceRange;
}

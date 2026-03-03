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
}

export interface Milestone {
  name: string;
  at_value: number;
  at_unit: string;
  reward_points: number | null;
  badge: string | null;
}

export interface Goal {
  priority: GoalPriority;
  category: string;
  name: string | null;
  description: string | null;
  target: Target | null;
  deadline: string | null; // ISO date string
  milestones: Milestone[] | null;
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

export interface Equipment {
  name: string;
  required: boolean;
  alternatives: string[] | null;
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
}

export interface Personalization {
  inputs: Input[] | null;
  rules: Rule[];
}

// ---------------------------------------------------------------------------
// Phases structure
// ---------------------------------------------------------------------------

export interface Phase {
  name: string;
  duration: Duration;
  goals: string[] | null;
  description: string | null;
  weeks: Week[];
}

export interface Week {
  number: number;
  name: string | null;
  days: Day[];
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
  | SimpleActivity;

// single | range | range+target
export type RepsSpec = number | [number, number] | [number, number, number];

export type WeightType = "bodyweight" | "absolute" | "percentage_1rm";

export interface Weight {
  type: WeightType;
  value: number | null;
  unit: string | null;
}

export interface Exercise {
  kind: "exercise";
  exercise_ref: string;
  name: string | null;
  sets: number;
  reps: RepsSpec;
  rpe: number | null;
  rir: number | null;
  tempo: string | null;
  rest: Duration | null;
  weight: Weight | null;
}

export type CardioType = "continuous" | "intervals" | "fartlek";

export type IntensityType = "rpe" | "heart_rate_zone" | "bpm" | "pace";

export interface Intensity {
  type: IntensityType;
  value: number | string | null;
  range: [number, number] | null;
}

export interface IntervalPattern {
  work_seconds: number;
  rest_seconds: number;
  repeats: number;
}

export interface Cardio {
  kind: "cardio";
  modality: string;
  cardio_type: CardioType;
  total_duration: Duration;
  zone: number | null;
  intensity: Intensity | null;
  intervals: IntervalPattern | null;
}

export type NutritionTimingType =
  | "after_workout"
  | "before_workout"
  | "at_time";

export interface NutritionTiming {
  type: NutritionTimingType;
  duration: Duration | null;
  time: string | null; // HH:MM string
}

export type MacroRange = [number, number]; // [min, max]

export interface Macros {
  protein: MacroRange | null;
  carbs: MacroRange | null;
  fat: MacroRange | null;
}

export interface Nutrition {
  kind: "nutrition";
  category: string;
  timing: NutritionTiming | null;
  macros: Macros | null;
  calories: [number, number] | null;
  suggestions: string[] | null;
}

export interface Meditation {
  kind: "meditation";
  category: string;
  duration: Duration;
  guided: boolean | null;
  audio_id: string | null;
}

export type RecoverySides = "both" | "left" | "right";

export interface RecoveryExercise {
  name: string;
  hold_seconds: number;
  reps: number;
  sides: RecoverySides | null;
}

export interface Recovery {
  kind: "recovery";
  category: string;
  duration: Duration;
  exercises: RecoveryExercise[] | null;
}

export interface Habit {
  kind: "habit";
  category: string;
  target: number;
  target_unit: string;
  frequency: string | null;
  reminders: string[] | null; // HH:MM strings
}

export interface SimpleActivity {
  kind: "simple";
  name: string;
  duration: Duration | null;
  params: string[] | null;
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
}

export interface PointsRule {
  activity: string;
  points: number;
}

export interface PointsConfig {
  enabled: boolean;
  rules: PointsRule[] | null;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  condition: string;
  condition_value: number;
  points: number;
}

export interface StreaksConfig {
  enabled: boolean;
  types: string[] | null;
}

export interface Progress {
  checkpoints: Checkpoint[] | null;
  points: PointsConfig | null;
  achievements: Achievement[] | null;
  streaks: StreaksConfig | null;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  enabled: boolean;
  timing: { duration: Duration; relative_to: string } | null;
  message: string;
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
}

// ---------------------------------------------------------------------------
// Document root
// ---------------------------------------------------------------------------

export interface Document {
  header: Header;
  goals: Goal[] | null;
  requirements: Requirements | null;
  personalization: Personalization | null;
  phases: Phase[];
  progress: Progress | null;
  notifications: Notification[] | null;
  rendering: Rendering | null;
}

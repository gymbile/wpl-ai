export const UPPER_BODY = [
  "push_up", "pull_up", "chin_up", "dip",
  "bench_press", "incline_press", "decline_press", "dumbbell_press",
  "shoulder_press", "overhead_press", "military_press", "arnold_press",
  "dumbbell_row", "barbell_row", "bent_over_row", "cable_row", "seated_row",
  "inverted_row",
  "lat_pulldown", "cable_pulldown",
  "bicep_curl", "hammer_curl", "concentration_curl", "preacher_curl",
  "tricep_dip", "tricep_extension", "tricep_pushdown", "skull_crusher",
  "face_pull", "rear_delt_fly", "lateral_raise", "front_raise",
  "dumbbell_fly", "cable_fly", "chest_fly", "pec_deck",
  "shrug", "upright_row",
  "hangboard",
] as const;

export const LOWER_BODY = [
  "squat", "front_squat", "goblet_squat", "sumo_squat", "split_squat",
  "lunge", "walking_lunge", "reverse_lunge", "lateral_lunge",
  "deadlift", "romanian_deadlift", "sumo_deadlift", "trap_bar_deadlift",
  "leg_press", "hack_squat",
  "leg_curl", "leg_extension",
  "calf_raise", "seated_calf_raise", "standing_calf_raise",
  "glute_bridge", "hip_thrust",
  "step_up", "box_jump", "jump_squat",
  "hip_abduction", "hip_adduction",
  "good_morning",
] as const;

export const CORE = [
  "plank", "side_plank", "plank_up",
  "crunch", "bicycle_crunch", "reverse_crunch",
  "sit_up", "v_up",
  "russian_twist", "wood_chop",
  "leg_raise", "hanging_leg_raise", "lying_leg_raise",
  "mountain_climber",
  "dead_bug", "bird_dog",
  "ab_wheel", "ab_rollout",
  "hollow_hold", "hollow_rock",
  "toe_touch",
  "pallof_press",
  "superman", "back_extension",
] as const;

export const CARDIO_WARMUP = [
  "jumping_jack", "jump_rope", "high_knees", "butt_kicks",
  "burpee", "squat_jump", "tuck_jump",
  "arm_circles", "leg_swings", "hip_circles", "ankle_circles",
  "jog_in_place", "marching",
  "jumping_lunge", "box_step",
  "skater_jump",
  "bear_crawl", "crab_walk",
  "inchworm",
] as const;

export const STRETCHING = [
  "hamstring_stretch", "quad_stretch", "hip_flexor_stretch",
  "calf_stretch", "achilles_stretch",
  "chest_stretch", "shoulder_stretch", "tricep_stretch",
  "lat_stretch", "back_stretch", "spinal_twist",
  "neck_stretch", "neck_roll",
  "butterfly_stretch", "frog_stretch", "pigeon_pose",
  "child_pose", "cat_cow",
  "forward_fold", "standing_forward_fold",
  "figure_four_stretch",
  "wrist_circles", "ankle_rolls",
] as const;

export const FULL_BODY = [
  "turkish_getup", "clean", "clean_and_press",
  "snatch", "kettlebell_swing",
  "thrusters", "wall_ball",
  "farmers_walk", "suitcase_carry",
  "battle_ropes", "rowing",
] as const;

// Rehab / mobility / breathing exercises. These appear frequently in
// programmes for post-injury, postpartum, and rotator-cuff-impingement
// clients. Sourced from the wpl-eval v0.2.0 unknown_exercise_ref tail
// — every entry here was observed as a real (non-typo) emission by at
// least one model during the eval sweep.
export const REHAB_MOBILITY = [
  // Rotator-cuff / shoulder rehab
  "scapular_retraction", "external_rotation", "internal_rotation",
  "prone_T", "prone_Y", "prone_W",
  // Pelvic floor / postpartum / pregnancy
  "pelvic_tilt", "diaphragmatic_breathing",
] as const;

export const ALL_EXERCISES: readonly string[] = [
  ...UPPER_BODY, ...LOWER_BODY, ...CORE, ...CARDIO_WARMUP, ...STRETCHING, ...FULL_BODY,
  ...REHAB_MOBILITY,
];

// Build a Set for O(1) lookups
const exerciseSet = new Set(ALL_EXERCISES);

export function isKnownExercise(ref: string): boolean {
  return exerciseSet.has(ref);
}

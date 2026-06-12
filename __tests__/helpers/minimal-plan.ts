/**
 * A minimal WPL-AI plan that compiles cleanly (ok: true) with zero repairs.
 *
 * Proven by the integration.test.ts "returns { ok: true, json, ast } for valid
 * source" test (SIMPLE_PLAN). All exercise refs are catalog entries, all
 * sections are grammar-known, and no lenient defaults are fabricated.
 */
export const MINIMAL_PLAN = `\
PLAN "Simple Workout"
TYPE workout
VISIBILITY private
DIFFICULTY beginner
TAGS strength, beginner
LANGUAGE en

GOALS
  GOAL primary strength:
    name "Build Strength"
    deadline 2027-12-31

PHASES
  PHASE "Week One" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "Push Day":
        main straight_sets:
          push_up 3x10 rpe 7 rest 60 seconds
`;

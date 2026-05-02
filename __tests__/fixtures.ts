export interface WplAiExample {
  id: string;
  name: string;
  description: string;
  source: string;
}

export const WPL_AI_EXAMPLES: WplAiExample[] = [
  {
    id: "simple-upper-body",
    name: "Simple Upper Body Workout",
    description:
      "A beginner-friendly upper body session with warmup, straight sets, and cooldown stretches.",
    source: `\
PLAN "Simple Upper Body"
TYPE workout
VISIBILITY public
DIFFICULTY beginner
TAGS upper_body, strength, beginner
LANGUAGE en

GOALS
  GOAL primary strength:
    name "Build Upper Body Strength"

PHASES
  PHASE "Single Session" (1 weeks):
    WEEK 1:
      DAY Monday training 35m "Upper Body Focus":
        warmup:
          arm_circles 2m
          jumping_jack 2m
        main straight_sets:
          push_up 3x8..12 rpe 7 rest 60 seconds
          dumbbell_row 3x10 weight 10 kg rest 60 seconds
          overhead_press 3x8..10 weight 8 kg rest 90 seconds
        cooldown:
          chest_stretch 30s x2 sides both
          shoulder_stretch 30s x2 sides both`,
  },
  {
    id: "hiit-circuit-personalization",
    name: "HIIT Circuit with Personalization",
    description:
      "An intermediate HIIT circuit with injury-aware personalization rules and timed exercises.",
    source: `\
PLAN "HIIT Circuit"
TYPE workout
VISIBILITY template
DIFFICULTY intermediate
TAGS hiit, circuit, fat_loss
LANGUAGE en

GOALS
  GOAL primary endurance:
    name "Improve Cardiovascular Fitness"
  GOAL secondary weight_loss:
    name "Burn Calories Efficiently"

REQUIRES
  age 18..55
  fitness intermediate
  equipment:
    kettlebell (optional, alternatives: dumbbells)

PERSONALIZATION
  RULES
    WHEN injury contains knee:
      replace jump_squat -> goblet_squat
      replace burpee -> inchworm
    WHEN injury contains shoulder:
      exclude overhead_press

PHASES
  PHASE "HIIT Session" (1 weeks):
    WEEK 1:
      DAY Wednesday training 25m "Full Body HIIT":
        warmup:
          jumping_jack 2m
          high_knees 1m
        main circuit:
          rounds 4
          rest_between_rounds 90 seconds
          kettlebell_swing 3x12 rest 20 seconds
          jump_squat 3x10 rest 20 seconds
          push_up 3x10 rest 20 seconds
          burpee 3x8 rest 20 seconds
        cooldown:
          hamstring_stretch 30s x2 sides both
          hip_flexor_stretch 30s x2 sides both`,
  },
  {
    id: "holistic-wellness-week",
    name: "Holistic Wellness Week",
    description:
      "A hybrid plan combining workouts, meditation, nutrition, recovery, and daily habits across multiple days.",
    source: `\
PLAN "Holistic Wellness Week"
TYPE hybrid
VISIBILITY template
DIFFICULTY beginner
TAGS holistic, wellness, beginner, full_program
LANGUAGE en

GOALS
  GOAL primary mental_wellness:
    name "Establish Daily Wellness Routine"
  GOAL secondary habit:
    name "Build Consistent Habits"

PHASES
  PHASE "Foundation Week" (1 weeks):
    WEEK 1:
      # Mindful Monday: meditation + strength + nutrition
      DAY Monday training 60m "Mindful Monday":
        meditation:
          meditation mindfulness:
            duration 10 minutes
            guided true
        main straight_sets:
          goblet_squat 3x15 rest 45 seconds
          push_up 3x8..12 rest 60 seconds
        nutrition:
          nutrition post_workout:
            protein 20..30
            carbs 30..50
        cooldown:
          hamstring_stretch 30s x2 sides both
          chest_stretch 30s x2 sides both

      # Recovery Tuesday: yoga-style recovery + hydration habit
      DAY Tuesday active_recovery 30m "Recovery Tuesday":
        cooldown:
          recovery stretching:
            duration 20 minutes
        education:
          habit water_intake:
            target 8 glasses
            frequency daily

      # Active Wednesday: cardio + breathing meditation
      DAY Wednesday training 45m "Active Wednesday":
        warmup:
          jumping_jack 3m
        main:
          cardio running continuous:
            total 20 minutes
            zone 3
        meditation:
          meditation breathing:
            duration 5 minutes
            guided false
        cooldown:
          calf_stretch 30s x2 sides both`,
  },
  {
    id: "nutrition-with-timing",
    name: "Nutrition With Timing",
    description:
      "A nutrition-focused plan exercising relative and absolute NutritionTiming emission.",
    source: `\
PLAN "Nutrition With Timing"
TYPE nutrition
VISIBILITY template
DIFFICULTY beginner
LANGUAGE en

GOALS
  GOAL primary nutrition:
    name "Fuel Around Training"

PHASES
  PHASE "Week One" (1 weeks):
    WEEK 1:
      DAY Monday training 60m "Fuel Day":
        nutrition:
          nutrition pre_workout:
            timing before_workout -30 minutes
            protein 10..20
          nutrition post_workout:
            timing after_workout +45 minutes
            protein 20..30
            carbs 30..50
          nutrition breakfast:
            timing at 07:30
            calories 400..600`,
  },
];

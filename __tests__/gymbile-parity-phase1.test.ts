/**
 * Gymbile parity phase 1 regression tests.
 *
 * Ports the self-contained heredoc-fragment tests from:
 *   wpl-ai-ex/test/wpl_ai/parser_test.exs          (fixes 1a, 1b, 1c)
 *   wpl-ai-ex/test/wpl_ai/gymbile_parity_phase1_test.exs   (fix 1d: equipment + rules)
 *   wpl-ai-ex/test/wpl_ai/gymbile_parity_phase1d_test.exs  (fix 1d: stray tokens)
 *
 * Corpus tests referencing /tmp/wplai_spike/ are intentionally skipped.
 */
import { describe, test, expect } from "vitest";
import { compileWplAi } from "../src/index.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function getActivities(json: Record<string, unknown>): unknown[] {
  const plan = json as { plan: Record<string, unknown> };
  const phases = (plan.plan?.phases as unknown[]) ?? [];
  const phase = phases[0] as Record<string, unknown>;
  const weeks = (phase?.weeks as unknown[]) ?? [];
  const week = weeks[0] as Record<string, unknown>;
  const days = (week?.days as unknown[]) ?? [];
  const day = days[0] as Record<string, unknown>;
  const blocks = (day?.blocks as unknown[]) ?? [];
  const block = blocks[0] as Record<string, unknown>;
  return (block?.activities as unknown[]) ?? [];
}

function getMainActivities(json: Record<string, unknown>): unknown[] {
  const plan = json as { plan: Record<string, unknown> };
  const phases = (plan.plan?.phases as unknown[]) ?? [];
  const phase = phases[0] as Record<string, unknown>;
  const weeks = (phase?.weeks as unknown[]) ?? [];
  const week = weeks[0] as Record<string, unknown>;
  const days = (week?.days as unknown[]) ?? [];
  const day = days[0] as Record<string, unknown>;
  const blocks = (day?.blocks as unknown[]) ?? [];
  const main = (blocks as Record<string, unknown>[]).find(b => b.type === "main");
  return (main?.activities as unknown[]) ?? [];
}

// ---------------------------------------------------------------------------
// Fix 1a — equipment keyword fix: bodyweight as keyword token
// ---------------------------------------------------------------------------

describe("fix(1a) — REQUIRES equipment with keyword names", () => {
  test("bodyweight as keyword in equipment list is accepted", () => {
    const source = `\
PLAN "Bodyweight Plan"
TYPE workout
REQUIRES
  equipment:
    bodyweight (required)
`;
    const r = compileWplAi(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const equipment = (r.json?.plan?.requirements as Record<string, unknown>)?.equipment as unknown[];
    expect(equipment).toHaveLength(1);
    const item = equipment[0] as Record<string, unknown>;
    expect(item.name).toBe("bodyweight");
    expect(item.required).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fix 1b — REQUIRES directive case-insensitive dispatch + single-number AGE
// ---------------------------------------------------------------------------

describe("fix(1b) — REQUIRES directive case-insensitive dispatch", () => {
  test("lowercase age directive parses normally", () => {
    const source = `\
PLAN "Test"
TYPE workout
REQUIRES
  age 18..60
`;
    const r = compileWplAi(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const req = r.json?.plan?.requirements as Record<string, unknown>;
    expect(req.min_age).toBe(18);
    expect(req.max_age).toBe(60);
  });

  test("uppercase AGE directive is accepted and parsed", () => {
    const source = `\
PLAN "Test"
TYPE workout
REQUIRES
  AGE 25..50
`;
    const r = compileWplAi(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const req = r.json?.plan?.requirements as Record<string, unknown>;
    expect(req.min_age).toBe(25);
    expect(req.max_age).toBe(50);
  });

  test("uppercase AGE with single number (no range) is tolerated", () => {
    const source = `\
PLAN "Test"
TYPE workout
REQUIRES
  AGE 45
`;
    const r = compileWplAi(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const req = r.json?.plan?.requirements as Record<string, unknown>;
    expect(req.min_age).toBe(45);
    expect(req.max_age).toBe(45);
  });

  test("lowercase fitness directive parses normally", () => {
    const source = `\
PLAN "Test"
TYPE workout
REQUIRES
  fitness beginner intermediate
`;
    const r = compileWplAi(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const req = r.json?.plan?.requirements as Record<string, unknown>;
    expect(req.fitness_level).toEqual(["beginner", "intermediate"]);
  });

  test("uppercase FITNESS directive is accepted", () => {
    const source = `\
PLAN "Test"
TYPE workout
REQUIRES
  FITNESS beginner
`;
    const r = compileWplAi(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const req = r.json?.plan?.requirements as Record<string, unknown>;
    expect(req.fitness_level).toEqual(["beginner"]);
  });
});

// ---------------------------------------------------------------------------
// Fix 1c — meals block multi-entry parsing
// ---------------------------------------------------------------------------

const MEALS_HEADER = `\
PLAN "Hybrid Plan"
TYPE hybrid

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
`;

function mealsSource(mealsLines: string): string {
  return (
    MEALS_HEADER +
    `      DAY Monday nutrition 0m "Label":\n        meals:\n` +
    mealsLines
  );
}

describe("fix(1c) — meals block multi-entry parsing", () => {
  test("all four MEAL entries in a nutrition day are parsed", () => {
    const meals =
      "          MEAL BREAKFAST: oats\n" +
      "            PROTEIN 18g\n" +
      "          MEAL LUNCH: salad\n" +
      "            PROTEIN 30g\n" +
      "          MEAL SNACK: apple\n" +
      "          MEAL DINNER: chicken\n" +
      "            PROTEIN 45g\n";
    const r = compileWplAi(mealsSource(meals));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(getActivities(r.json as Record<string, unknown>)).toHaveLength(4);
  });

  test("range macros like PROTEIN 10..15g are parsed without truncating remaining MEALs", () => {
    const meals =
      "          MEAL BREAKFAST: oats\n" +
      "            PROTEIN 10..15g\n" +
      "            CARBS 40..60g\n" +
      "          MEAL LUNCH: salad\n" +
      "            PROTEIN 25g\n";
    const r = compileWplAi(mealsSource(meals));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const acts = getActivities(r.json as Record<string, unknown>);
    expect(acts).toHaveLength(2);
    // Check breakfast macros preserved range
    const breakfast = acts[0] as Record<string, unknown>;
    const prescription = breakfast.prescription as Record<string, unknown>;
    const macros = prescription?.macros as Record<string, unknown>;
    expect(macros?.protein).toMatchObject({ min: 10, max: 15 });
    expect(macros?.carbs).toMatchObject({ min: 40, max: 60 });
  });

  test("unknown macro keyword (typo) is skipped and remaining MEALs still parse", () => {
    const meals =
      "          MEAL BREAKFAST: oats\n" +
      "            PROTEAM 18g\n" +
      "          MEAL LUNCH: salad\n" +
      "            PROTEIN 30g\n";
    const r = compileWplAi(mealsSource(meals));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(getActivities(r.json as Record<string, unknown>)).toHaveLength(2);
  });

  test("multi-week plan preserves meals from each week independently", () => {
    const source =
      "PLAN \"Multi-Week\"\nTYPE hybrid\n\n" +
      "PHASES\n  PHASE \"P1\" (2 weeks):\n" +
      "    WEEK 1:\n" +
      "      DAY Monday nutrition 0m \"Label\":\n" +
      "        meals:\n" +
      "          MEAL BREAKFAST: oats\n" +
      "          MEAL LUNCH: salad\n" +
      "    WEEK 2:\n" +
      "      DAY Monday nutrition 0m \"Label\":\n" +
      "        meals:\n" +
      "          MEAL BREAKFAST: eggs\n" +
      "          MEAL LUNCH: wrap\n" +
      "          MEAL DINNER: fish\n";
    const r = compileWplAi(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const plan = r.json as { plan: Record<string, unknown> };
    const phase = (plan.plan.phases as unknown[])[0] as Record<string, unknown>;
    const [week1, week2] = phase.weeks as unknown[];
    const day1 = ((week1 as Record<string, unknown>).days as unknown[])[0] as Record<string, unknown>;
    const day2 = ((week2 as Record<string, unknown>).days as unknown[])[0] as Record<string, unknown>;
    const block1 = ((day1.blocks as unknown[])[0] as Record<string, unknown>);
    const block2 = ((day2.blocks as unknown[])[0] as Record<string, unknown>);
    expect((block1.activities as unknown[]).length).toBe(2);
    expect((block2.activities as unknown[]).length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Fix 1d-equipment — inline EQUIPMENT in REQUIRES (no colon)
// ---------------------------------------------------------------------------

const INLINE_EQUIPMENT_PLAN = `\
PLAN "Test Inline Equipment"
TYPE workout
LANGUAGE en

REQUIRES
  AGE 30
  FITNESS intermediate
  EQUIPMENT dumbbells cables bodyweight

PHASES
  PHASE "Phase 1" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "Day":
        warmup:
          arm_circles 5m
        main straight_sets:
          push_up 3x10 rpe 7
`;

describe("fix(1d-equipment) — inline EQUIPMENT in REQUIRES (no colon)", () => {
  test("parses inline EQUIPMENT list as required equipment", () => {
    const r = compileWplAi(INLINE_EQUIPMENT_PLAN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const equipment = (r.json?.plan?.requirements as Record<string, unknown>)?.equipment as unknown[];
    expect(equipment).toHaveLength(3);
    const names = (equipment as Record<string, unknown>[]).map(e => e.name);
    expect(names).toContain("dumbbells");
    expect(names).toContain("cables");
    expect(names).toContain("bodyweight");
    expect((equipment as Record<string, unknown>[]).every(e => e.required === true)).toBe(true);
  });

  test("emits a normalized_inline_equipment repair", () => {
    const r = compileWplAi(INLINE_EQUIPMENT_PLAN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.repairs.some(rep => rep.type === "normalized_inline_equipment")).toBe(true);
  });

  test("plan still fully compiles (phases and activities present)", () => {
    const r = compileWplAi(INLINE_EQUIPMENT_PLAN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const phases = r.json?.plan?.phases as unknown[];
    expect(phases).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Fix 1d-equipment — empty equipment: block (colon, no indented entries)
// ---------------------------------------------------------------------------

const EMPTY_EQUIPMENT_PLAN = `\
PLAN "Test Empty Equipment"
TYPE nutrition
LANGUAGE en

REQUIRES
  age 18..65
  fitness intermediate
  equipment:

PHASES
  PHASE "Nutrition" (1 weeks):
    WEEK 1:
      DAY Monday nutrition 0m "Day":
        meals:
          MEAL BREAKFAST: oatmeal
            PROTEIN 20g
            CARBS 40g
            FAT 10g
`;

describe("fix(1d-equipment) — empty equipment: block in REQUIRES", () => {
  test("parses empty equipment block without cascading to PERSONALIZATION", () => {
    const r = compileWplAi(EMPTY_EQUIPMENT_PLAN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const equipment = (r.json?.plan?.requirements as Record<string, unknown>)?.equipment;
    expect(equipment == null || (equipment as unknown[]).length === 0).toBe(true);
  });

  test("phases parse correctly after empty equipment: block", () => {
    const r = compileWplAi(EMPTY_EQUIPMENT_PLAN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.json?.plan?.phases as unknown[]).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Fix 1d-rules — freeform RULE lines directly in PERSONALIZATION
// ---------------------------------------------------------------------------

const FREEFORM_RULES_PLAN = `\
PLAN "Test Freeform Rules"
TYPE hybrid
LANGUAGE en

REQUIRES
  AGE 35
  FITNESS beginner

PERSONALIZATION
  RULE when sleep < 6 hours: RPE cap at 7
  RULE when traveling: use hotel gym equipment

PHASES
  PHASE "Foundation" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "Day":
        main straight_sets:
          push_up 3x8 rpe 6
`;

describe("fix(1d-rules) — freeform RULE lines directly in PERSONALIZATION", () => {
  test("parses without error despite freeform RULE lines", () => {
    const r = compileWplAi(FREEFORM_RULES_PLAN);
    expect(r.ok).toBe(true);
  });

  test("emits skipped_rule repairs for each freeform RULE", () => {
    const r = compileWplAi(FREEFORM_RULES_PLAN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const skipped = r.repairs.filter(rep => rep.type === "skipped_rule");
    expect(skipped).toHaveLength(2);
  });

  test("phases are still parsed after PERSONALIZATION with freeform RULE lines", () => {
    const r = compileWplAi(FREEFORM_RULES_PLAN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.json?.plan?.phases as unknown[]).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Fix 5 (1d-parity-A3) — time suffix at end of line consumed
// ---------------------------------------------------------------------------

describe("fix(1d-parity-A3) — time suffix at end of line consumed", () => {
  test("plank 3x30s / push_up 3x20s produce 2 exercises with no spurious S simples", () => {
    const source = `\
PLAN "Timed Sets"
TYPE workout

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training "Day":
        main tabata:
          plank 3x30s
          push_up 3x20s
`;
    const r = compileWplAi(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const acts = getMainActivities(r.json as Record<string, unknown>);
    expect(acts).toHaveLength(2);
    expect((acts as Record<string, unknown>[]).every(a => a.type === "exercise")).toBe(true);
    expect((acts as Record<string, unknown>[]).some(a => a.name === "S")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fix 5 (1d-parity-A4) — compound qualifier tokens consumed
// ---------------------------------------------------------------------------

describe("fix(1d-parity-A4) — each_side compound qualifier consumed", () => {
  test("dead_bug 3x10 each_side produces 2 exercises with no spurious Each Side simple", () => {
    const source = `\
PLAN "Each Side"
TYPE workout

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training "Day":
        main circuit:
          dead_bug 3x10 each_side
          mountain_climber 3x12 each_side
`;
    const r = compileWplAi(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const acts = getMainActivities(r.json as Record<string, unknown>);
    expect(acts).toHaveLength(2);
    expect((acts as Record<string, unknown>[]).every(a => a.type === "exercise")).toBe(true);
    expect((acts as Record<string, unknown>[]).some(a => a.name === "Each Side")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fix 5 (1d-parity-A1) — time suffix before exercise qualifiers consumed
// ---------------------------------------------------------------------------

describe("fix(1d-parity-A1) — time suffix before exercise qualifiers consumed", () => {
  test("side_plank 3x20 seconds each side produces 1 exercise with no Seconds/Each/Side simples", () => {
    const source = `\
PLAN "Seconds Each Side"
TYPE workout

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training "Day":
        main straight_sets:
          side_plank 3x20 seconds each side
`;
    const r = compileWplAi(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const acts = getMainActivities(r.json as Record<string, unknown>);
    expect(acts).toHaveLength(1);
    const act = acts[0] as Record<string, unknown>;
    expect(act.type).toBe("exercise");
    expect(act.exercise_ref).toBe("side_plank");
  });
});

// ---------------------------------------------------------------------------
// Fix 5 (1d-parity-B2) — bare both/left/right after reps in recovery_exercise
// ---------------------------------------------------------------------------

describe("fix(1d-parity-B2) — bare both/left/right after reps in recovery_exercise", () => {
  test("breathing_4_7_8 30s x1 both and chest_stretch 30s x2 sides both produce 2 recovery activities with no spurious 'both'", () => {
    const source = `\
PLAN "Bare Both"
TYPE workout

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training "Day":
        cooldown:
          breathing_4_7_8 30s x1 both
          chest_stretch 30s x2 sides both
`;
    const r = compileWplAi(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const acts = getActivities(r.json as Record<string, unknown>);
    // Bare cooldown exercises are flat recovery_exercise activities (Elixir parity)
    expect(acts).toHaveLength(2);
    expect((acts as Record<string, unknown>[]).every(a => a.type === "recovery_exercise")).toBe(true);
    // No spurious "both" activity name
    expect((acts as Record<string, unknown>[]).some(a => a.name === "both" || a.name === "Both")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fix 5 (1d-parity-B1) — breathing exercise in cooldown is recovery_exercise not cardio
// ---------------------------------------------------------------------------

describe("fix(1d-parity-B1) — breathing exercise in cooldown is recovery_exercise not cardio", () => {
  test("breathing_4_7_8 30s in cooldown compiles as recovery (not cardio)", () => {
    const source = `\
PLAN "Breathing Cooldown"
TYPE workout

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training "Day":
        cooldown:
          breathing_4_7_8 30s
`;
    const r = compileWplAi(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const acts = getActivities(r.json as Record<string, unknown>);
    expect(acts).toHaveLength(1);
    // Bare cooldown exercises are flat recovery_exercise activities (Elixir parity), not "cardio"
    expect((acts[0] as Record<string, unknown>).type).toBe("recovery_exercise");
  });

  test("jogging 10m in cooldown still compiles as cardio (B1 regression)", () => {
    const source = `\
PLAN "Jogging Cooldown"
TYPE workout

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training "Day":
        cooldown:
          jogging 10m
`;
    const r = compileWplAi(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const acts = getActivities(r.json as Record<string, unknown>);
    expect(acts).toHaveLength(1);
    expect((acts[0] as Record<string, unknown>).type).toBe("cardio");
  });
});

// ---------------------------------------------------------------------------
// Fix 6 — inline named cardio blocks in main blocks
// ---------------------------------------------------------------------------

const INLINE_CARDIO_PLAN = `\
PLAN "Test Inline Cardio"
TYPE workout
LANGUAGE en

REQUIRES
  AGE 40
  FITNESS beginner

PHASES
  PHASE "Foundation" (1 weeks):
    WEEK 1:
      DAY Saturday training 45m "Cardio":
        warmup:
          high_knees 5m
        main straight_sets:
          brisk_walk continuous:
            total 30 minutes
            zone 2
`;

describe("fix(6) — inline named cardio blocks in main blocks", () => {
  test("produces exactly one main activity (no spurious Continuous/Total/Zone simples)", () => {
    const r = compileWplAi(INLINE_CARDIO_PLAN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const acts = getMainActivities(r.json as Record<string, unknown>);
    expect(acts).toHaveLength(1);
    const names = (acts as Record<string, unknown>[])
      .map(a => String(a.name ?? a.exercise_ref ?? "").toLowerCase());
    expect(names.some(n => ["continuous", "total", "zone"].includes(n))).toBe(false);
  });

  test("retains cardio duration (30 minutes) and zone (2)", () => {
    const r = compileWplAi(INLINE_CARDIO_PLAN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const acts = getMainActivities(r.json as Record<string, unknown>);
    const act = acts[0] as Record<string, unknown>;
    expect(act.type).toBe("cardio");
    const prescription = act.prescription as Record<string, unknown>;
    const duration = prescription?.duration as Record<string, unknown>;
    expect(duration?.value).toBe(30);
    const intensity = prescription?.intensity as Record<string, unknown>;
    expect(intensity?.zone).toBe(2);
  });

  test("AGE 40 / FITNESS beginner uppercase form also compiles the same plan", () => {
    const r = compileWplAi(INLINE_CARDIO_PLAN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const req = r.json?.plan?.requirements as Record<string, unknown>;
    expect(req.min_age).toBe(40);
    expect(req.max_age).toBe(40);
    expect(req.fitness_level).toEqual(["beginner"]);
  });
});

// ---------------------------------------------------------------------------
// Bare cooldown exercise → flat recovery_exercise (cross-language parity)
// ---------------------------------------------------------------------------

describe("bare cooldown exercise emits flat recovery_exercise (Elixir parity)", () => {
  const BARE_COOLDOWN_PLAN = `\
PLAN "T"
TYPE workout
LANGUAGE en

PHASES
  PHASE "P" (1 weeks):
    WEEK 1:
      DAY Monday training 30m "D":
        main straight_sets:
          push_up 3x10
        cooldown:
          chest_stretch 30s x2 sides both
          cat_cow 30s x2 sides both
`;

  test("cooldown block has 2 flat recovery_exercise activities (not wrapped recovery)", () => {
    const r = compileWplAi(BARE_COOLDOWN_PLAN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const plan = (r.json as Record<string, unknown>).plan as Record<string, unknown>;
    const blocks = (((plan.phases as unknown[])[0] as Record<string, unknown>)
      .weeks as unknown[])[0] as Record<string, unknown>;
    const days = (blocks.days as unknown[])[0] as Record<string, unknown>;
    const cooldown = (days.blocks as Record<string, unknown>[]).find(b => b.type === "cooldown");
    expect(cooldown).toBeDefined();
    const acts = cooldown!.activities as Record<string, unknown>[];
    expect(acts).toHaveLength(2);
    // type must be recovery_exercise, NOT recovery
    expect(acts[0].type).toBe("recovery_exercise");
    expect(acts[1].type).toBe("recovery_exercise");
    // exercise name preserved flat (not buried in exercises[])
    expect(acts[0].name).toBe("chest_stretch");
    expect(acts[1].name).toBe("cat_cow");
    // prescription fields on the activity itself
    expect(acts[0].hold_seconds).toBe(30);
    expect(acts[0].reps).toBe(2);
    expect(acts[0].sides).toBe("both");
  });
});

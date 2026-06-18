import { describe, it, expect } from "vitest";
import { compileWplAi } from "../src/index.js";
import { enforce } from "@gymbile/wpl-validator";
import { MINIMAL_PLAN } from "./helpers/minimal-plan.js";

/**
 * Walk compiled plan JSON and collect all prescribed exercise identifiers.
 *
 * Compiled shape (confirmed against MINIMAL_PLAN):
 *   plan.phases[].weeks[].days[].blocks[].activities[]
 *     .exercise_ref  — canonical exercise id (e.g. "push_up")
 *     .name          — human label fallback (e.g. "Push Up")
 */
function allActivityNames(plan: Record<string, unknown>): string[] {
  const names: string[] = [];
  const p = (plan as any).plan;
  for (const phase of p?.phases ?? [])
    for (const week of phase.weeks ?? [])
      for (const day of week.days ?? [])
        for (const block of day.blocks ?? [])
          for (const act of block.activities ?? []) {
            const n = act.exercise_ref ?? act.name;
            if (typeof n === "string") names.push(n);
          }
  return names;
}

describe("SAFETY INVARIANT: a contraindicated exercise must not survive compile+enforce", () => {
  it("holds for a plan that prescribes the contraindicated movement", () => {
    const compiled = compileWplAi(MINIMAL_PLAN);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    // First activity from MINIMAL_PLAN is "push_up"
    const target = allActivityNames(compiled.json)[0]!;
    expect(target).toBe("push_up");

    const result = enforce(compiled.json, { injuries: ["test_injury"] }, [
      {
        id: "forbid_target",
        condition: { field: "injuries", op: "contains", value: "test_injury" },
        actions: [{ type: "forbid_exercise", exercise: target }],
      },
    ]);

    expect(result.stripped.length).toBeGreaterThan(0);
    expect(allActivityNames(result.plan)).not.toContain(target);
  });

  it("strips under space-normalised variant ('push up' matches 'push_up')", () => {
    const compiled = compileWplAi(MINIMAL_PLAN);
    if (!compiled.ok) return;
    const target = allActivityNames(compiled.json)[0]!;

    // Underscores replaced with spaces — collides() normalises both sides.
    const spaced = target.replace(/_/g, " ");
    const result = enforce(compiled.json, { injuries: ["x"] }, [
      {
        id: "r",
        condition: { field: "injuries", op: "contains", value: "x" },
        actions: [{ type: "forbid_exercise", exercise: spaced }],
      },
    ]);
    expect(
      allActivityNames(result.plan),
      `spaced variant '${spaced}' failed to strip '${target}'`,
    ).not.toContain(target);
  });

  it("strips under UPPERCASE variant ('PUSH_UP' matches 'push_up')", () => {
    const compiled = compileWplAi(MINIMAL_PLAN);
    if (!compiled.ok) return;
    const target = allActivityNames(compiled.json)[0]!;

    // All-caps — collides() lowercases both sides.
    const upper = target.toUpperCase();
    const result = enforce(compiled.json, { injuries: ["x"] }, [
      {
        id: "r",
        condition: { field: "injuries", op: "contains", value: "x" },
        actions: [{ type: "forbid_exercise", exercise: upper }],
      },
    ]);
    expect(
      allActivityNames(result.plan),
      `uppercase variant '${upper}' failed to strip '${target}'`,
    ).not.toContain(target);
  });

  /**
   * Plural variant 'push_ups' DOES now strip 'push_up' — matcher gap closed.
   *
   * The compound-plural gap in collides() has been fixed in @gymbile/wpl-validator:
   * SHORT_PLURALS { ups: "up" } causes "ups" (3 chars, previously exempt from
   * stemming) to be stemmed to "up", so "push_ups" normalises to "push_up" and
   * matches a forbid rule written as "push_up".
   *
   * The fix is applied identically in wpl-validator-ts/src/enforce/matcher.ts
   * and wpl-eval/src/scoring/blacklist.ts. Both now differ from the frozen v0.6
   * numbers for _ups-family exercises (the old scorer undercounted violations).
   */
  it("plural variant 'push_ups' DOES strip 'push_up' (matcher plural gap closed)", () => {
    const compiled = compileWplAi(MINIMAL_PLAN);
    if (!compiled.ok) return;
    const target = allActivityNames(compiled.json)[0]!;

    const plural = target + "s"; // "push_ups"
    const result = enforce(compiled.json, { injuries: ["x"] }, [
      {
        id: "r",
        condition: { field: "injuries", op: "contains", value: "x" },
        actions: [{ type: "forbid_exercise", exercise: plural }],
      },
    ]);

    // Plural alias IS now matched → exercise is stripped. Safety gap closed.
    expect(result.stripped.length).toBeGreaterThan(0);
    expect(allActivityNames(result.plan)).not.toContain(target);
  });
});

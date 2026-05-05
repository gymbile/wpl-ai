// ---------------------------------------------------------------------------
// Silent-failure corpus fixes — wpl-ai 1.10.4
// TDD regression tests for 7 parser/lexer bugs that caused silent swallowing
// of downstream sections instead of correct parse or clear errors.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { tokenize } from "../src/lexer.js";
import { parse } from "../src/parser.js";
import { compile } from "../src/compiler.js";
import type { Cardio, Recovery } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lexOk(src: string) {
  const result = tokenize(src);
  if (!result.ok) {
    throw new Error(`Lex failed: ${result.errors.map((e) => e.message).join("; ")}`);
  }
  return result.tokens;
}

function parseOk(src: string) {
  const tokens = lexOk(src);
  const result = parse(tokens);
  if (!result.ok) {
    throw new Error(`Parse failed: ${result.errors.map((e) => e.message).join("; ")}`);
  }
  return result.document;
}

function parseErrors(src: string): string[] {
  const lexResult = tokenize(src);
  if (!lexResult.ok) {
    throw new Error(`Lex failed: ${lexResult.errors.map((e) => e.message).join("; ")}`);
  }
  const result = parse(lexResult.tokens);
  if (result.ok) throw new Error("Expected parse to fail but it succeeded");
  return result.errors.map((e) => e.message);
}

function compilePlan(src: string): Record<string, unknown> {
  const doc = parseOk(src);
  const result = compile(doc);
  if (!result.ok) {
    throw new Error(`Compile failed: ${result.errors.map((e) => e.message).join("; ")}`);
  }
  return result.json.plan as Record<string, unknown>;
}

// Minimal valid plan wrapper: wraps a TAGS line (or other header lines) and
// a single-day phase so we can test tag parsing end-to-end.
function minimalPlanWithHeader(headerLines: string): string {
  return `PLAN "Test"
TYPE workout
${headerLines}

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training:
        main:
`;
}

// Minimal plan with a REQUIRES block body.
function minimalPlanWithRequires(requiresBody: string): string {
  return `PLAN "Test"
TYPE workout

REQUIRES
${requiresBody}

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training:
        main:
`;
}

// Minimal plan with a progress block containing a checkpoint.
function minimalPlanWithProgress(progressBody: string): string {
  return `PLAN "Test"
TYPE workout

PROGRESS
${progressBody}

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training:
        main:
`;
}

// Minimal plan with a PHASES block containing a phase with given type keyword.
function minimalPlanWithPhaseType(phaseTypeWord: string): string {
  return `PLAN "Test"
TYPE workout

PHASES
  PHASE "P1" ${phaseTypeWord} (1 weeks):
    WEEK 1:
      DAY Monday training:
        main:
`;
}

// Minimal plan with a cooldown block.
function minimalPlanWithCooldown(cooldownBody: string): string {
  return `PLAN "Test"
TYPE workout

PHASES
  PHASE "P1" (1 weeks):
    WEEK 1:
      DAY Monday training:
        cooldown:
${cooldownBody}
`;
}

// ---------------------------------------------------------------------------
// Bug 1 — digit-leading tag: `TAGS 531, strength`
// ---------------------------------------------------------------------------

describe("Bug 1 — digit-leading tag (531, strength)", () => {
  it("lexer tokenises 531 followed by a comma as a number+comma, so TAGS must accept number tokens", () => {
    const src = minimalPlanWithHeader("TAGS 531, strength");
    const doc = parseOk(src);
    expect(doc.header.tags).toContain("531");
    expect(doc.header.tags).toContain("strength");
  });

  it("tags list is not empty (regression: was silently [])", () => {
    const src = minimalPlanWithHeader("TAGS 531, strength");
    const doc = parseOk(src);
    expect(doc.header.tags).toHaveLength(2);
  });

  it("compiled header.tags includes the digit-leading value", () => {
    const src = minimalPlanWithHeader("TAGS 531, strength");
    const plan = compilePlan(src);
    const metadata = plan.metadata as Record<string, unknown>;
    const tags = metadata.tags as string[];
    expect(tags).toContain("531");
    expect(tags).toContain("strength");
  });
});

// ---------------------------------------------------------------------------
// Bug 2 — digit-leading tag in middle of list: `1rm_estimate` truncates list
// ---------------------------------------------------------------------------

describe("Bug 2 — digit-leading identifier in TAGS list (1rm_estimate)", () => {
  const src = minimalPlanWithHeader(
    "TAGS strength_test, assessment, 1rm_estimate, powerlifting",
  );

  it("all four tags are parsed (list not truncated at 1rm_estimate)", () => {
    const doc = parseOk(src);
    expect(doc.header.tags).toHaveLength(4);
    expect(doc.header.tags).toContain("1rm_estimate");
    expect(doc.header.tags).toContain("powerlifting");
  });

  it("compiled output preserves all tags", () => {
    const plan = compilePlan(src);
    const metadata = plan.metadata as Record<string, unknown>;
    const tags = metadata.tags as string[];
    expect(tags).toHaveLength(4);
    expect(tags).toContain("1rm_estimate");
    expect(tags).toContain("powerlifting");
  });
});

// ---------------------------------------------------------------------------
// Bug 3 — colon in contraindication name (acsm:cardiac_rehab_phase_2)
// ---------------------------------------------------------------------------

describe("Bug 3 — colon-qualified identifier in contraindication name", () => {
  const src = minimalPlanWithRequires(
    "  contraindication acsm:cardiac_rehab_phase_2",
  );

  it("parses without error", () => {
    const doc = parseOk(src);
    const contra = doc.requirements?.contraindications?.[0];
    expect(contra).toBeDefined();
  });

  it("condition includes the full colon-qualified name", () => {
    const doc = parseOk(src);
    const contra = doc.requirements!.contraindications![0];
    expect(contra!.condition).toBe("acsm:cardiac_rehab_phase_2");
  });

  it("icd10: prefix is also accepted", () => {
    const src2 = minimalPlanWithRequires("  contraindication icd10:M54.5");
    const doc = parseOk(src2);
    expect(doc.requirements!.contraindications![0]!.condition).toBe("icd10:M54.5");
  });
});

// ---------------------------------------------------------------------------
// Bug 4 — unknown REQUIRES directive produces a parse error
// ---------------------------------------------------------------------------

describe("Bug 4 — unknown REQUIRES directive emits error (no silent termination)", () => {
  it("produces a parse error for `supervision required` in REQUIRES block", () => {
    // This should NOT silently pass — it must fail with an error message.
    const src = minimalPlanWithRequires("  supervision required");
    const msgs = parseErrors(src);
    expect(msgs.length).toBeGreaterThan(0);
    const combined = msgs.join(" ");
    expect(combined).toMatch(/Unknown REQUIRES directive/i);
    expect(combined).toMatch(/supervision required/);
    expect(combined).toMatch(/contraindication|fitness|equipment|age|time_commitment/i);
  });

  it("error message includes the unrecognised line text", () => {
    const src = minimalPlanWithRequires("  foo_bar whatever");
    const msgs = parseErrors(src);
    expect(msgs.join(" ")).toMatch(/foo_bar/);
  });
});

// ---------------------------------------------------------------------------
// Bug 5 — `trigger completion` (no-arg) emits error
// ---------------------------------------------------------------------------

describe("Bug 5 — `trigger completion` emits explicit parse error", () => {
  it("rejects `trigger completion` with a helpful message", () => {
    const src = minimalPlanWithProgress(
      `  checkpoints:
    checkpoint "Week 1 review":
      trigger completion
      measure:
        - weight kg
`,
    );
    const msgs = parseErrors(src);
    expect(msgs.length).toBeGreaterThan(0);
    const combined = msgs.join(" ");
    expect(combined).toMatch(/completion/i);
    expect(combined).toMatch(/at N weeks|at N days/i);
  });
});

// ---------------------------------------------------------------------------
// Bug 6 — unknown phase type emits explicit error
// ---------------------------------------------------------------------------

describe("Bug 6 — unknown phase type emits explicit parse error", () => {
  it("rejects `rehabilitation` as a phase type with an allowed-list error", () => {
    const src = minimalPlanWithPhaseType("rehabilitation");
    const msgs = parseErrors(src);
    expect(msgs.length).toBeGreaterThan(0);
    const combined = msgs.join(" ");
    expect(combined).toMatch(/rehabilitation/);
    expect(combined).toMatch(/accumulation|intensification|realization/i);
  });

  it("rejects unknown phase type `cardio_block`", () => {
    const src = minimalPlanWithPhaseType("cardio_block");
    const msgs = parseErrors(src);
    expect(msgs.join(" ")).toMatch(/cardio_block/);
  });

  it("known phase type `accumulation` is still accepted", () => {
    const src = minimalPlanWithPhaseType("accumulation");
    const doc = parseOk(src);
    expect(doc.phases![0].type).toBe("accumulation");
  });
});

// ---------------------------------------------------------------------------
// Bug 7 — `jogging 10m` in cooldown produces CardioActivity, not malformed recovery_exercise
// ---------------------------------------------------------------------------

describe("Bug 7 — `jogging 10m` in cooldown parses as CardioActivity", () => {
  const src = minimalPlanWithCooldown("          jogging 10m");

  it("parses without error", () => {
    const doc = parseOk(src);
    expect(doc).toBeDefined();
  });

  it("produces exactly one activity (no phantom `m` orphan)", () => {
    const doc = parseOk(src);
    const activities = doc.phases![0].weeks[0].days[0].blocks[0].activities;
    expect(activities).toHaveLength(1);
  });

  it("the activity is a Cardio kind (not recovery)", () => {
    const doc = parseOk(src);
    const act = doc.phases![0].weeks[0].days[0].blocks[0].activities[0] as Cardio;
    expect(act.kind).toBe("cardio");
  });

  it("modality is `jogging`", () => {
    const doc = parseOk(src);
    const act = doc.phases![0].weeks[0].days[0].blocks[0].activities[0] as Cardio;
    expect(act.modality).toBe("jogging");
  });

  it("total_duration.value is 10 and unit is minutes", () => {
    const doc = parseOk(src);
    const act = doc.phases![0].weeks[0].days[0].blocks[0].activities[0] as Cardio;
    expect(act.total_duration.value).toBe(10);
    expect(act.total_duration.unit).toBe("minutes");
  });

  it("does NOT produce a recovery activity", () => {
    const doc = parseOk(src);
    const act = doc.phases![0].weeks[0].days[0].blocks[0].activities[0] as Recovery;
    expect(act.kind).not.toBe("recovery");
  });

  it("compiled output type is `cardio`", () => {
    const plan = compilePlan(src);
    const phase = (plan.phases as Array<Record<string, unknown>>)[0];
    const week = (phase!.weeks as Array<Record<string, unknown>>)[0];
    const day = (week!.days as Array<Record<string, unknown>>)[0];
    const block = (day!.blocks as Array<Record<string, unknown>>)[0];
    const activities = block!.activities as Array<Record<string, unknown>>;
    expect(activities).toHaveLength(1);
    expect(activities[0]!.type).toBe("cardio");
  });
});

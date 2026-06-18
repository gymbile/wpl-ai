import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ALL_EXERCISES, EXERCISES_BY_CATEGORY } from "../src/exercises.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("exercises codegen", () => {
  it("committed src/exercises.ts equals a fresh codegen run (no manual drift)", () => {
    const before = readFileSync(join(root, "src/exercises.ts"), "utf8");
    execFileSync("node", ["scripts/gen-exercises.mjs"], { cwd: root });
    const after = readFileSync(join(root, "src/exercises.ts"), "utf8");
    expect(after).toBe(before);
  });

  it("vendored JSON has 152 unique names and matches the generated catalog", () => {
    const json = JSON.parse(readFileSync(join(root, "src/data/exercises.json"), "utf8"));
    const flat = Object.values(json.categories).flat() as string[];
    expect(flat.length).toBe(152);
    expect(new Set(flat).size).toBe(152);
    expect([...ALL_EXERCISES].sort()).toEqual([...flat].sort());
  });

  it("collapses skater_jump and drops the split tokens", () => {
    expect(ALL_EXERCISES).toContain("skater_jump");
    expect(ALL_EXERCISES).not.toContain("skater");
    expect(ALL_EXERCISES).not.toContain("jump");
  });

  it("EXERCISES_BY_CATEGORY includes rehab_mobility", () => {
    expect(EXERCISES_BY_CATEGORY.rehab_mobility).toContain("scapular_retraction");
    expect(EXERCISES_BY_CATEGORY.rehab_mobility).toContain("diaphragmatic_breathing");
  });
});

#!/usr/bin/env node
// GENERATOR for src/exercises.ts — reads the vendored canonical catalog and
// (re)writes the generated TypeScript module. Deterministic: emits categories
// and names in the exact order they appear in the JSON. Run: npm run gen:exercises
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "src/data/exercises.json"), "utf8"));

const CONST_NAMES = {
  upper_body: "UPPER_BODY",
  lower_body: "LOWER_BODY",
  core: "CORE",
  cardio_warmup: "CARDIO_WARMUP",
  stretching: "STRETCHING",
  full_body: "FULL_BODY",
  rehab_mobility: "REHAB_MOBILITY",
};

const fmt = (names) =>
  names.map((n) => `  ${JSON.stringify(n)},`).join("\n");

let out = `// GENERATED — do not edit. Run \`npm run gen:exercises\` to regenerate.
// Source of truth: wpl/data/exercises.json (vendored at src/data/exercises.json).
// Catalog version: ${data.version}

`;

const constLines = [];
const byCatLines = [];
for (const [cat, names] of Object.entries(data.categories)) {
  const c = CONST_NAMES[cat];
  if (!c) throw new Error(`Unknown category in exercises.json: ${cat}`);
  out += `export const ${c} = [\n${fmt(names)}\n] as const;\n\n`;
  constLines.push(c);
  byCatLines.push(`  ${cat}: ${c},`);
}

out += `export const EXERCISES_BY_CATEGORY = {
${byCatLines.join("\n")}
} as const;

export const ALL_EXERCISES: readonly string[] = [
${constLines.map((c) => `  ...${c},`).join("\n")}
];

// Build a Set for O(1) lookups
const exerciseSet = new Set(ALL_EXERCISES);

export function isKnownExercise(ref: string): boolean {
  return exerciseSet.has(ref);
}
`;

writeFileSync(join(root, "src/exercises.ts"), out);
console.log(`wrote src/exercises.ts (${data.version})`);

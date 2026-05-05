// ---------------------------------------------------------------------------
// Compile-Conformance Test Runner
// ---------------------------------------------------------------------------
// Runs every fixture in the shared compile-conformance corpus against the
// TS compiler and deep-equals the normalized output against expected.json.
//
// Corpus resolution strategy:
//   1. If WPL_CORPUS_DIR env var is set, use that path.
//   2. Otherwise, resolve relative to this file:
//      __dirname/../../wpl/conformance/compile/fixtures/
//      (assumes wpl/ is a sibling repo of wpl-ai/ on disk)
//
// If the corpus directory is not reachable, the suite is skipped and a
// clear message is printed. Exit code remains 0.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { compileWplAi } from "../src/index.js";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Corpus path resolution
// ---------------------------------------------------------------------------

const CORPUS_DIR_ENV = process.env["WPL_CORPUS_DIR"];
const CORPUS_DIR_RELATIVE = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../wpl/conformance/compile/fixtures",
);
const CORPUS_DIR = CORPUS_DIR_ENV ?? CORPUS_DIR_RELATIVE;

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

const AUTO_ID_RE = /^[a-z0-9_]+_\d+$|^[a-z0-9_]+_block$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Deep-normalizes a compiled JSON value before comparison:
 *  1. Keys are deep-sorted (via JSON.stringify sort-keys in deepSort).
 *  2. Auto-generated IDs (^[a-z0-9_]+_\d+$ and _block suffix) → "<AUTO_ID>".
 *  3. UUID-format plan IDs → "<UUID>".
 *  4. `metadata.created_at`, `metadata.updated_at`, `metadata.language` → removed.
 *  5. `name` field on activity objects (type: exercise|cardio|nutrition|recovery) → removed.
 *  6. Whole-number floats → integers (1.0 → 1).
 */
function normalize(value: unknown, key?: string, inActivity = false): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item, key, inActivity));
  }

  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    // Sort keys alphabetically
    for (const k of Object.keys(obj).sort()) {
      const v = obj[k];
      // Strip runtime metadata fields
      if (key === "metadata" && (k === "created_at" || k === "updated_at" || k === "language")) {
        continue;
      }
      // Strip auto-derived display names from exercise/cardio/nutrition/recovery activities
      if (
        k === "name" &&
        inActivity &&
        typeof obj["type"] === "string" &&
        ["exercise", "cardio", "nutrition", "recovery"].includes(obj["type"] as string)
      ) {
        continue;
      }
      // Child "activities" arrays contain activity objects
      const childInActivity = k === "activities";
      result[k] = normalize(v, k, childInActivity);
    }
    return result;
  }

  if (typeof value === "string" && key === "id") {
    if (AUTO_ID_RE.test(value)) return "<AUTO_ID>";
    if (UUID_RE.test(value)) return "<UUID>";
    return value;
  }

  // Coerce whole-number floats to integers
  if (typeof value === "number" && Number.isFinite(value) && value === Math.trunc(value)) {
    return Math.trunc(value);
  }

  return value;
}

/** Deep-sort and stringify for comparison. */
function normalizedJson(value: unknown): string {
  return JSON.stringify(normalize(value), null, 2);
}

// ---------------------------------------------------------------------------
// Fixture discovery
// ---------------------------------------------------------------------------

interface Fixture {
  label: string;      // "category/name"
  sourceFile: string;
  expectedFile: string;
}

function discoverFixtures(corpusDir: string): Fixture[] {
  const fixtures: Fixture[] = [];
  if (!fs.existsSync(corpusDir)) return fixtures;

  for (const category of fs.readdirSync(corpusDir).sort()) {
    const categoryDir = path.join(corpusDir, category);
    if (!fs.statSync(categoryDir).isDirectory()) continue;

    for (const name of fs.readdirSync(categoryDir).sort()) {
      const fixtureDir = path.join(categoryDir, name);
      if (!fs.statSync(fixtureDir).isDirectory()) continue;

      const sourceFile = path.join(fixtureDir, "source.wpl");
      const expectedFile = path.join(fixtureDir, "expected.json");
      if (fs.existsSync(sourceFile) && fs.existsSync(expectedFile)) {
        fixtures.push({ label: `${category}/${name}`, sourceFile, expectedFile });
      }
    }
  }
  return fixtures;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

const fixtures = discoverFixtures(CORPUS_DIR);

if (fixtures.length === 0) {
  console.warn(
    `[conformance] compile-conformance corpus not found at ${CORPUS_DIR}; skipped ` +
    `(set WPL_CORPUS_DIR to enable)`,
  );
}

describe("compile-conformance corpus", () => {
  if (fixtures.length === 0) {
    it.skip("corpus not found — skipping all conformance tests", () => {});
    return;
  }

  for (const { label, sourceFile, expectedFile } of fixtures) {
    it(label, () => {
      const source = fs.readFileSync(sourceFile, "utf-8");
      const expected = JSON.parse(fs.readFileSync(expectedFile, "utf-8")) as unknown;

      const result = compileWplAi(source);
      if (!result.ok) {
        throw new Error(
          `[conformance/${label}] compilation failed:\n${result.formatted}`,
        );
      }

      const got = normalizedJson(result.json);
      const want = normalizedJson(expected);

      expect(got).toBe(want);
    });
  }
});

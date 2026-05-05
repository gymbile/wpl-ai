#!/usr/bin/env node
// Helper: compile a WPL-AI source file and print JSON to stdout.
// Usage: node scripts/compile.mjs <path/to/source.wpl>

import { readFileSync } from "fs";
import { compileWplAi } from "../dist/index.js";

const [, , filePath] = process.argv;
if (!filePath) {
  console.error("Usage: node scripts/compile.mjs <path/to/source.wpl>");
  process.exit(1);
}

const src = readFileSync(filePath, "utf-8");
const result = compileWplAi(src);

if (!result.ok) {
  console.error("Compilation failed:\n" + result.formatted);
  process.exit(1);
}

console.log(JSON.stringify(result.json, null, 2));

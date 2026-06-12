import { ALL_EXERCISES, isKnownExercise } from "./exercises.js";

// Normalize for comparison - remove underscores/hyphens, lowercase
function normalize(ref: string): string {
  return ref.toLowerCase().replace(/[_-]/g, "");
}

// Jaro similarity (core algorithm)
function jaroSimilarity(s1: string, s2: string): number {
  if (s1.length === 0 && s2.length === 0) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);

  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
}

// Jaro-Winkler similarity (adds prefix bonus)
function jaroWinkler(s1: string, s2: string): number {
  const jaro = jaroSimilarity(s1, s2);
  // Find common prefix length (max 4)
  let prefixLen = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
    if (s1[i] === s2[i]) prefixLen++;
    else break;
  }
  // Winkler scaling factor p = 0.1
  return jaro + prefixLen * 0.1 * (1 - jaro);
}

export function suggest(unknownRef: string): string[] {
  const normalized = normalize(unknownRef);
  return ALL_EXERCISES
    .map(known => ({ ref: known, sim: jaroWinkler(normalized, normalize(known)) }))
    .filter(x => x.sim > 0.7)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 3)
    .map(x => x.ref);
}

export function bestMatch(unknownRef: string): string | null {
  return bestMatchWithSimilarity(unknownRef)?.ref ?? null;
}

/**
 * Like bestMatch() but returns both the best-matching ref and the similarity
 * score. Used by the repairs ledger in parser.ts to record the fuzzy
 * substitution similarity without re-running the algorithm.
 */
export function bestMatchWithSimilarity(
  unknownRef: string,
): { ref: string; similarity: number } | null {
  const normalized = normalize(unknownRef);
  let best: { ref: string; sim: number } | null = null;
  for (const known of ALL_EXERCISES) {
    const sim = jaroWinkler(normalized, normalize(known));
    if (!best || sim > best.sim) best = { ref: known, sim };
  }
  return best && best.sim > 0.85 ? { ref: best.ref, similarity: best.sim } : null;
}

export function validateExercise(ref: string): { ok: true } | { ok: false; suggestions: string[] } {
  if (isKnownExercise(ref)) return { ok: true };
  return { ok: false, suggestions: suggest(ref) };
}

// ---------------------------------------------------------------------------
// Generic Vocabulary Matcher
// ---------------------------------------------------------------------------
// Reuses Jaro-Winkler similarity for fuzzy matching against any vocabulary.
// Used by the semantic validator to suggest corrections for unknown values.
// ---------------------------------------------------------------------------

function normalize(ref: string): string {
  return ref.toLowerCase().replace(/[_-]/g, "");
}

function jaroSimilarity(s1: string, s2: string): number {
  if (s1.length === 0 && s2.length === 0) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

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

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
}

function jaroWinkler(s1: string, s2: string): number {
  const jaro = jaroSimilarity(s1, s2);
  let prefixLen = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
    if (s1[i] === s2[i]) prefixLen++;
    else break;
  }
  return jaro + prefixLen * 0.1 * (1 - jaro);
}

export interface VocabularyValidation {
  ok: boolean;
  suggestions: string[];
}

export function validateVocabulary(
  value: string,
  knownSet: Set<string>,
  allValues: readonly string[],
): VocabularyValidation {
  if (knownSet.has(value)) return { ok: true, suggestions: [] };

  const normalized = normalize(value);
  const suggestions = allValues
    .map(known => ({ ref: known, sim: jaroWinkler(normalized, normalize(known)) }))
    .filter(x => x.sim > 0.7)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 3)
    .map(x => x.ref);

  return { ok: false, suggestions };
}

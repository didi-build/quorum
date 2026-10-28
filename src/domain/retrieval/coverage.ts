export interface CoverageResult {
  sufficient: boolean;
  score: number;
}

function tokenize(text: string): Set<string> {
  const tokens = text.match(/[a-zA-Z0-9_]+/g) ?? [];
  return new Set(
    tokens.filter((token) => token.length > 2).map((token) => token.toLowerCase()),
  );
}

/** Lightweight coverage heuristic: fraction of query terms present across top chunks (v1 parity). */
export function coverageCheck(
  query: string,
  chunkTexts: string[],
  minScore = 0.3,
): CoverageResult {
  const queryTerms = tokenize(query);
  if (queryTerms.size === 0) {
    return { sufficient: true, score: 1.0 };
  }
  if (chunkTexts.length === 0) {
    return { sufficient: false, score: 0.0 };
  }

  const coveredTerms = new Set<string>();
  for (const text of chunkTexts) {
    for (const term of tokenize(text)) {
      if (queryTerms.has(term)) {
        coveredTerms.add(term);
      }
    }
  }

  const score = coveredTerms.size / queryTerms.size;
  return { sufficient: score >= minScore, score };
}

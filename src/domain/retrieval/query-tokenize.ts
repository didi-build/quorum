/** Unicode-aware tokens for FTS keyword search (chunks_fts uses unicode61). */
export function tokenizeQueryForFts(query: string): string[] {
  const tokens = query.match(/[\p{L}\p{N}_]+/gu) ?? [];
  return tokens.filter((token) => token.length > 2);
}

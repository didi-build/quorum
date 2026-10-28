/** Max characters accepted on POST /retrieval/query (cost and FTS safety). */
export const RETRIEVAL_QUERY_MAX_LENGTH = 2000;

/** Max distinct terms passed into FTS5 MATCH for one query. */
export const RETRIEVAL_FTS_MAX_TERMS = 32;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRetrievalProjectUuid(value: string): boolean {
  return UUID_RE.test(value);
}

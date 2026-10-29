/** Max text files indexed from one GitHub tree walk per queue invocation (DIDI-775). */
export const GITHUB_MAX_INDEX_FILES_PER_RUN = 150;

/** Max Linear issues indexed for one team per queue invocation (DIDI-777, aligned with GitHub cap). */
export const LINEAR_MAX_ISSUES_PER_RUN = 150;

/** Skip GitHub blobs larger than this many bytes (DIDI-775). */
export const GITHUB_MAX_FILE_BYTES = 512 * 1024;

/** Voyage contextualized embedding requests process at most this many chunks per call (v1 parity). */
export const EMBEDDING_BATCH_SIZE = 32;

/** Vectorize upsert batch size (DIDI-775). */
export const VECTORIZE_UPSERT_BATCH_SIZE = 50;

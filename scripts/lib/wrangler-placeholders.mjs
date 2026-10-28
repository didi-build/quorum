/** Placeholder D1 database_id in committed wrangler.jsonc (real id injected at deploy). */
export const D1_PLACEHOLDER_PRODUCTION = "00000000-0000-0000-0000-000000000000";

export const PRODUCTION_RESOURCE_MARKERS = {
  workerName: "quorum",
  d1Name: "quorum-db",
  d1Binding: "DB",
  queueName: "quorum-indexing",
  vectorizeIndex: "quorum-embeddings",
};

/** Generated CI config (gitignored); must live in repo root for Wrangler relative paths. */
export const WRANGLER_CI_CONFIG = "wrangler.ci.jsonc";

/** Placeholder D1 database_id in committed wrangler.jsonc (real id injected at deploy). */
export const D1_PLACEHOLDER_PRODUCTION = "00000000-0000-0000-0000-000000000000";

export const PRODUCTION_RESOURCE_MARKERS = {
  workerName: "quorum",
  d1Name: "quorum-db",
  d1Binding: "DB",
  queueName: "quorum-indexing",
  vectorizeIndex: "quorum-embeddings",
};

/** Default generated deploy config filename (gitignored `wrangler*.ci.jsonc` pattern). */
export const WRANGLER_CI_CONFIG = "wrangler.ci.jsonc";

/** Basenames allowed for prepare-wrangler-config --output (matches .gitignore). */
export const WRANGLER_CI_CONFIG_BASENAME_RE = /^wrangler.*\.ci\.jsonc$/;

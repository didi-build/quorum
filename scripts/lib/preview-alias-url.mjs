/** @typedef {"missing_worker" | "upload_failed" | "missing_alias_url"} PreviewUploadFailure */

export const PREVIEW_WORKER_NAME = "quorum-preview";

const WORKER_NOT_FOUND_MARKERS = [
  /could not find worker/i,
  /script not found/i,
  /worker.*does not exist/i,
  /\[code:\s*10007\]/i,
];

/**
 * @param {string} prNumber
 * @returns {RegExp}
 */
export function previewAliasUrlPattern(prNumber) {
  const n = String(prNumber).replace(/[^\d]/g, "");
  if (!n) {
    throw new Error("prNumber must be numeric");
  }
  return new RegExp(
    `https://pr-${n}-${PREVIEW_WORKER_NAME}\\.[a-z0-9-]+\\.workers\\.dev`,
    "gi",
  );
}

/**
 * @param {string} wranglerOutput
 * @param {string} prNumber
 * @returns {string | null}
 */
export function extractPreviewAliasUrl(wranglerOutput, prNumber) {
  const pattern = previewAliasUrlPattern(prNumber);
  const matches = [...wranglerOutput.matchAll(pattern)].map((m) => m[0]);
  if (matches.length === 0) {
    return null;
  }
  return matches[0];
}

/**
 * @param {string} aliasUrl
 * @returns {string}
 */
export function previewAppEntryUrl(aliasUrl) {
  const base = aliasUrl.replace(/\/+$/, "");
  return `${base}/app/`;
}

/**
 * @param {string} wranglerOutput
 * @returns {boolean}
 */
export function isPreviewWorkerMissingOutput(wranglerOutput) {
  return WORKER_NOT_FOUND_MARKERS.some((re) => re.test(wranglerOutput));
}

/**
 * @param {number | null | undefined} exitCode
 * @param {string} wranglerOutput
 * @returns {PreviewUploadFailure | null}
 */
export function classifyPreviewUploadResult(exitCode, wranglerOutput) {
  if (exitCode === 0) {
    return null;
  }
  if (isPreviewWorkerMissingOutput(wranglerOutput)) {
    return "missing_worker";
  }
  return "upload_failed";
}

export const PREVIEW_WORKER_MISSING_MESSAGE =
  "quorum-preview is not provisioned yet. A maintainer must run a one-time bootstrap: wrangler deploy --config wrangler.preview.jsonc (not from PR CI). See docs/decisions/0010-mock-preview-deploys.md and docs/runbooks/deploy.md.";

export const PREVIEW_ALIAS_URL_MISSING_MESSAGE =
  "Preview alias URL was not found in wrangler output (expected https://pr-<n>-quorum-preview.<subdomain>.workers.dev).";

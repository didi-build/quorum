import path from "node:path";

/** Cloudflare static assets redirect from preview root to the SPA. */
export const MOCK_PREVIEW_REDIRECTS = "/ /app/ 302\n";

/** Cloudflare static assets headers for all preview paths. */
export const MOCK_PREVIEW_HEADERS = "/*\n  X-Robots-Tag: noindex, nofollow\n";

/**
 * @param {string} distRel FRONTEND_DIST relative to repo root
 * @param {string} [absoluteDist] resolved absolute dist path
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isMockPreviewFrontendDist(distRel, absoluteDist, env = process.env) {
  if (env.QUORUM_FRONTEND_DIST_PROFILE === "mock-preview") {
    return true;
  }
  const normalized = String(distRel).replace(/\\/g, "/");
  if (normalized === "frontend/dist-preview" || normalized.endsWith("/dist-preview")) {
    return true;
  }
  if (absoluteDist) {
    return path.basename(absoluteDist) === "dist-preview";
  }
  return false;
}

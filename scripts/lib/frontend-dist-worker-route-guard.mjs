import fs from "node:fs";
import path from "node:path";

/** URL path prefixes that must be handled by the Worker, not static assets. */
export const RESERVED_WORKER_PATH_PREFIXES = ["/api", "/council", "/chat"];

/**
 * @param {string} distRoot absolute path to finished frontend dist
 * @returns {string[]} relative paths (posix) that would shadow Worker routes
 */
export function findReservedWorkerPathShadows(distRoot) {
  if (!fs.existsSync(distRoot)) {
    return [];
  }
  const shadows = [];
  const walk = (dir, urlPrefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const nextPrefix = `${urlPrefix}/${entry.name}`.replace(/\/+/g, "/");
      if (entry.isDirectory()) {
        walk(full, nextPrefix);
      } else if (entry.isFile()) {
        shadows.push(nextPrefix);
      }
    }
  };

  for (const prefix of RESERVED_WORKER_PATH_PREFIXES) {
    const segment = prefix.slice(1);
    const candidate = path.join(distRoot, segment);
    if (!fs.existsSync(candidate)) {
      continue;
    }
    const stat = fs.statSync(candidate);
    if (stat.isFile()) {
      shadows.push(prefix);
      continue;
    }
    if (stat.isDirectory()) {
      walk(candidate, prefix);
    }
  }
  return shadows.sort();
}

/**
 * @param {string} distRoot
 */
export function assertNoReservedWorkerPathShadowsInFrontendDist(distRoot) {
  const shadows = findReservedWorkerPathShadows(distRoot);
  if (shadows.length === 0) {
    return;
  }
  throw new Error(
    `Production frontend dist must not shadow Worker routes (${RESERVED_WORKER_PATH_PREFIXES.join(", ")}):\n${shadows.map((p) => `- ${p}`).join("\n")}`,
  );
}

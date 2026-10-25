import fs from "node:fs";
import path from "node:path";

/** @param {string} swSource */
export function parsePrecacheRelativeUrls(swSource) {
  const urls = new Set();
  const re = /url:"([^"]+)"/g;
  for (let match = re.exec(swSource); match; match = re.exec(swSource)) {
    urls.add(match[1]);
  }
  return [...urls];
}

const PRECACHE_MOCK_URL_RE = /mock|preview|fixture/i;
const MOCK_CHUNK_BASENAME_RE = /mockBundle|loadPreviewMocks/i;

/**
 * @param {string} dir
 * @returns {string[]}
 */
export function listJsFilePathsUnder(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const paths = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...listJsFilePathsUnder(full));
    } else if (entry.isFile() && /\.(js|mjs)$/i.test(entry.name)) {
      paths.push(full);
    }
  }
  return paths;
}

/**
 * @param {string} distRoot absolute path to finished frontend dist (with app/ subtree)
 * @param {{ requireServiceWorker?: boolean }} [options]
 */
export function assertNoMockArtifactsInProductionDist(distRoot, options = {}) {
  const { requireServiceWorker = true } = options;
  const errors = [];

  const jsPaths = listJsFilePathsUnder(distRoot);
  for (const filePath of jsPaths) {
    const base = path.basename(filePath);
    if (MOCK_CHUNK_BASENAME_RE.test(base)) {
      errors.push(`unexpected mock chunk file: ${path.relative(distRoot, filePath)}`);
    }
  }

  const swCandidates = [
    path.join(distRoot, "app", "sw.js"),
    path.join(distRoot, "sw.js"),
  ];
  const swPath = swCandidates.find((candidate) => fs.existsSync(candidate));
  if (!swPath) {
    if (requireServiceWorker) {
      errors.push("missing service worker (sw.js) in production dist");
    }
  } else {
    const swSource = fs.readFileSync(swPath, "utf8");
    const precacheUrls = parsePrecacheRelativeUrls(swSource);
    for (const relative of precacheUrls) {
      if (PRECACHE_MOCK_URL_RE.test(relative)) {
        errors.push(`service worker precache lists mock-related asset: ${relative}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Production frontend dist must not include mock preview artifacts:\n${errors.map((e) => `- ${e}`).join("\n")}`,
    );
  }
}

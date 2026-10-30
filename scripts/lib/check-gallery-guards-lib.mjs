import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseJsonc } from "./parse-jsonc.mjs";

const GALLERY_CONFIG = "wrangler.gallery.jsonc";
const GALLERY_WORKFLOW = ".github/workflows/gallery-preview.yml";
const PREVIEW_WORKFLOW = ".github/workflows/preview.yml";

const GUARD_SOURCE_PATHS = new Set([
  "scripts/check-gallery-guards.mjs",
  "scripts/lib/check-gallery-guards-lib.mjs",
]);

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "$schema",
  "name",
  "workers_dev",
  "preview_urls",
  "compatibility_date",
  "assets",
  "previews",
]);

const ALLOWED_ASSET_KEYS = new Set(["directory"]);

/**
 * @param {Record<string, unknown>} config
 * @returns {string[]}
 */
export function collectGalleryConfigViolations(config) {
  const errors = [];
  for (const key of Object.keys(config)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      errors.push(`wrangler.gallery.jsonc must not define top-level key ${key}.`);
    }
  }
  if (config.name !== "quorum-preview") {
    errors.push('wrangler.gallery.jsonc name must remain "quorum-preview".');
  }
  if (config.workers_dev !== true) {
    errors.push("wrangler.gallery.jsonc must set workers_dev to true.");
  }
  const assets = config.assets;
  if (!assets || typeof assets !== "object" || Array.isArray(assets)) {
    errors.push("wrangler.gallery.jsonc must define an assets block.");
  } else {
    for (const key of Object.keys(assets)) {
      if (!ALLOWED_ASSET_KEYS.has(key)) {
        errors.push(`wrangler.gallery.jsonc assets must not define ${key}.`);
      }
    }
    if (assets.directory !== "./frontend/dist-preview") {
      errors.push(
        'wrangler.gallery.jsonc assets.directory must be "./frontend/dist-preview".',
      );
    }
  }
  const previews = config.previews;
  if (previews === undefined) {
    errors.push("wrangler.gallery.jsonc must include an empty previews block.");
  } else if (
    typeof previews !== "object" ||
    previews === null ||
    Array.isArray(previews)
  ) {
    errors.push("wrangler.gallery.jsonc previews must be an object.");
  } else if (Object.keys(previews).length > 0) {
    errors.push(
      "wrangler.gallery.jsonc previews must be empty (no nested bindings or vars).",
    );
  }
  return errors;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function referencesGalleryWranglerConfig(text) {
  return (
    text.includes("wrangler.gallery.jsonc") ||
    /--config[= ]wrangler\.gallery\.jsonc/.test(text) ||
    /-c[= ]wrangler\.gallery\.jsonc/.test(text)
  );
}

/**
 * @param {string} segment
 * @returns {boolean}
 */
function segmentRunsWranglerDeploy(segment) {
  return /\bwrangler\b/.test(segment) && /\bdeploy\b/.test(segment);
}

/**
 * @param {string} segment
 * @returns {boolean}
 */
function segmentRunsWranglerPreview(segment) {
  return /\bwrangler\s+preview\b/.test(segment);
}

export const SCANNED_FILE_RE = /\.(yml|yaml|mjs|js|cjs|ts|mts|sh)$/;

function walkFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist") {
      continue;
    }
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkFiles(full, files);
    } else if (SCANNED_FILE_RE.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

/**
 * @param {string} repoRoot
 * @returns {string[]}
 */
export function runGalleryGuards(repoRoot = process.cwd()) {
  const errors = [];
  const configPath = join(repoRoot, GALLERY_CONFIG);
  const config = parseJsonc(readFileSync(configPath, "utf8"));
  errors.push(...collectGalleryConfigViolations(config));

  const galleryWorkflowPath = join(repoRoot, GALLERY_WORKFLOW);
  const galleryWorkflowText = readFileSync(galleryWorkflowPath, "utf8");
  if (!galleryWorkflowText.includes("npm run gallery:guards")) {
    errors.push(
      `${GALLERY_WORKFLOW} must run npm run gallery:guards on pull requests.`,
    );
  }
  if (galleryWorkflowText.includes("wrangler preview")) {
    errors.push(
      `${GALLERY_WORKFLOW} must not run wrangler preview (use mock-preview deploy).`,
    );
  }
  if (galleryWorkflowText.includes("wrangler deploy")) {
    errors.push(`${GALLERY_WORKFLOW} must not run wrangler deploy.`);
  }

  const previewWorkflowPath = join(repoRoot, PREVIEW_WORKFLOW);
  const previewWorkflowText = readFileSync(previewWorkflowPath, "utf8");
  if (!previewWorkflowText.includes("build:frontend:mock-preview")) {
    errors.push(
      `${PREVIEW_WORKFLOW} must build mock-preview assets (includes gallery).`,
    );
  }
  if (!previewWorkflowText.includes("GALLERY_PROBE_MARKER")) {
    errors.push(`${PREVIEW_WORKFLOW} must probe the deployed /gallery route.`);
  }
  if (referencesGalleryWranglerConfig(previewWorkflowText)) {
    errors.push(
      `${PREVIEW_WORKFLOW} must not reference wrangler.gallery.jsonc for deploy.`,
    );
  }

  const filesToScan = new Set();
  for (const root of [
    join(repoRoot, ".github"),
    join(repoRoot, "scripts"),
    join(repoRoot, "preview"),
  ]) {
    if (statSync(root).isDirectory()) {
      for (const file of walkFiles(root)) {
        filesToScan.add(file);
      }
    }
  }

  for (const file of filesToScan) {
    const rel = relative(repoRoot, file).replace(/\\/g, "/");
    if (GUARD_SOURCE_PATHS.has(rel)) {
      continue;
    }
    const text = readFileSync(file, "utf8");
    if (segmentRunsWranglerPreview(text)) {
      errors.push(
        `${rel} must not run wrangler preview (gallery uses mock-preview upload).`,
      );
    }
    if (referencesGalleryWranglerConfig(text) && segmentRunsWranglerDeploy(text)) {
      errors.push(`${rel} must not run wrangler deploy with wrangler.gallery.jsonc.`);
    }
  }

  return errors;
}

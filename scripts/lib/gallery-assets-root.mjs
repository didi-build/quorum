import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseJsonc } from "./parse-jsonc.mjs";

const GALLERY_WRANGLER_CONFIG = "wrangler.gallery.jsonc";

/**
 * @param {string} [repoRoot]
 * @returns {string} Absolute path to the mock-preview dist root (gallery lives under gallery/).
 */
export function getGalleryAssetsRoot(repoRoot = process.cwd()) {
  const configPath = resolve(repoRoot, GALLERY_WRANGLER_CONFIG);
  const config = parseJsonc(readFileSync(configPath, "utf8"));
  const directory = config.assets?.directory;
  if (!directory || typeof directory !== "string") {
    throw new Error(`${GALLERY_WRANGLER_CONFIG} is missing assets.directory`);
  }
  return resolve(repoRoot, directory);
}

/** @returns {string} Relative URL prefix for the gallery SPA (Vite base without trailing slash). */
export function getGalleryUrlPrefix() {
  return "/gallery";
}

/**
 * @param {string} appEntryUrl mock-preview app entry URL ending in /app/
 * @returns {string}
 */
export function previewGalleryUrlFromAppEntry(appEntryUrl) {
  const url = new URL(appEntryUrl);
  url.pathname = "/gallery/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

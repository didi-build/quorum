import { previewGalleryUrlFromAppEntry } from "./lib/gallery-assets-root.mjs";

const marker = "<!-- quorum-gallery-preview -->";
const previewUrl = process.env.PREVIEW_URL ?? "";
const galleryUrl = previewUrl ? previewGalleryUrlFromAppEntry(previewUrl) : "";
const sha = (process.env.PR_HEAD_SHA ?? "").slice(0, 7);
const previewMode = process.env.PREVIEW_MODE ?? "unknown";

let statusLine;
if (previewMode === "unconfigured") {
  statusLine =
    "**Gallery preview:** not configured. Set repository secret `QUORUM_CLOUDFLARE_API_TOKEN_PREVIEW` (Workers Scripts Edit on `quorum-preview` only) and variable `QUORUM_CLOUDFLARE_ACCOUNT_ID`. Same-repo pull requests only.";
} else if (previewMode === "deployed" && galleryUrl) {
  statusLine = `**Gallery preview:** [Open /gallery](${galleryUrl})`;
} else if (previewMode === "failed") {
  statusLine =
    "**Gallery preview:** deploy or /gallery probe did not pass (check the Preview deploy workflow log).";
} else {
  statusLine =
    "**Gallery preview:** unexpected preview state (check the Preview deploy workflow log).";
}

const body = `${marker}
${statusLine}

Commit: \`${sha}\``;

if (process.env.OUTPUT_MODE === "body") {
  console.log(body);
} else {
  console.log(`body<<EOF\n${body}\nEOF`);
}

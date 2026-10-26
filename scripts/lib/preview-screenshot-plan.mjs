/** @typedef {{ name: string, path: string }} PreviewScreenshotRoute */

export const PREVIEW_SCREENSHOT_CAPTURE_SOURCE_FILE = "capture-source.txt";

/** Routes captured in preview CI (landing, sign-in, chat, connections). */
export const PREVIEW_SCREENSHOT_ROUTES = [
  {
    name: "landing",
    path: "/",
  },
  {
    name: "sign-in",
    path: "/app/?quorum_preview_screen=sign-in",
  },
  {
    name: "chat",
    path: "/app/",
  },
  {
    name: "connections",
    path: "/app/connections",
  },
];

export const PREVIEW_SCREENSHOT_VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 720 },
];

export const PREVIEW_SCREENSHOT_COLOR_SCHEMES = ["light", "dark"];

export function expectedPreviewScreenshotCount() {
  return (
    PREVIEW_SCREENSHOT_ROUTES.length *
    PREVIEW_SCREENSHOT_VIEWPORTS.length *
    PREVIEW_SCREENSHOT_COLOR_SCHEMES.length
  );
}

/**
 * Deploy outputs the /app/ entry URL; screenshots need the workers.dev origin.
 * @param {string} previewBaseUrl
 */
export function previewWorkerOriginFromBaseUrl(previewBaseUrl) {
  const trimmed = previewBaseUrl.trim();
  if (!trimmed) {
    throw new Error("previewWorkerOriginFromBaseUrl: missing preview base URL");
  }
  const parsed = new URL(trimmed.endsWith("/") ? trimmed : `${trimmed}/`);
  return parsed.origin;
}

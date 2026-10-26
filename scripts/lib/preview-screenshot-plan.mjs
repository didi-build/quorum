/** @typedef {{ name: string, path: string, readySelector: string }} PreviewScreenshotRoute */

/** Routes captured in preview CI (landing, sign-in, chat, connections). */
export const PREVIEW_SCREENSHOT_ROUTES = [
  {
    name: "landing",
    path: "/index.html",
    readySelector: "h1",
  },
  {
    name: "sign-in",
    path: "/app/?quorum_preview_screen=sign-in",
    readySelector: "h1",
  },
  {
    name: "chat",
    path: "/app/",
    readySelector: 'nav[aria-label="Sections"] a[href$="/app/"]',
  },
  {
    name: "connections",
    path: "/app/connections",
    readySelector: 'nav[aria-label="Sections"] a[href$="/connections"]',
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

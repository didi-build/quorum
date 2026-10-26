import { describe, expect, it } from "vitest";
import {
  expectedPreviewScreenshotCount,
  PREVIEW_SCREENSHOT_COLOR_SCHEMES,
  PREVIEW_SCREENSHOT_ROUTES,
  PREVIEW_SCREENSHOT_VIEWPORTS,
  previewScreenshotRouteOrigin,
  previewWorkerOriginFromBaseUrl,
} from "../scripts/lib/preview-screenshot-plan.mjs";

describe("preview screenshot plan (unit)", () => {
  it("captures four routes at two widths in light and dark (16 images)", () => {
    expect(PREVIEW_SCREENSHOT_ROUTES.map((route) => route.name)).toEqual([
      "landing",
      "sign-in",
      "chat",
      "connections",
    ]);
    expect(PREVIEW_SCREENSHOT_VIEWPORTS).toHaveLength(2);
    expect(PREVIEW_SCREENSHOT_COLOR_SCHEMES).toEqual(["light", "dark"]);
    expect(expectedPreviewScreenshotCount()).toBe(16);
  });

  it("captures landing from the repo landing static server, not the preview worker root", () => {
    const landing = PREVIEW_SCREENSHOT_ROUTES[0];
    const signIn = PREVIEW_SCREENSHOT_ROUTES[1];
    expect(landing.name).toBe("landing");
    expect(landing.origin).toBe("landing");
    expect(
      previewScreenshotRouteOrigin(
        landing,
        "http://127.0.0.1:9001",
        "https://pr-1.example.workers.dev",
      ),
    ).toBe("http://127.0.0.1:9001");
    expect(
      previewScreenshotRouteOrigin(
        signIn,
        "http://127.0.0.1:9001",
        "https://pr-1.example.workers.dev",
      ),
    ).toBe("https://pr-1.example.workers.dev");
  });

  it("derives workers.dev origin from the deploy /app/ entry URL", () => {
    expect(
      previewWorkerOriginFromBaseUrl(
        "https://pr-13-quorum-preview.example.workers.dev/app/",
      ),
    ).toBe("https://pr-13-quorum-preview.example.workers.dev");
  });
});

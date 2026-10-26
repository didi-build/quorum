import { describe, expect, it } from "vitest";
import {
  expectedPreviewScreenshotCount,
  PREVIEW_SCREENSHOT_COLOR_SCHEMES,
  PREVIEW_SCREENSHOT_ROUTES,
  PREVIEW_SCREENSHOT_VIEWPORTS,
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
});

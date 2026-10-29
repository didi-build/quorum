import { describe, expect, it } from "vitest";
import { resolveGalleryPreviewMode } from "../scripts/lib/gallery-preview-mode.mjs";

describe("resolveGalleryPreviewMode (unit)", () => {
  it("returns unconfigured when creds are missing", () => {
    expect(
      resolveGalleryPreviewMode({
        credsReady: false,
        previewOutcome: "success",
        probeOutcome: "success",
      }),
    ).toBe("unconfigured");
  });

  it("returns deployed when deploy and probe succeed", () => {
    expect(
      resolveGalleryPreviewMode({
        credsReady: true,
        previewOutcome: "success",
        probeOutcome: "success",
      }),
    ).toBe("deployed");
  });

  it("returns failed when probe fails", () => {
    expect(
      resolveGalleryPreviewMode({
        credsReady: true,
        previewOutcome: "success",
        probeOutcome: "failure",
      }),
    ).toBe("failed");
  });
});

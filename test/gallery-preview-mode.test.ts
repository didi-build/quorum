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

  it("returns failed when preview failed but probe succeeded", () => {
    expect(
      resolveGalleryPreviewMode({
        credsReady: true,
        previewOutcome: "failure",
        probeOutcome: "success",
      }),
    ).toBe("failed");
  });

  it("returns failed when probe was skipped while creds are set", () => {
    expect(
      resolveGalleryPreviewMode({
        credsReady: true,
        previewOutcome: "success",
        probeOutcome: "skipped",
      }),
    ).toBe("failed");
  });
});

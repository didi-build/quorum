import { afterEach, describe, expect, it, vi } from "vitest";

describe("isMockPreviewRuntime", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is true in development", async () => {
    vi.stubEnv("DEV", "true");
    vi.stubEnv("MODE", "development");
    const { isMockPreviewRuntime } = await import("./mockPreviewMode");
    expect(isMockPreviewRuntime()).toBe(true);
  });

  it("is true in mock-preview mode builds", async () => {
    vi.stubEnv("DEV", "false");
    vi.stubEnv("PROD", "true");
    vi.stubEnv("MODE", "mock-preview");
    const { isMockPreviewRuntime } = await import("./mockPreviewMode");
    expect(isMockPreviewRuntime()).toBe(true);
  });

  it("is false in production mode", async () => {
    vi.stubEnv("DEV", "false");
    vi.stubEnv("PROD", "true");
    vi.stubEnv("MODE", "production");
    const { isMockPreviewRuntime } = await import("./mockPreviewMode");
    expect(isMockPreviewRuntime()).toBe(false);
  });
});

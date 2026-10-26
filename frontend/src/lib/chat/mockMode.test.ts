import { afterEach, describe, expect, it, vi } from "vitest";

describe("isChatMockMode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is false in production even when VITE_CHAT_MOCK is true", async () => {
    vi.stubEnv("DEV", "");
    vi.stubEnv("PROD", "true");
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITE_CHAT_MOCK", "true");
    const { isChatMockMode } = await import("./mockMode");
    expect(isChatMockMode()).toBe(false);
  });

  it("is true in dev when VITE_CHAT_MOCK is unset", async () => {
    vi.stubEnv("MODE", "development");
    const { isChatMockMode } = await import("./mockMode");
    expect(isChatMockMode()).toBe(true);
  });

  it("is false in dev when VITE_CHAT_MOCK is false", async () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("VITE_CHAT_MOCK", "false");
    const { isChatMockMode } = await import("./mockMode");
    expect(isChatMockMode()).toBe(false);
  });

  it("is true in mock-preview when VITE_CHAT_MOCK is unset", async () => {
    vi.stubEnv("MODE", "mock-preview");
    vi.stubEnv("PROD", "true");
    const { isChatMockMode } = await import("./mockMode");
    expect(isChatMockMode()).toBe(true);
  });
});

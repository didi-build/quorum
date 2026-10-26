import { describe, expect, it } from "vitest";
import { resolveSourcesMockMode } from "./mode";

describe("resolveSourcesMockMode", () => {
  it("uses HTTP in production even when VITE_SOURCES_MOCK is true", () => {
    expect(
      resolveSourcesMockMode({ DEV: false, PROD: true, VITE_SOURCES_MOCK: "true" }),
    ).toBe("http");
  });

  it("uses mock in development by default", () => {
    expect(resolveSourcesMockMode({ DEV: true, PROD: false })).toBe("mock");
  });

  it("uses HTTP in development when VITE_SOURCES_MOCK is false", () => {
    expect(
      resolveSourcesMockMode({ DEV: true, PROD: false, VITE_SOURCES_MOCK: "false" }),
    ).toBe("http");
  });

  it("uses mock in development when VITE_SOURCES_MOCK is true", () => {
    expect(
      resolveSourcesMockMode({ DEV: true, PROD: false, VITE_SOURCES_MOCK: "true" }),
    ).toBe("mock");
  });

  it("uses mock in mock-preview even when PROD is true", () => {
    expect(
      resolveSourcesMockMode({
        DEV: false,
        PROD: true,
        MODE: "mock-preview",
      }),
    ).toBe("mock");
  });
});

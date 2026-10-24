import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setSourcesApi, getSourcesMockMode } from "./index";

describe("getSourcesMockMode", () => {
  it("reflects import.meta.env in this test runtime", () => {
    const mode = getSourcesMockMode();
    expect(mode === "mock" || mode === "http").toBe(true);
  });
});

describe("resolveSourcesApi bundling", () => {
  beforeEach(() => {
    setSourcesApi(null);
  });

  afterEach(() => {
    setSourcesApi(null);
  });

  it("loads mock via dynamic import only in dev mock mode", async () => {
    if (getSourcesMockMode() !== "mock") {
      return;
    }
    const { resolveSourcesApi } = await import("./index");
    const api = await resolveSourcesApi();
    const sources = await api.listSources();
    expect(sources.length).toBeGreaterThan(0);
  });
});

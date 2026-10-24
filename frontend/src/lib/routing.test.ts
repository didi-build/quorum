import { describe, expect, it } from "vitest";
import {
  appPath,
  parseConnectionCallback,
  providerDisplayName,
  resolveAppView,
} from "./routing";

describe("resolveAppView", () => {
  it("routes chat and connections paths under the app base", () => {
    expect(resolveAppView("/app/")).toBe("chat");
    expect(resolveAppView("/app")).toBe("chat");
    expect(resolveAppView("/app/connections")).toBe("connections");
    expect(resolveAppView("/app/connections/")).toBe("connections");
    expect(resolveAppView("/app/not-allowed")).toBe("not-allowed");
  });
});

describe("parseConnectionCallback", () => {
  it("reads provider and status query params", () => {
    expect(parseConnectionCallback("?provider=github&status=connected")).toEqual({
      provider: "github",
      status: "connected",
    });
    expect(parseConnectionCallback("")).toEqual({
      provider: null,
      status: null,
    });
  });
});

describe("appPath", () => {
  it("builds chat and connections URLs from the vite base", () => {
    expect(appPath("chat")).toBe("/app/");
    expect(appPath("connections")).toBe("/app/connections");
    expect(appPath("not-allowed")).toBe("/app/not-allowed");
  });
});

describe("providerDisplayName", () => {
  it("formats known providers", () => {
    expect(providerDisplayName("github")).toBe("GitHub");
    expect(providerDisplayName("linear")).toBe("Linear");
  });
});

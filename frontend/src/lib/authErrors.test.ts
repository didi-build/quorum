import { describe, expect, it } from "vitest";
import { humanizeApiError, humanizeApiErrorNextStep } from "./authErrors";

describe("humanizeApiError", () => {
  it("maps 401 to session copy", () => {
    expect(humanizeApiError(401, '{"detail":"Not authenticated"}')).toBe(
      "Your session has ended. Sign in again to keep going.",
    );
  });

  it("maps 403 with source ref", () => {
    expect(humanizeApiError(403, "", { sourceRef: "didi-build/legacy-api" })).toBe(
      "Quorum can't read didi-build/legacy-api anymore. Give it access in GitHub, then refresh.",
    );
  });

  it("maps 403 without source ref", () => {
    expect(humanizeApiError(403, "forbidden")).toBe(
      "Quorum lost access to this source.",
    );
  });

  it("maps 429 for GitHub and Linear", () => {
    expect(humanizeApiError(429, "")).toBe(
      "GitHub asked Quorum to slow down. Wait a minute, then try again.",
    );
    expect(humanizeApiError(429, "", { provider: "linear" })).toBe(
      "Linear asked Quorum to slow down. Wait a minute, then try again.",
    );
  });

  it("never returns raw JSON or status text", () => {
    const message = humanizeApiError(418, '{"detail":"teapot"}');
    expect(message).not.toContain("418");
    expect(message).not.toContain("teapot");
    expect(message).toBe("Something went wrong on our side. Try again in a moment.");
  });
});

describe("humanizeApiErrorNextStep", () => {
  it("returns spec next steps", () => {
    expect(humanizeApiErrorNextStep(401)).toBe("Sign in again");
    expect(humanizeApiErrorNextStep(403)).toBe("Check GitHub access");
    expect(humanizeApiErrorNextStep(429)).toBe("Try again");
  });
});

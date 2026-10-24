import { describe, expect, it } from "vitest";
import { verdictLabel } from "./statusLabels";

describe("verdictLabel", () => {
  it("uses polished verdict copy", () => {
    expect(verdictLabel("approve")).toBe("Approve");
    expect(verdictLabel("request-changes")).toBe("Request changes");
    expect(verdictLabel("comment")).toBe("Comment");
  });
});

import { describe, expect, it } from "vitest";
import { sourceStatusLabel, verdictLabel } from "./statusLabels";

describe("sourceStatusLabel", () => {
  it("maps source statuses to spec copy", () => {
    expect(sourceStatusLabel("ready")).toBe("Ready");
    expect(sourceStatusLabel("pending")).toBe("Waiting to start");
    expect(sourceStatusLabel("indexing")).toBe("Indexing. Usually a few minutes.");
    expect(sourceStatusLabel("error")).toBe("Can't read this source");
  });
});

describe("verdictLabel", () => {
  it("uses polished verdict copy", () => {
    expect(verdictLabel("approve")).toBe("Approve");
    expect(verdictLabel("request-changes")).toBe("Request changes");
    expect(verdictLabel("comment")).toBe("Comment");
  });
});

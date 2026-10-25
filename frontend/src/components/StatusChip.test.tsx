import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusChip } from "./StatusChip";

describe("StatusChip", () => {
  afterEach(() => cleanup());

  it("shows ready copy", () => {
    render(<StatusChip status="ready" />);
    expect(screen.getByText("Ready")).toBeTruthy();
  });

  it("shows pending copy", () => {
    render(<StatusChip status="pending" />);
    expect(screen.getByText("Waiting to start")).toBeTruthy();
  });

  it("shows indexing copy", () => {
    render(<StatusChip status="indexing" />);
    expect(screen.getByText("Indexing. Usually a few minutes.")).toBeTruthy();
  });

  it("shows error copy", () => {
    render(<StatusChip status="error" />);
    expect(screen.getByText("Can't read this source")).toBeTruthy();
  });

  it("shows refreshing state", () => {
    render(<StatusChip status="ready" refreshing />);
    expect(screen.getByText("Refreshing")).toBeTruthy();
  });
});

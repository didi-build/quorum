import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EntryLoading } from "./EntryLoading";

describe("EntryLoading", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the loading mark and label", () => {
    render(<EntryLoading />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });
});

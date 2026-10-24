import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VerdictBadge } from "./VerdictBadge";

describe("VerdictBadge", () => {
  it("renders spec labels for verdict values", () => {
    const { rerender } = render(<VerdictBadge verdict="approve" />);
    expect(screen.getByText("Approve")).toBeTruthy();

    rerender(<VerdictBadge verdict="request_changes" />);
    expect(screen.getByText("Request changes")).toBeTruthy();

    rerender(<VerdictBadge verdict="comment" />);
    expect(screen.getByText("Comment")).toBeTruthy();
  });
});

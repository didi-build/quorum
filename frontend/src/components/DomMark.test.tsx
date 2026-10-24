import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DomMark } from "./DomMark";

describe("DomMark", () => {
  it("renders the quorum tile mark", () => {
    const { container } = render(<DomMark size={32} />);
    const mark = container.querySelector(".quorum-mark");
    expect(mark).toBeTruthy();
    expect(mark?.querySelectorAll(".quorum-mark__dots span").length).toBe(3);
  });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useFocusTrap } from "./useFocusTrap";

function TrapFixture({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(active, ref);
  return (
    <div ref={ref}>
      <button type="button">First</button>
      <button type="button">Last</button>
    </div>
  );
}

describe("useFocusTrap", () => {
  afterEach(() => cleanup());

  it("wraps Tab from last to first and Shift+Tab from first to last", () => {
    render(<TrapFixture active />);
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});

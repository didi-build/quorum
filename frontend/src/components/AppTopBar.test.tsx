import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppTopBar } from "./AppTopBar";

const user = { login: "diadem", github_id: 1 };

describe("AppTopBar", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("exposes Quorum as the brand accessible name", () => {
    window.history.pushState({}, "", "/app/");
    render(<AppTopBar user={user} onSignedOut={() => undefined} />);
    expect(screen.getByRole("link", { name: "Quorum" })).toBeTruthy();
  });

  it("marks the active section with aria-current", () => {
    window.history.pushState({}, "", "/app/connections");
    render(<AppTopBar user={user} onSignedOut={() => undefined} />);
    const nav = screen.getByRole("navigation", { name: "Sections" });
    const chat = within(nav).getByRole("link", { name: "Chat" });
    const connections = within(nav).getByRole("link", { name: "Connections" });
    expect(chat.getAttribute("aria-current")).toBeNull();
    expect(connections.getAttribute("aria-current")).toBe("page");
  });
});

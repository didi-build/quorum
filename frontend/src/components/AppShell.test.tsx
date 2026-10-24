import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as authApi from "../lib/api/auth";
import * as routing from "../lib/routing";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  beforeEach(() => {
    vi.spyOn(routing, "resolveAppView").mockReturnValue("chat");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows sign-in when session is missing", async () => {
    vi.spyOn(authApi, "fetchAuthUser").mockResolvedValue(null);
    render(<AppShell />);
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Sign in to Quorum" }),
      ).toBeInTheDocument();
    });
  });

  it("shows loading while session resolves", () => {
    vi.spyOn(authApi, "fetchAuthUser").mockReturnValue(new Promise(() => {}));
    render(<AppShell />);
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("shows signed-in shell with account menu", async () => {
    vi.spyOn(authApi, "fetchAuthUser").mockResolvedValue({
      login: "diadem",
      github_id: 1,
    });
    render(<AppShell />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Account menu for @diadem" }),
      ).toBeInTheDocument();
    });
  });

  it.each([
    ["404", new Error("Not found")],
    ["5xx", new Error("Something went wrong on our side. Try again in a moment.")],
    ["network", new TypeError("Failed to fetch")],
  ])("shows sign-in when fetchAuthUser fails (%s)", async (_label, error) => {
    vi.spyOn(authApi, "fetchAuthUser").mockRejectedValue(error);
    render(<AppShell />);
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Sign in to Quorum" }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Loading")).not.toBeInTheDocument();
  });
});

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as authApi from "../lib/api/auth";
import { NotAllowedScreen } from "./NotAllowedScreen";

describe("NotAllowedScreen", () => {
  beforeEach(() => {
    vi.spyOn(authApi, "fetchAccessDeniedInfo");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows loading while access info is fetched", () => {
    vi.mocked(authApi.fetchAccessDeniedInfo).mockReturnValue(new Promise(() => {}));
    render(<NotAllowedScreen />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("shows invite-only state with handle from access-denied", async () => {
    vi.mocked(authApi.fetchAccessDeniedInfo).mockResolvedValue({
      login: "sam-rivera",
    });
    render(<NotAllowedScreen />);
    await waitFor(() => {
      expect(screen.getByText(/Signed in as @sam-rivera/)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { name: "You're not on the list yet" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request access" })).toHaveAttribute(
      "href",
      expect.stringContaining("sam-rivera"),
    );
  });

  it("shows load failed state", async () => {
    vi.mocked(authApi.fetchAccessDeniedInfo).mockRejectedValue(new Error("fail"));
    render(<NotAllowedScreen />);
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "We couldn't check your access" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("Something went wrong on our side. Try again in a moment."),
    ).toBeInTheDocument();
  });
});

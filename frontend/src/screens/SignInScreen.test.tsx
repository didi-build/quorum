import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInScreen } from "./SignInScreen";

describe("SignInScreen", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows sign-in copy and GitHub action", () => {
    render(<SignInScreen />);
    expect(
      screen.getByRole("heading", { name: "Sign in to Quorum" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sign in with GitHub/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /quorum.didi.build/i })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("disables the button and shows redirecting copy after click", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    render(<SignInScreen />);

    const button = screen.getByRole("button", { name: /Sign in with GitHub/i });
    await userEvent.click(button);

    expect(button).toBeDisabled();
    expect(screen.getByText("Taking you to GitHub")).toBeInTheDocument();
    expect(assign).toHaveBeenCalledWith("/auth/github/login");
  });
});

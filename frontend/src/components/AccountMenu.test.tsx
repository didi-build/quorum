import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as auth from "../lib/auth";
import { AccountMenu } from "./AccountMenu";

const user = { login: "diadem", github_id: 1 };

describe("AccountMenu", () => {
  beforeEach(() => {
    vi.spyOn(auth, "logout").mockResolvedValue();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens on avatar click and closes on Escape with focus returned", async () => {
    const onSignedOut = vi.fn();
    render(<AccountMenu user={user} onSignedOut={onSignedOut} />);

    const trigger = screen.getByRole("button", { name: "Account menu for @diadem" });
    await userEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Connections" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it("calls logout and onSignedOut from Sign out", async () => {
    const onSignedOut = vi.fn();
    render(<AccountMenu user={user} onSignedOut={onSignedOut} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Account menu for @diadem" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));

    expect(auth.logout).toHaveBeenCalled();
    expect(onSignedOut).toHaveBeenCalled();
  });
});

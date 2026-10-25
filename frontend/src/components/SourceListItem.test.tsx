import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeSource } from "../types/sources";
import { SourceListItem } from "./SourceListItem";

const baseSource: KnowledgeSource = {
  id: "src-1",
  user_id: "u1",
  project_id: null,
  source_type: "github_repo",
  external_ref: "didi-build/quorum",
  connection_id: "conn-github",
  name: "didi-build/quorum",
  status: "ready",
  status_message: null,
  last_indexed_at: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

describe("SourceListItem", () => {
  afterEach(() => cleanup());

  it("renders status line for each status", () => {
    const statuses = ["ready", "pending", "indexing", "error"] as const;
    for (const status of statuses) {
      cleanup();
      render(
        <SourceListItem
          source={{
            ...baseSource,
            status,
            status_message: status === "error" ? "oops" : null,
          }}
          onRefresh={() => undefined}
          onRemove={async () => undefined}
        />,
      );
      if (status === "ready") {
        expect(screen.getByText("Ready")).toBeTruthy();
      }
      if (status === "pending") {
        expect(screen.getByText("Waiting to start")).toBeTruthy();
      }
      if (status === "indexing") {
        expect(screen.getByText("Indexing. Usually a few minutes.")).toBeTruthy();
      }
      if (status === "error") {
        expect(screen.getByText("Can't read this source")).toBeTruthy();
        expect(screen.getByText("oops")).toBeTruthy();
      }
    }
  });

  it("shows refresh error on the row", () => {
    render(
      <SourceListItem
        source={baseSource}
        refreshError="GitHub asked Quorum to slow down. Wait a minute, then try again."
        onRefresh={() => undefined}
        onRemove={async () => undefined}
      />,
    );
    expect(
      screen.getByText(
        "GitHub asked Quorum to slow down. Wait a minute, then try again.",
      ),
    ).toBeTruthy();
  });

  it("closes the menu on Escape and returns focus to the button", () => {
    render(
      <SourceListItem
        source={baseSource}
        onRefresh={() => undefined}
        onRemove={async () => undefined}
      />,
    );
    const trigger = screen.getByRole("button", { name: /Actions for/ });
    fireEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: /Refresh/ })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menuitem", { name: /Refresh/ })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("asks for confirmation before remove", async () => {
    const onRemove = vi.fn(async () => undefined);
    render(
      <SourceListItem
        source={baseSource}
        onRefresh={() => undefined}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Actions for/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Remove/ }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onRemove).toHaveBeenCalled());
  });
});

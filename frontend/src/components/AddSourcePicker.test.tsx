import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMockSourcesApi, mockConnectionsNone } from "../lib/api/sources";
import { AddSourcePicker } from "./AddSourcePicker";

const connected = [
  {
    id: "conn-github",
    provider: "github" as const,
    connected: true,
    account_label: "didi-build",
  },
  {
    id: "conn-linear",
    provider: "linear" as const,
    connected: true,
    account_label: "Didi Build",
  },
];

describe("AddSourcePicker", () => {
  afterEach(() => cleanup());

  it("shows loading skeletons", async () => {
    const api = createMockSourcesApi();
    render(
      <AddSourcePicker
        open
        connections={connected}
        api={api}
        onClose={() => undefined}
        onAdded={() => undefined}
      />,
    );
    expect(screen.getByRole("status", { name: "Loading sources" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText("didi-build/legacy-api")).toBeTruthy());
  });

  it("shows not connected state", async () => {
    const api = createMockSourcesApi({ connections: mockConnectionsNone() });
    render(
      <AddSourcePicker
        open
        connections={mockConnectionsNone()}
        api={api}
        onClose={() => undefined}
        onAdded={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getByText("Connect GitHub first")).toBeTruthy());
  });

  it("filters with search and shows no match", async () => {
    const api = createMockSourcesApi();
    render(
      <AddSourcePicker
        open
        connections={connected}
        api={api}
        onClose={() => undefined}
        onAdded={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getByText("didi-build/legacy-api")).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText("Search repos"), {
      target: { value: "billing" },
    });
    await waitFor(() => expect(screen.getByText(/Nothing matches/)).toBeTruthy());
    expect(screen.getByRole("button", { name: "Add sources" })).toBeDisabled();
  });

  it("shows rate limit copy on 429", async () => {
    const api = createMockSourcesApi({
      availableError: { connectionId: "conn-github", status: 429, provider: "github" },
    });
    render(
      <AddSourcePicker
        open
        connections={connected}
        api={api}
        onClose={() => undefined}
        onAdded={() => undefined}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByText(
          "GitHub asked Quorum to slow down. Wait a minute, then try again.",
        ),
      ).toBeTruthy(),
    );
  });

  it("disables already added rows", async () => {
    const api = createMockSourcesApi();
    render(
      <AddSourcePicker
        open
        connections={connected}
        api={api}
        onClose={() => undefined}
        onAdded={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getAllByText("Added").length).toBeGreaterThan(0));
  });
});

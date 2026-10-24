import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMockSourcesApi,
  mockConnectionsNone,
  mockSourcesEmpty,
  setSourcesApi,
} from "../lib/api/sources";
import { ConnectionsView } from "./ConnectionsView";

describe("ConnectionsView", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/app/connections");
  });

  afterEach(() => {
    cleanup();
    setSourcesApi(null);
  });

  it("shows loading then source rows", async () => {
    const api = createMockSourcesApi();
    render(<ConnectionsView api={api} />);
    expect(screen.getByRole("status", { name: "Loading sources" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText("didi-build/quorum")).toBeTruthy());
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByText("Waiting to start")).toBeTruthy();
  });

  it("shows empty list when there are no sources", async () => {
    const api = createMockSourcesApi({ sources: mockSourcesEmpty() });
    render(<ConnectionsView api={api} />);
    await waitFor(() =>
      expect(screen.getByText("No knowledge sources yet")).toBeTruthy(),
    );
  });

  it("shows connect buttons when accounts are not connected", async () => {
    const api = createMockSourcesApi({
      connections: mockConnectionsNone(),
      sources: mockSourcesEmpty(),
    });
    render(<ConnectionsView api={api} />);
    await waitFor(() => expect(screen.getAllByText("Not connected").length).toBe(2));
    expect(screen.getByRole("link", { name: "Connect GitHub" })).toHaveAttribute(
      "href",
      "/oauth/github/authorize",
    );
    expect(screen.getByRole("link", { name: "Connect Linear" })).toHaveAttribute(
      "href",
      "/oauth/linear/authorize",
    );
  });

  it("shows oauth success banner from query params", async () => {
    window.history.pushState(
      {},
      "",
      "/app/connections?provider=github&status=connected",
    );
    const api = createMockSourcesApi({ sources: mockSourcesEmpty() });
    render(<ConnectionsView api={api} />);
    await waitFor(() =>
      expect(
        screen.getByText("GitHub connected. Add the repos Quorum should read."),
      ).toBeTruthy(),
    );
  });

  it("shows load failed state", async () => {
    const api = {
      listConnections: async () => {
        throw new Error("fail");
      },
      listSources: async () => [],
      refreshSource: async () => {
        throw new Error("fail");
      },
      deleteSource: async () => undefined,
      listAvailableSources: async () => [],
      createSources: async () => [],
    };
    render(<ConnectionsView api={api} />);
    await waitFor(() =>
      expect(
        screen.getByText("Something went wrong on our side. Try again in a moment."),
      ).toBeTruthy(),
    );
  });
});

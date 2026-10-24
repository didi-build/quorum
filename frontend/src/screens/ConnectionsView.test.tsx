import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockSourcesApi,
  mockConnectionsNone,
  mockSourcesEmpty,
} from "../lib/api/sources/mock";
import { setSourcesApi } from "../lib/api/sources";
import { SourcesApiError } from "../lib/api/sources/errors";
import { ConnectionsView } from "./ConnectionsView";

vi.mock("../lib/api/sources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api/sources")>();
  const http = await import("../lib/api/sources/http");
  return {
    ...actual,
    resolveSourcesApi: async () => http.createHttpSourcesApi(),
    getSourcesMockMode: () => "http" as const,
  };
});

describe("ConnectionsView", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/app/connections");
  });

  afterEach(() => {
    cleanup();
    setSourcesApi(null);
    vi.unstubAllGlobals();
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
    expect(screen.queryByRole("status", { name: "Loading sources" })).toBeNull();
  });

  it("shows load failed when HTTP routes return 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("Not Found", { status: 404 }))),
    );
    render(<ConnectionsView />);
    await waitFor(() =>
      expect(
        screen.getByText("Something went wrong on our side. Try again in a moment."),
      ).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading sources" })).toBeNull();
  });

  it("shows refresh error on the source row", async () => {
    const api = createMockSourcesApi();
    const failing = { ...api };
    failing.refreshSource = async () => {
      throw new SourcesApiError(429, "slow", "github");
    };
    render(<ConnectionsView api={failing} />);
    await waitFor(() => expect(screen.getByText("didi-build/quorum")).toBeTruthy());
    fireEvent.click(
      screen.getByRole("button", { name: /Actions for didi-build\/quorum/ }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: /Refresh/ }));
    await waitFor(() =>
      expect(
        screen.getByText(
          "GitHub asked Quorum to slow down. Wait a minute, then try again.",
        ),
      ).toBeTruthy(),
    );
  });

  it("shows toast and pending rows after adding sources", async () => {
    const api = createMockSourcesApi({
      sources: mockSourcesEmpty(),
    });
    render(<ConnectionsView api={api} />);
    await waitFor(() => screen.getByRole("button", { name: "Add sources" }));
    fireEvent.click(screen.getByRole("button", { name: "Add sources" }));
    await waitFor(() => expect(screen.getByText("didi-build/legacy-api")).toBeTruthy());
    fireEvent.click(screen.getByText("didi-build/legacy-api"));
    fireEvent.click(screen.getByText("didi-build/nodrift"));
    fireEvent.click(screen.getByRole("button", { name: "Add 2 sources" }));
    await waitFor(() =>
      expect(screen.getByText("Added 2 sources. Indexing has started.")).toBeTruthy(),
    );
    expect(screen.getAllByText("Waiting to start").length).toBeGreaterThanOrEqual(2);
  });
});

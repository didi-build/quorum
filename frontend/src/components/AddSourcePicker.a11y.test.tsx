import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockSourcesApi } from "../lib/api/sources/mock";
import { AddSourcePicker } from "./AddSourcePicker";

const connected = [
  {
    id: "conn-github",
    provider: "github" as const,
    connected: true,
    account_label: "didi-build",
  },
];

describe("AddSourcePicker accessibility", () => {
  afterEach(() => cleanup());

  it("closes on Escape and returns focus to the opener", async () => {
    const api = createMockSourcesApi();
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const returnFocusRef = { current: opener };
    const onClose = vi.fn();

    render(
      <AddSourcePicker
        open
        connections={connected}
        api={api}
        returnFocusRef={returnFocusRef}
        onClose={onClose}
        onAdded={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.getByText("didi-build/legacy-api")).toBeTruthy());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

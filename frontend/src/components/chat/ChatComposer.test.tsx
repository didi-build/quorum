import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChatComposer } from "./ChatComposer";

afterEach(() => {
  cleanup();
});

describe("ChatComposer", () => {
  it("returns focus to the textarea when focusSignal changes and the field is enabled", async () => {
    const { rerender } = render(
      <ChatComposer
        disabled={true}
        busy={false}
        mobile={false}
        focusSignal={0}
        onSend={() => {}}
      />,
    );

    const textarea = screen.getByLabelText("Message") as HTMLTextAreaElement;
    textarea.focus();

    rerender(
      <ChatComposer
        disabled={false}
        busy={false}
        mobile={false}
        focusSignal={1}
        onSend={() => {}}
      />,
    );

    await waitFor(() => {
      expect(document.activeElement).toBe(textarea);
    });
  });
});

import { describe, expect, it } from "vitest";
import { handleGreeting } from "../src/domain/chat/handlers/greeting.js";

describe("handleGreeting (v1 parity)", () => {
  it("trims input before matching hello branch", async () => {
    const response = await handleGreeting("session", "  hello  ");
    expect(response.content).toBe(
      "Hello! Ask me about the knowledge layer, or bring a strategic question for the council.",
    );
  });

  it("matches howdy in the hello branch", async () => {
    const response = await handleGreeting("session", "howdy");
    expect(response.content).toContain("Hello!");
  });

  it("matches the thank branch", async () => {
    const response = await handleGreeting("session", "Thanks for the help");
    expect(response.content).toBe(
      "You're welcome. I'm here whenever you need an answer or a council review.",
    );
  });

  it("uses the fallback branch for other greetings", async () => {
    const response = await handleGreeting("session", "Good morning");
    expect(response.content).toBe(
      "Hi there. I can answer knowledge questions or route strategic reviews to the council.",
    );
  });
});

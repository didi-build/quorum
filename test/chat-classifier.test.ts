import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  CLASSIFIER_SYSTEM_PROMPT,
  classifyIntent,
} from "../src/domain/chat/classifier.js";
import { SUPERVISOR_TEMPERATURE } from "../src/domain/llm/factory.js";

describe("classifyIntent (mocked client)", () => {
  const config = {
    anthropicApiKey: "test-anthropic-api-key",
    supervisorModel: "claude-haiku-4-5",
  };

  function mockClient(intentJson: unknown): Anthropic {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(intentJson) }],
    });
    return { messages: { create } } as unknown as Anthropic;
  }

  it("calls messages.create on SUPERVISOR_MODEL with the v1 system prompt and temperature", async () => {
    const client = mockClient({ intent: "greeting" });
    await classifyIntent("Hello!", { config, client });
    const create = client.messages.create as ReturnType<typeof vi.fn>;
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: "claude-haiku-4-5",
      temperature: SUPERVISOR_TEMPERATURE,
      system: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: "Hello!" }],
    });
  });

  it("returns structured intent labels from JSON output", async () => {
    const client = mockClient({ intent: "linear_read" });
    await expect(classifyIntent("Show issue 1", { config, client })).resolves.toBe(
      "linear_read",
    );
  });

  it("throws when the model returns an invalid intent", async () => {
    const client = mockClient({ intent: "unknown_intent" });
    await expect(classifyIntent("hello", { config, client })).rejects.toThrow(
      /invalid intent/i,
    );
  });
});

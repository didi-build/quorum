import { describe, expect, it } from "vitest";
import { loadRouterEvalDataset, scoreRouterDataset } from "../src/domain/chat/eval.js";
import type { ChatIntent } from "../src/domain/schemas/chat.js";

describe("router eval dataset (v1 parity)", () => {
  it("has between 50 and 100 examples", () => {
    const examples = loadRouterEvalDataset();
    expect(examples.length).toBeGreaterThanOrEqual(50);
    expect(examples.length).toBeLessThanOrEqual(100);
  });

  it("covers all five intents", () => {
    const examples = loadRouterEvalDataset();
    const intents = new Set(examples.map((example) => example.expected_intent));
    expect(intents).toEqual(
      new Set<ChatIntent>([
        "greeting",
        "simple_retrieval",
        "strategic_session",
        "linear_read",
        "linear_write",
      ]),
    );
  });

  it("loads 72 examples from the bundled JSON import", () => {
    expect(loadRouterEvalDataset()).toHaveLength(72);
  });

  it("scores perfectly with a mapped mock classifier", async () => {
    const examples = loadRouterEvalDataset().slice(0, 10);

    const mappedClassifier = async (message: string): Promise<ChatIntent> => {
      for (const example of examples) {
        if (example.message === message) {
          return example.expected_intent;
        }
      }
      return "greeting";
    };

    const result = await scoreRouterDataset(examples, mappedClassifier);
    expect(result.total).toBe(10);
    expect(result.correct).toBe(10);
    expect(result.accuracy).toBe(1);
  });
});

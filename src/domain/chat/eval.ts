import routerEvalDatasetJson from "./data/router_eval_dataset.json" with { type: "json" };
import { classifyIntent, type ClassifyIntentFn } from "./classifier.js";
import { type ChatIntent, isChatIntent } from "../schemas/chat.js";

export interface RouterEvalExample {
  message: string;
  expected_intent: ChatIntent;
}

export interface RouterEvalResult {
  total: number;
  correct: number;
  accuracy: number;
  mismatches: Array<[string, ChatIntent, ChatIntent]>;
}

function parseRouterEvalDatasetRaw(raw: unknown): RouterEvalExample[] {
  if (!Array.isArray(raw)) {
    throw new Error("Router eval dataset must be a JSON array");
  }
  return raw.map((item) => {
    if (typeof item !== "object" || item === null) {
      throw new Error("Router eval example must be an object");
    }
    const record = item as Record<string, unknown>;
    const message = record.message;
    const expected = record.expected_intent;
    if (
      typeof message !== "string" ||
      typeof expected !== "string" ||
      !isChatIntent(expected)
    ) {
      throw new Error("Router eval example is missing message or expected_intent");
    }
    return { message, expected_intent: expected };
  });
}

export function loadRouterEvalDataset(): RouterEvalExample[] {
  return parseRouterEvalDatasetRaw(routerEvalDatasetJson);
}

export async function scoreRouterDataset(
  examples: RouterEvalExample[],
  classifier: ClassifyIntentFn,
): Promise<RouterEvalResult> {
  const mismatches: Array<[string, ChatIntent, ChatIntent]> = [];
  let correct = 0;

  for (const example of examples) {
    const predicted = await classifier(example.message);
    if (predicted === example.expected_intent) {
      correct += 1;
    } else {
      mismatches.push([example.message, example.expected_intent, predicted]);
    }
  }

  const total = examples.length;
  const accuracy = total > 0 ? correct / total : 0;
  return { total, correct, accuracy, mismatches };
}

/** Live eval entry: uses real `classifyIntent` (not for CI). */
export async function scoreRouterDatasetLive(
  examples: RouterEvalExample[],
  deps: Parameters<typeof classifyIntent>[1],
): Promise<RouterEvalResult> {
  return scoreRouterDataset(examples, (message) => classifyIntent(message, deps));
}

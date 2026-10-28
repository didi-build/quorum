import Anthropic from "@anthropic-ai/sdk";
import {
  ANTHROPIC_CLIENT_MAX_RETRIES,
  ANTHROPIC_CLIENT_TIMEOUT_MS,
} from "../src/domain/llm/factory.js";
import {
  classifyIntent,
  type ClassifierConfig,
} from "../src/domain/chat/classifier.js";
import { loadRouterEvalDataset, scoreRouterDataset } from "../src/domain/chat/eval.js";

const ACCURACY_BAR = 0.85;

export function readRouterEvalEnv(): ClassifierConfig {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicApiKey === undefined || anthropicApiKey.length === 0) {
    throw new Error("ANTHROPIC_API_KEY is required for npm run eval:router");
  }
  const supervisorModel = process.env.SUPERVISOR_MODEL?.trim() ?? "claude-haiku-4-5";
  return { anthropicApiKey, supervisorModel };
}

export async function runRouterEval(): Promise<number> {
  const config = readRouterEvalEnv();
  const client = new Anthropic({
    apiKey: config.anthropicApiKey,
    timeout: ANTHROPIC_CLIENT_TIMEOUT_MS,
    maxRetries: ANTHROPIC_CLIENT_MAX_RETRIES,
  });
  const examples = loadRouterEvalDataset();
  const result = await scoreRouterDataset(examples, (message) =>
    classifyIntent(message, { config, client }),
  );

  console.log(
    `Router eval: ${result.correct}/${result.total} correct (${(result.accuracy * 100).toFixed(1)}%)`,
  );
  if (result.mismatches.length > 0) {
    console.log("Mismatches:");
    for (const [message, expected, predicted] of result.mismatches.slice(0, 20)) {
      console.log(`- expected=${expected} predicted=${predicted}: ${message}`);
    }
  }
  return result.accuracy >= ACCURACY_BAR ? 0 : 1;
}

async function main(): Promise<void> {
  process.exitCode = await runRouterEval();
}

const isEvalRouterEntry =
  typeof process.argv[1] === "string" && process.argv[1].endsWith("eval-router.ts");

if (isEvalRouterEntry) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

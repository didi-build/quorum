import type Anthropic from "@anthropic-ai/sdk";
import type { QuorumConfig } from "../../config/types.js";
import {
  getAnthropicClient,
  getSupervisorModel,
  SUPERVISOR_TEMPERATURE,
} from "../llm/factory.js";
import { textFromMessageContent } from "../llm/message-content.js";
import { type ChatIntent, isChatIntent } from "../schemas/chat.js";

/** Verbatim v1 `CLASSIFIER_SYSTEM_PROMPT` (`src/domain/chat/classifier.py`). */
export const CLASSIFIER_SYSTEM_PROMPT = `You are the domAIn chat intent classifier. Classify each user message into exactly one intent:

- greeting: small talk, hellos, thanks, or other conversational openers with no knowledge lookup
- simple_retrieval: factual questions answerable from indexed knowledge (docs, ADRs, codebase, roadmap context)
- strategic_session: review-worthy or strategic decisions needing multi-perspective council debate
- linear_read: requests to read, fetch, or display Linear issues, tickets, or roadmap items
- linear_write: requests to update, create, comment on, or change Linear issues or roadmap items

Return only the intent label. When unsure between simple_retrieval and strategic_session, prefer simple_retrieval for factual lookups and strategic_session for proposals, reviews, tradeoffs, or "should we" decisions.`;

const INTENT_CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: [
        "greeting",
        "simple_retrieval",
        "strategic_session",
        "linear_read",
        "linear_write",
      ],
      description: "The classified routing intent for the user message.",
    },
  },
  required: ["intent"],
  additionalProperties: false,
} as const;

export type ClassifyIntentFn = (message: string) => Promise<ChatIntent>;

export type ClassifierConfig = Pick<
  QuorumConfig,
  "anthropicApiKey" | "supervisorModel"
>;

export interface ClassifierDeps {
  config: ClassifierConfig;
  client?: Anthropic;
}

export async function classifyIntent(
  message: string,
  deps: ClassifierDeps,
): Promise<ChatIntent> {
  const client = deps.client ?? getAnthropicClient(deps.config);
  const response = await client.messages.create({
    model: getSupervisorModel(deps.config),
    max_tokens: 256,
    temperature: SUPERVISOR_TEMPERATURE,
    system: CLASSIFIER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: message }],
    output_config: {
      format: {
        type: "json_schema",
        schema: INTENT_CLASSIFICATION_SCHEMA,
      },
    },
  });

  const rawJson = textFromMessageContent(response.content, "");
  if (rawJson.length === 0) {
    throw new Error("Supervisor classifier returned an empty response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("Supervisor classifier returned non-JSON output");
  }

  const intent =
    typeof parsed === "object" &&
    parsed !== null &&
    "intent" in parsed &&
    typeof (parsed as { intent: unknown }).intent === "string"
      ? (parsed as { intent: string }).intent
      : null;

  if (intent === null || !isChatIntent(intent)) {
    throw new Error("Supervisor classifier returned an invalid intent");
  }
  return intent;
}

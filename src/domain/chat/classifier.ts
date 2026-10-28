import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import type Anthropic from "@anthropic-ai/sdk";
import type { QuorumConfig } from "../../config/types.js";
import { getAnthropicClient, getSupervisorModel } from "../llm/factory.js";
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

const intentOutputFormat = jsonSchemaOutputFormat(INTENT_CLASSIFICATION_SCHEMA);

export type ClassifyIntentFn = (message: string) => Promise<ChatIntent>;

export interface ClassifierDeps {
  config: QuorumConfig;
  client?: Anthropic;
}

export async function classifyIntent(
  message: string,
  deps: ClassifierDeps,
): Promise<ChatIntent> {
  const client = deps.client ?? getAnthropicClient(deps.config);
  const parsed = await client.messages.parse({
    model: getSupervisorModel(deps.config),
    max_tokens: 256,
    temperature: 0,
    system: CLASSIFIER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: message }],
    output_config: {
      format: intentOutputFormat,
    },
  });

  const intent = parsed.parsed_output?.intent;
  if (typeof intent !== "string" || !isChatIntent(intent)) {
    throw new Error("Supervisor classifier returned an invalid intent");
  }
  return intent;
}

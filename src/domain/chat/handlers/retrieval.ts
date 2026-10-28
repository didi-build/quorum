import type Anthropic from "@anthropic-ai/sdk";
import type { QuorumConfig } from "../../../config/types.js";
import {
  getAnthropicClient,
  getRetrievalAnswerModel,
  RETRIEVAL_ANSWER_TEMPERATURE,
} from "../../llm/factory.js";
import { textFromMessageContent } from "../../llm/message-content.js";
import { retrieve, type RetrievalSearchDeps } from "../../retrieval/service.js";
import type { ActorContext } from "../../schemas/actor.js";
import type { Citation } from "../../schemas/citation.js";
import type { RoutedChatResponse } from "../../schemas/chat.js";
import type { RetrievedChunk } from "../../schemas/retrieval.js";

/** Verbatim v1 `RETRIEVAL_SYSTEM_PROMPT` (`handlers/retrieval.py`). */
export const RETRIEVAL_SYSTEM_PROMPT = `You answer questions using only the provided knowledge-layer context.
Be concise and factual. If the context is insufficient, say so clearly.
Do not invent facts that are not supported by the context.`;

const NO_KNOWLEDGE_ANSWER =
  "I could not find indexed knowledge that answers that question yet. Try connecting a source or rephrasing the query.";

const RETRIEVAL_ANSWER_EMPTY_FALLBACK =
  "I could not produce an answer from the model response. Try rephrasing the question.";

function buildContext(chunks: RetrievedChunk[]): string {
  const sections: string[] = [];
  for (const [index, chunk] of chunks.entries()) {
    const heading =
      chunk.heading_hierarchy.length > 0
        ? chunk.heading_hierarchy.join(" > ")
        : "Untitled";
    sections.push(
      `[${index + 1}] document_id=${chunk.document_id} chunk_index=${chunk.chunk_index}\n` +
        `heading: ${heading}\n` +
        `${chunk.content}`,
    );
  }
  return sections.join("\n\n");
}

function buildCitations(chunks: RetrievedChunk[]): Citation[] {
  return chunks.map((chunk) => {
    const excerpt =
      chunk.content.length > 240 ? `${chunk.content.slice(0, 240)}...` : chunk.content;
    return {
      document_id: chunk.document_id,
      chunk_index: chunk.chunk_index,
      knowledge_source_id: chunk.knowledge_source_id,
      excerpt,
    };
  });
}

export interface SimpleRetrievalParams {
  sessionId: string;
  message: string;
  actor: ActorContext;
  db: D1Database;
  vectorize: VectorizeIndex;
  config: QuorumConfig;
  effectiveProjectId: string | null;
  client?: Anthropic;
  searchDeps?: RetrievalSearchDeps;
}

export async function handleSimpleRetrieval(
  params: SimpleRetrievalParams,
): Promise<RoutedChatResponse> {
  const retrieval = await retrieve(
    {
      db: params.db,
      vectorize: params.vectorize,
      config: params.config,
      query: params.message,
      actor: params.actor,
      effectiveProjectId: params.effectiveProjectId,
    },
    params.searchDeps,
  );

  if (retrieval.chunks.length === 0) {
    return {
      session_id: params.sessionId,
      content: NO_KNOWLEDGE_ANSWER,
      classified_intent: "simple_retrieval",
      response_kind: "direct_answer",
      citations: [],
      council_decision: null,
    };
  }

  const context = buildContext(retrieval.chunks);
  const client = params.client ?? getAnthropicClient(params.config);
  const answer = await client.messages.create({
    model: getRetrievalAnswerModel(params.config),
    max_tokens: 2048,
    temperature: RETRIEVAL_ANSWER_TEMPERATURE,
    system: RETRIEVAL_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Question:\n${params.message}\n\nKnowledge context:\n${context}\n\nAnswer:`,
      },
    ],
  });

  const content = textFromMessageContent(
    answer.content,
    RETRIEVAL_ANSWER_EMPTY_FALLBACK,
  );

  return {
    session_id: params.sessionId,
    content,
    classified_intent: "simple_retrieval",
    response_kind: "direct_answer",
    citations: buildCitations(retrieval.chunks),
    council_decision: null,
  };
}

export { NO_KNOWLEDGE_ANSWER, buildCitations, buildContext };

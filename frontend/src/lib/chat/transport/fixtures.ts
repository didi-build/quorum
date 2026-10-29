import type { ChatHistoryResponse, ChatResponse, Citation } from "../../../types/chat";

export const FIXTURE_SESSION_ID = "00000000-0000-4000-8000-000000000099";

export const FIXTURE_CITATION: Citation = {
  document_id: "didi-build/launchpad/docs/architecture/overview.md",
  chunk_index: 55,
  knowledge_source_id: "ks-launchpad",
  excerpt: "Workers serve the API and the PWA from one origin.",
};

export const FIXTURE_DIRECT_RESPONSE: ChatResponse = {
  id: "00000000-0000-4000-8000-000000000101",
  session_id: FIXTURE_SESSION_ID,
  content:
    "Quorum runs on Cloudflare Workers with D1 for relational data and Vectorize for embeddings.",
  classified_intent: "simple_retrieval",
  response_kind: "direct_answer",
  citations: [FIXTURE_CITATION],
  council_decision: null,
};

export const FIXTURE_STUB_RESPONSE: ChatResponse = {
  id: "00000000-0000-4000-8000-000000000102",
  session_id: FIXTURE_SESSION_ID,
  content: "Linear read request identified, not yet implemented.",
  classified_intent: "linear_read",
  response_kind: "stub_not_implemented",
  citations: [],
  council_decision: null,
};

export const FIXTURE_EMPTY_HISTORY: ChatHistoryResponse = {
  session_id: FIXTURE_SESSION_ID,
  messages: [],
  next_cursor: null,
};

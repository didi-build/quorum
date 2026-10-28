import type { Citation } from "./citation.js";
import type { CouncilDecision } from "./council.js";
import type { WriteBackProposalOut } from "./writeback.js";

export const CHAT_INTENTS = [
  "greeting",
  "simple_retrieval",
  "strategic_session",
  "linear_read",
  "linear_write",
] as const;

export type ChatIntent = (typeof CHAT_INTENTS)[number];

export const RESPONSE_KINDS = [
  "direct_answer",
  "council_result",
  "stub_not_implemented",
] as const;

export type ResponseKind = (typeof RESPONSE_KINDS)[number];

export function isChatIntent(value: string): value is ChatIntent {
  return (CHAT_INTENTS as readonly string[]).includes(value);
}

export function isResponseKind(value: string): value is ResponseKind {
  return (RESPONSE_KINDS as readonly string[]).includes(value);
}

export interface ChatMessageIn {
  session_id: string;
  content: string;
}

/** Routed assistant payload before persistence and transport ids (v1 `RoutedChatResponse`). */
export interface RoutedChatResponse {
  session_id: string;
  content: string;
  classified_intent: ChatIntent;
  response_kind: ResponseKind;
  citations: Citation[];
  council_decision: CouncilDecision | null;
}

export interface ChatResponse extends RoutedChatResponse {
  id: string;
}

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessageOut {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  classified_intent: ChatIntent | null;
  response_kind: ResponseKind | null;
  citations: Citation[];
  council_decision: CouncilDecision | null;
  write_back_proposal: WriteBackProposalOut | null;
  created_at: string;
}

export interface ChatHistoryResponse {
  session_id: string;
  messages: ChatMessageOut[];
}

export interface ChatStatusUpdate {
  session_id: string;
  scope: "supervisor" | "persona";
  persona: string | null;
  status: string;
}

import type { KnowledgeSourceListResponse } from "../../types/sources";
import { humanizeApiError } from "../authErrors";
import { getChatTransport, isChatMockMode, MockChatTransport } from "./transport";

async function parseSources(response: Response): Promise<KnowledgeSourceListResponse> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(humanizeApiError(response.status, detail));
  }
  return (await response.json()) as KnowledgeSourceListResponse;
}

/** Ready source count for the chat status line (isolated from Connections UI). */
export async function fetchReadySourceCount(): Promise<number> {
  if (isChatMockMode()) {
    const transport = getChatTransport();
    if (transport instanceof MockChatTransport) {
      return transport.readySourceCount;
    }
    return 0;
  }

  const response = await fetch("/sources", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const payload = await parseSources(response);
  return payload.sources.filter((source) => source.status === "ready").length;
}

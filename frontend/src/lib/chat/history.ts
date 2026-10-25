import type { ChatMessageOut, ChatResponse, ThreadItem } from "../../types/chat";

export function threadItemsFromHistoryMessage(message: ChatMessageOut): ThreadItem[] {
  if (message.role === "user") {
    return [
      {
        id: message.id,
        kind: "user",
        content: message.content,
      },
    ];
  }

  if (message.response_kind === "council_result" && message.council_decision) {
    return [
      {
        id: message.id,
        kind: "council",
        phase: "complete",
        content: message.content,
        councilDecision: message.council_decision,
        writeBackProposal: message.write_back_proposal,
      },
    ];
  }

  if (message.response_kind === "stub_not_implemented") {
    return [
      {
        id: message.id,
        kind: "stub",
      },
    ];
  }

  return [
    {
      id: message.id,
      kind: "direct",
      content: message.content,
      citations: message.citations,
    },
  ];
}

export function historyToThreadItems(messages: ChatMessageOut[]): ThreadItem[] {
  return messages.flatMap((message) => threadItemsFromHistoryMessage(message));
}

export function threadItemFromResponse(response: ChatResponse): ThreadItem {
  if (response.response_kind === "council_result" && response.council_decision) {
    return {
      id: response.id,
      kind: "council",
      phase: "complete",
      content: response.content,
      councilDecision: response.council_decision,
      writeBackProposal: null,
    };
  }

  if (response.response_kind === "stub_not_implemented") {
    return {
      id: response.id,
      kind: "stub",
    };
  }

  return {
    id: response.id,
    kind: "direct",
    content: response.content,
    citations: response.citations,
  };
}

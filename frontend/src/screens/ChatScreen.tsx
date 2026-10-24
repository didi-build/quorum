import { useCallback, useEffect, useState } from "react";
import type { ThreadItem } from "../types/chat";
import { isChatResponse } from "../types/chat";
import { ChatDock } from "../components/chat/ChatDock";
import { ChatThread } from "../components/chat/ChatThread";
import { historyToThreadItems, threadItemFromResponse } from "../lib/chat/history";
import { fetchReadySourceCount } from "../lib/chat/sourceCount";
import { getOrCreateSessionId } from "../lib/chat/session";
import { getChatTransport } from "../lib/chat/transport";
import { humanizeApiError } from "../lib/authErrors";
import { useChatWebSocket } from "../hooks/useChatWebSocket";

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 639px)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const listener = () => {
      setMobile(media.matches);
    };
    media.addEventListener("change", listener);
    return () => {
      media.removeEventListener("change", listener);
    };
  }, []);

  return mobile;
}

export function ChatScreen() {
  const [sessionId] = useState(getOrCreateSessionId);
  const [items, setItems] = useState<ThreadItem[]>([]);
  const [readySourceCount, setReadySourceCount] = useState<number | null>(null);
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const mobile = useIsMobile();

  const refreshSourceCount = useCallback(async () => {
    try {
      const count = await fetchReadySourceCount();
      setReadySourceCount(count);
    } catch {
      setReadySourceCount(0);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const transport = getChatTransport();
      const history = await transport.fetchHistory(sessionId);
      setItems(historyToThreadItems(history.messages));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : humanizeApiError(500, "", {});
      setSendError(message);
    } finally {
      setHistoryLoading(false);
      setHistoryLoaded(true);
    }
  }, [sessionId]);

  useEffect(() => {
    void Promise.all([loadHistory(), refreshSourceCount()]);
  }, [loadHistory, refreshSourceCount]);

  const { connectionState, sendMessage } = useChatWebSocket({
    enabled: true,
    onStatus: () => {
      // Council status frames are handled in DIDI-788.
    },
  });

  const showComposer = readySourceCount !== null && readySourceCount > 0;

  const handleSend = async (content: string) => {
    if (awaitingResponse || !showComposer) {
      return;
    }

    const userItem: ThreadItem = {
      id: crypto.randomUUID(),
      kind: "user",
      content,
    };

    setItems((current) => [...current, userItem]);
    setAwaitingResponse(true);
    setSendError(null);

    try {
      const response = await sendMessage({ session_id: sessionId, content });
      if (isChatResponse(response)) {
        setItems((current) => [...current, threadItemFromResponse(response)]);
      }
    } catch (error) {
      setSendError(
        error instanceof Error
          ? error.message
          : "Something went wrong on our side. Try again in a moment.",
      );
    } finally {
      setAwaitingResponse(false);
      void refreshSourceCount();
    }
  };

  return (
    <div className="quorum-chat-shell">
      <ChatThread
        items={items}
        historyLoaded={historyLoaded}
        historyLoading={historyLoading}
        readySourceCount={readySourceCount}
      />
      <ChatDock
        connectionState={connectionState}
        readySourceCount={readySourceCount}
        awaitingResponse={awaitingResponse}
        sendError={sendError}
        onDismissSendError={() => {
          setSendError(null);
        }}
        onSend={(content) => {
          void handleSend(content);
        }}
        mobile={mobile}
        showComposer={showComposer}
      />
    </div>
  );
}

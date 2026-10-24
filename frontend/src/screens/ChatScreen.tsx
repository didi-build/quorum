import { useCallback, useEffect, useState } from "react";
import type { ThreadItem } from "../types/chat";
import { isChatResponse } from "../types/chat";
import { ChatDock } from "../components/chat/ChatDock";
import { ChatThread } from "../components/chat/ChatThread";
import { historyToThreadItems, threadItemFromResponse } from "../lib/chat/history";
import { fetchReadySourceCount } from "../lib/chat/sourceCount";
import { getOrCreateSessionId } from "../lib/chat/session";
import { resolveChatTransport } from "../lib/chat/transport";
import { ChatConnectionLostError, toChatUserMessage } from "../lib/chat/errors";
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
  const [transportReady, setTransportReady] = useState(false);
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);
  const mobile = useIsMobile();

  useEffect(() => {
    void resolveChatTransport().then(() => {
      setTransportReady(true);
    });
  }, []);

  const refreshSourceCount = useCallback(async (silent = false) => {
    try {
      const count = await fetchReadySourceCount();
      setReadySourceCount(count);
    } catch (error) {
      if (!silent) {
        setSendError(toChatUserMessage(error));
      }
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const transport = await resolveChatTransport();
      const history = await transport.fetchHistory(sessionId);
      setItems(historyToThreadItems(history.messages));
    } catch (error) {
      setSendError(toChatUserMessage(error));
    } finally {
      setHistoryLoading(false);
      setHistoryLoaded(true);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!transportReady) {
      return;
    }
    void Promise.all([loadHistory(), refreshSourceCount()]);
  }, [transportReady, loadHistory, refreshSourceCount]);

  const { connectionState, sendMessage } = useChatWebSocket({
    enabled: transportReady,
    sessionId,
    onStatus: () => {
      // Council status frames are handled in DIDI-788.
    },
  });

  const handleSend = async (content: string) => {
    if (awaitingResponse) {
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
      if (!(error instanceof ChatConnectionLostError)) {
        setSendError(toChatUserMessage(error));
      }
    } finally {
      setAwaitingResponse(false);
      setComposerFocusSignal((value) => value + 1);
      void refreshSourceCount(true);
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
        composerFocusSignal={composerFocusSignal}
      />
    </div>
  );
}

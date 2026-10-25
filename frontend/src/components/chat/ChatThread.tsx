import { useEffect, useRef } from "react";
import type { ThreadItem } from "../../types/chat";
import { ChatMessage } from "./ChatMessage";
import { DomMark } from "../DomMark";
import { GitHubMark, LinearMark } from "./ProviderMarks";
import { appPath } from "../../lib/routing";

interface ChatThreadProps {
  items: ThreadItem[];
  historyLoaded: boolean;
  historyLoading: boolean;
  readySourceCount: number | null;
}

export function ChatNoSourcesEmpty() {
  return (
    <div className="quorum-chat-empty">
      <DomMark size={40} />
      <h2>Connect a source to start</h2>
      <p className="quorum-chat-muted">
        Quorum answers from your code and issues, so it needs something to read first.
        Most repos are ready in a few minutes.
      </p>
      <div className="quorum-chat-empty-cards">
        <a className="quorum-chat-empty-card" href={appPath("connections")}>
          <GitHubMark size={18} />
          <span>
            <b>GitHub</b>
            <span className="quorum-chat-muted quorum-chat-small">
              Repositories you choose
            </span>
          </span>
          <span className="quorum-btn quorum-btn-secondary quorum-btn-sm">Connect</span>
        </a>
        <a className="quorum-chat-empty-card" href={appPath("connections")}>
          <LinearMark size={16} />
          <span>
            <b>Linear</b>
            <span className="quorum-chat-muted quorum-chat-small">
              Your team&apos;s issues
            </span>
          </span>
          <span className="quorum-btn quorum-btn-secondary quorum-btn-sm">Connect</span>
        </a>
      </div>
      <a className="quorum-chat-link quorum-chat-small" href={appPath("connections")}>
        Go to Connections
      </a>
    </div>
  );
}

function ReadyEmpty() {
  return (
    <div className="quorum-chat-empty">
      <DomMark size={40} />
      <h2>Ask about your code, issues or a decision</h2>
      <p className="quorum-chat-muted">
        Quick questions get a direct answer with sources. Proposals and hard calls go to
        the council: three seats review it, then the chair recommends.
      </p>
    </div>
  );
}

function HistoryLoading() {
  return (
    <>
      <div className="quorum-chat-loading-line" role="status">
        <span className="quorum-spin" aria-hidden="true" />
        Loading chat history
      </div>
      <div className="quorum-chat-skel" aria-hidden="true">
        <i className="quorum-chat-skel-r" />
        <i />
        <i />
        <i className="quorum-chat-skel-tall" />
      </div>
    </>
  );
}

export function ChatThread({
  items,
  historyLoaded,
  historyLoading,
  readySourceCount,
}: ChatThreadProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollToEnd = () => {
      const el = scrollerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    };
    scrollToEnd();
    const timer = window.setTimeout(scrollToEnd, 120);
    return () => {
      window.clearTimeout(timer);
    };
  }, [items, historyLoaded, historyLoading, readySourceCount]);

  const showNoSources =
    historyLoaded && readySourceCount === 0 && items.length === 0 && !historyLoading;
  const showReadyEmpty =
    historyLoaded &&
    readySourceCount !== null &&
    readySourceCount > 0 &&
    items.length === 0;

  return (
    <div className="quorum-chat-scroller" ref={scrollerRef}>
      <section className="quorum-chat-thread" aria-live="polite">
        {historyLoading ? <HistoryLoading /> : null}
        {showNoSources ? <ChatNoSourcesEmpty /> : null}
        {showReadyEmpty ? <ReadyEmpty /> : null}
        {items.map((item) => (
          <ChatMessage key={item.id} item={item} />
        ))}
      </section>
    </div>
  );
}

import type { ChatConnectionState } from "../../hooks/useChatWebSocket";
import { appPath } from "../../lib/routing";
import { ChatComposer } from "./ChatComposer";

interface ChatDockProps {
  connectionState: ChatConnectionState;
  readySourceCount: number | null;
  awaitingResponse: boolean;
  sendError: string | null;
  onDismissSendError: () => void;
  onSend: (content: string) => void;
  mobile: boolean;
  composerFocusSignal: number;
}

function RefreshIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M17.65 6.35A7.96 7.96 0 0 0 12 4V1L7 6l5 5V7.5c2.48 0 4.5 2.02 4.5 4.5 0 1.2-.47 2.29-1.24 3.1l1.46 1.46A7 7 0 0 0 19 12c0-2.1-.9-4-2.35-5.35ZM6.35 17.65A7.96 7.96 0 0 0 12 20v3l5-5-5-5v2.5c-2.48 0-4.5-2.02-4.5-4.5 0-1.2.47-2.29 1.24-3.1L6.28 9.44A7 7 0 0 0 5 12c0 2.1.9 4 2.35 5.65Z" />
    </svg>
  );
}

export function ChatDock({
  connectionState,
  readySourceCount,
  awaitingResponse,
  sendError,
  onDismissSendError,
  onSend,
  mobile,
  composerFocusSignal,
}: ChatDockProps) {
  const composerDisabled = awaitingResponse || connectionState !== "connected";

  const strip = () => {
    if (sendError) {
      return (
        <div className="quorum-chat-strip quorum-chat-strip-err" role="alert">
          <span>{sendError}</span>
          <button
            type="button"
            className="quorum-icon-btn"
            aria-label="Dismiss"
            onClick={onDismissSendError}
          >
            ×
          </button>
        </div>
      );
    }

    if (connectionState === "connecting") {
      return (
        <div className="quorum-chat-strip">
          <span className="quorum-spin" aria-hidden="true" />
          <span>Connecting live updates</span>
        </div>
      );
    }

    if (connectionState === "closed" || connectionState === "failed") {
      return (
        <div className="quorum-chat-strip quorum-chat-strip-err" role="alert">
          <span>Live updates stopped. Refresh the page to reconnect.</span>
          <button
            type="button"
            className="quorum-btn quorum-btn-secondary quorum-btn-sm"
            onClick={() => {
              window.location.reload();
            }}
          >
            <RefreshIcon />
            Refresh
          </button>
        </div>
      );
    }

    if (readySourceCount === 0) {
      return (
        <a className="quorum-chat-srcline" href={appPath("connections")}>
          <span className="quorum-dot quorum-dot-idle" />
          No sources yet. Add one in Connections
        </a>
      );
    }

    if (readySourceCount !== null && readySourceCount > 0) {
      return (
        <a className="quorum-chat-srcline" href={appPath("connections")}>
          <span className="quorum-dot quorum-dot-ready" />
          Answering from {readySourceCount} sources
        </a>
      );
    }

    return null;
  };

  return (
    <div className="quorum-chat-dock">
      <div className="quorum-chat-dock-in">
        {strip()}
        <ChatComposer
          disabled={composerDisabled}
          busy={awaitingResponse}
          mobile={mobile}
          focusSignal={composerFocusSignal}
          onSend={onSend}
        />
      </div>
    </div>
  );
}

import type { Citation, ThreadItem } from "../../types/chat";
import { CodeCitation } from "../CodeCitation";
import { DomMark } from "../DomMark";
import { LinearMark } from "./ProviderMarks";
import { appPath } from "../../lib/routing";

function QuorumLabel({ route }: { route: string }) {
  return (
    <div className="quorum-chat-who">
      <DomMark size={18} />
      <b>Quorum</b>
      {route ? <span className="quorum-chat-route">{route}</span> : null}
    </div>
  );
}

function UserMessage({ content }: { content: string }) {
  return <div className="quorum-chat-you">{content}</div>;
}

function DirectAnswerMessage({
  content,
  citations,
}: {
  content: string;
  citations: Citation[];
}) {
  const showConnections =
    content.includes("could not find indexed knowledge") ||
    content.includes("I could not find indexed knowledge");

  return (
    <article className="quorum-chat-answer">
      <QuorumLabel route="Direct answer" />
      <div className="quorum-chat-answer-body">
        <p>{content}</p>
        {citations.length > 0 ? (
          <div className="quorum-chat-answer-cites">
            <span className="quorum-overline quorum-overline-sm">Sources</span>
            {citations.map((citation, index) => (
              <CodeCitation
                key={`${citation.document_id}-${citation.chunk_index}`}
                citation={citation}
                defaultOpen={index === 0}
              />
            ))}
          </div>
        ) : null}
        {showConnections ? (
          <div className="quorum-chat-answer-foot">
            <a
              className="quorum-btn quorum-btn-secondary quorum-btn-sm"
              href={appPath("connections")}
            >
              Open Connections
            </a>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function StubMessage() {
  return (
    <article className="quorum-chat-stub-wrap">
      <QuorumLabel route="Linear request" />
      <div className="quorum-chat-note">
        <LinearMark size={16} />
        <div>
          <b>Linear actions from chat aren&apos;t available yet</b>
          <p className="quorum-chat-muted">
            Quorum understood this as a Linear request. For now, ask about your code,
            issues or a decision.
          </p>
        </div>
      </div>
    </article>
  );
}

function CouncilPlaceholder({ content }: { content: string }) {
  return (
    <article className="quorum-chat-answer">
      <QuorumLabel route="Council review" />
      <div className="quorum-chat-answer-body">
        <p className="quorum-chat-muted">
          Council results will appear here in a follow-up release. The recommendation
          summary is kept below for now.
        </p>
        {content ? <p>{content}</p> : null}
      </div>
    </article>
  );
}

export function ChatMessage({ item }: { item: ThreadItem }) {
  if (item.kind === "user") {
    return <UserMessage content={item.content} />;
  }
  if (item.kind === "direct") {
    return <DirectAnswerMessage content={item.content} citations={item.citations} />;
  }
  if (item.kind === "stub") {
    return <StubMessage />;
  }
  return <CouncilPlaceholder content={item.content} />;
}

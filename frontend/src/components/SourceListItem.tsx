import type { KnowledgeSource } from "../types/sources";
import { StatusChip } from "./StatusChip";

interface SourceListItemProps {
  source: KnowledgeSource;
  busy: boolean;
  onRefresh: (sourceId: string) => void;
  onDelete: (sourceId: string) => void;
}

function SourceIcon({ sourceType }: { sourceType: KnowledgeSource["source_type"] }) {
  if (sourceType === "linear") {
    return (
      <svg
        className="dom-source-list-item__icon"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          d="M2 12.5V3.5L8 1.5l6 2v9l-6 2-6-2zm6-1.1 4.5-1.5V4.6L8 6.1 3.5 4.6v5.3L8 11.4z"
        />
      </svg>
    );
  }

  return (
    <svg className="dom-source-list-item__icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 2.5A1.5 1.5 0 0 0 2.5 4v8A1.5 1.5 0 0 0 4 13.5h8a1.5 1.5 0 0 0 1.5-1.5V4A1.5 1.5 0 0 0 12 2.5H4zm0 1h8a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z"
      />
    </svg>
  );
}

export function SourceListItem({
  source,
  busy,
  onRefresh,
  onDelete,
}: SourceListItemProps) {
  return (
    <article className="dom-source-list-item">
      <SourceIcon sourceType={source.source_type} />
      <div className="dom-source-list-item__body">
        <div className="dom-source-list-item__title">{source.name}</div>
        <div className="dom-source-list-item__meta">{source.external_ref}</div>
        {source.status === "error" && source.status_message ? (
          <p className="caption">{source.status_message}</p>
        ) : null}
        <div className="dom-source-list-item__actions">
          <button
            type="button"
            className="dom-btn dom-btn--ghost dom-btn--sm"
            disabled={busy}
            onClick={() => {
              onRefresh(source.id);
            }}
          >
            Refresh
          </button>
          <button
            type="button"
            className="dom-btn dom-btn--danger dom-btn--sm"
            disabled={busy}
            onClick={() => {
              onDelete(source.id);
            }}
          >
            Delete
          </button>
        </div>
      </div>
      <StatusChip status={source.status} />
    </article>
  );
}

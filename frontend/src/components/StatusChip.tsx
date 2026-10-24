import type { SourceStatus } from "../types/sources";

interface StatusChipProps {
  status: SourceStatus;
}

export function StatusChip({ status }: StatusChipProps) {
  return (
    <span className={`dom-status-chip dom-status--${status}`}>
      <span className="dom-status-chip__dot" aria-hidden="true" />
      <span className="mono-label">{status}</span>
      {status === "indexing" ? (
        <span className="dom-status-chip__progress" aria-hidden="true" />
      ) : null}
    </span>
  );
}

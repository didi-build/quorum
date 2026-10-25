import { sourceStatusLabel } from "../lib/statusLabels";
import type { SourceStatus } from "../types/sources";

export interface StatusChipProps {
  status: SourceStatus;
  refreshing?: boolean;
}

export function StatusChip({ status, refreshing = false }: StatusChipProps) {
  if (refreshing) {
    return (
      <span className="quorum-source-status">
        <span className="quorum-spin" aria-hidden="true" />
        Refreshing
      </span>
    );
  }

  const dotClass =
    status === "ready"
      ? "quorum-dot quorum-dot--ready"
      : status === "error"
        ? "quorum-dot quorum-dot--error"
        : status === "indexing"
          ? "quorum-dot quorum-dot--indexing"
          : "quorum-dot quorum-dot--pending";

  return (
    <span
      className={`quorum-source-status${status === "error" ? " quorum-source-status--error" : ""}`}
    >
      <span className={dotClass} aria-hidden="true" />
      {sourceStatusLabel(status)}
    </span>
  );
}

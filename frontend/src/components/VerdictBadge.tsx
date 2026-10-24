import { verdictLabel } from "../lib/statusLabels";
import type { Verdict } from "../types/chat";

interface VerdictBadgeProps {
  verdict: Verdict | string;
}

export function VerdictBadge({ verdict }: VerdictBadgeProps) {
  const normalized = verdict.replaceAll("-", "_");
  const className =
    normalized === "approve"
      ? "dom-verdict--approve"
      : normalized === "request_changes"
        ? "dom-verdict--request-changes"
        : "dom-verdict--comment";

  return <span className={`dom-verdict ${className}`}>{verdictLabel(verdict)}</span>;
}

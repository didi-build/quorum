import type { SourceStatus } from "../types/sources";

const SUPERVISOR_STATUS_LABELS: Record<string, string> = {
  alerting_council: "Alerting council",
  waiting_on_council: "Waiting on council",
  council_deliberating: "Council deliberating",
};

const PERSONA_STATUS_LABELS: Record<string, string> = {
  pondering: "Pondering",
  researching: "Researching",
  giving_recommendation: "Giving recommendation",
  recommendation_ready: "Recommendation ready",
};

export function supervisorStatusLabel(status: string): string {
  return SUPERVISOR_STATUS_LABELS[status] ?? humanizeStatus(status);
}

export function personaStatusLabel(status: string | null): string {
  if (!status) {
    return "Waiting";
  }
  return PERSONA_STATUS_LABELS[status] ?? humanizeStatus(status);
}

export function sourceStatusLabel(status: SourceStatus): string {
  if (status === "ready") {
    return "Ready";
  }
  if (status === "indexing") {
    return "Indexing. Usually a few minutes.";
  }
  if (status === "pending") {
    return "Waiting to start";
  }
  return "Can't read this source";
}

export function verdictLabel(verdict: string): string {
  const normalized = verdict.replaceAll("-", "_");
  if (normalized === "approve") {
    return "Approve";
  }
  if (normalized === "request_changes") {
    return "Request changes";
  }
  if (normalized === "comment") {
    return "Comment";
  }
  return humanizeStatus(normalized);
}

function humanizeStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

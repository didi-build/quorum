export type ApiErrorProvider = "github" | "linear" | string;

export interface HumanizeApiErrorOptions {
  provider?: ApiErrorProvider;
  sourceRef?: string | null;
}

function parseDetail(rawDetail: string): string {
  const trimmed = rawDetail.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = JSON.parse(trimmed) as { detail?: unknown; message?: unknown };
    if (typeof parsed.detail === "string") {
      return parsed.detail;
    }
    if (typeof parsed.message === "string") {
      return parsed.message;
    }
  } catch {
    // not JSON
  }
  return trimmed;
}

/**
 * Maps HTTP API failures to spec copy. Never returns raw JSON or status-only text.
 */
export function humanizeApiError(
  status: number,
  rawDetail: string,
  options: HumanizeApiErrorOptions = {},
): string {
  parseDetail(rawDetail);

  if (status === 401) {
    return "Your session has ended. Sign in again to keep going.";
  }

  if (status === 403) {
    const ref = options.sourceRef?.trim();
    if (ref) {
      return `Quorum can't read ${ref} anymore. Give it access in GitHub, then refresh.`;
    }
    return "Quorum lost access to this source.";
  }

  if (status === 429) {
    if (options.provider === "linear") {
      return "Linear asked Quorum to slow down. Wait a minute, then try again.";
    }
    return "GitHub asked Quorum to slow down. Wait a minute, then try again.";
  }

  if (status >= 500) {
    return "Something went wrong on our side. Try again in a moment.";
  }

  return "Something went wrong on our side. Try again in a moment.";
}

export function humanizeApiErrorNextStep(status: number): string | null {
  if (status === 401) {
    return "Sign in again";
  }
  if (status === 403) {
    return "Check GitHub access";
  }
  if (status === 429 || status >= 500) {
    return "Try again";
  }
  return "Try again";
}

export type ApiErrorProvider = "github" | "linear" | string;

export interface HumanizeApiErrorOptions {
  provider?: ApiErrorProvider;
  sourceRef?: string | null;
}

/**
 * Maps HTTP API failures to spec copy. Never returns raw JSON or status-only text.
 */
export function humanizeApiError(
  status: number,
  _rawDetail: string,
  options: HumanizeApiErrorOptions = {},
): string {
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

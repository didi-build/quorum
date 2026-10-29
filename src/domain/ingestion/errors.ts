export const RECONNECT_WORKSPACE_MESSAGE =
  "Reconnect the workspace to resume indexing.";
export const GENERIC_INDEXING_FAILURE_MESSAGE =
  "Indexing failed. Try refreshing the source.";

export class IndexingHttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number) {
    super(`HTTP ${statusCode}`);
    this.name = "IndexingHttpError";
    this.statusCode = statusCode;
  }
}

/** Configuration or adapter errors that should not be retried by the queue. */
export class IndexingPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndexingPermanentError";
  }
}

export function indexingErrorMessage(exc: unknown): string {
  if (
    exc instanceof IndexingHttpError &&
    (exc.statusCode === 401 || exc.statusCode === 403)
  ) {
    return RECONNECT_WORKSPACE_MESSAGE;
  }
  return GENERIC_INDEXING_FAILURE_MESSAGE;
}

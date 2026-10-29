import { VoyageEmbedError } from "./embedder.js";
import { IndexingHttpError, IndexingPermanentError } from "./errors.js";

export function httpStatusFromIndexingError(error: unknown): number | undefined {
  if (error instanceof IndexingHttpError || error instanceof VoyageEmbedError) {
    return error.statusCode;
  }
  return undefined;
}

export function isIndexingTemporaryError(error: unknown): boolean {
  if (error instanceof IndexingPermanentError) {
    return false;
  }
  const status = httpStatusFromIndexingError(error);
  if (status !== undefined) {
    return status === 429 || status >= 500;
  }
  if (error instanceof Error) {
    return true;
  }
  return false;
}

export function indexingErrorLogFields(error: unknown): {
  error: string;
  status_code?: number;
} {
  const errorName = error instanceof Error ? error.name : "unknown_error";
  const status = httpStatusFromIndexingError(error);
  if (status !== undefined) {
    return { error: errorName, status_code: status };
  }
  return { error: errorName };
}

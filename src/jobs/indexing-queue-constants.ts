/** Must match `queues.consumers[].max_retries` in wrangler.jsonc. */
export const INDEXING_QUEUE_MAX_RETRIES = 3;

export function isFinalIndexingQueueAttempt(attempts: number): boolean {
  return attempts > INDEXING_QUEUE_MAX_RETRIES;
}

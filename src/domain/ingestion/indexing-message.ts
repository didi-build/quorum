export interface IndexingQueueMessage {
  source_id: string;
  /** Identifies the active indexing run for this source (DIDI-933). */
  indexing_run_id?: string;
  /** GitHub file budget consumed across prior invocations for this re-index. */
  github_files_processed?: number;
}

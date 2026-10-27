export interface IndexingQueueMessage {
  source_id: string;
  /** GitHub file budget consumed across prior invocations for this re-index. */
  github_files_processed?: number;
}

export interface FetchedDocument {
  document_id: string;
  content: string;
}

export interface GithubFetchResult {
  documents: FetchedDocument[];
  has_more: boolean;
  files_processed: number;
}

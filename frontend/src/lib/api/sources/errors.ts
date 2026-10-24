export class SourcesApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly provider?: string;

  constructor(status: number, detail = "", provider?: string) {
    super(detail || `Request failed with status ${status}`);
    this.name = "SourcesApiError";
    this.status = status;
    this.detail = detail;
    this.provider = provider;
  }
}

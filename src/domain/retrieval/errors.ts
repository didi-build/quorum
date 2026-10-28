export class RetrievalUpstreamError extends Error {
  readonly statusCode: 502 | 503;

  constructor(statusCode: 502 | 503, message = "Retrieval upstream unavailable") {
    super(message);
    this.name = "RetrievalUpstreamError";
    this.statusCode = statusCode;
  }
}

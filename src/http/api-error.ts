import { ConfigError } from "../config/errors.js";

export interface ApiErrorBody {
  detail: string;
}

export function jsonDetail(detail: string, status: number): Response {
  const body: ApiErrorBody = { detail };
  return Response.json(body, { status });
}

export function workerErrorResponse(error: unknown): Response {
  if (error instanceof ConfigError) {
    return jsonDetail(error.message, 500);
  }
  if (error instanceof Error) {
    return jsonDetail(error.message, 500);
  }
  return jsonDetail("Internal Server Error", 500);
}

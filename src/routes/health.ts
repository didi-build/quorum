import { ConfigError } from "../config/errors.js";
import { loadConfig } from "../config/load-config.js";
import type { Env } from "../env.js";
import { jsonDetail } from "../http/api-error.js";

export function handleHealth(): Response {
  return Response.json({ status: "ok" });
}

export async function handleReady(env: Env): Promise<Response> {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      return jsonDetail(error.message, 503);
    }
    throw error;
  }

  try {
    await env.DB.prepare("SELECT 1").first();
    return Response.json({ status: "ready" });
  } catch {
    return Response.json({ detail: "Database is not reachable" }, { status: 503 });
  }
}

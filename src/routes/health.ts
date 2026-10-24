import { loadConfig } from "../config/load-config.js";
import type { Env } from "../env.js";

export function handleHealth(): Response {
  return Response.json({ status: "ok" });
}

export async function handleReady(env: Env): Promise<Response> {
  loadConfig(env);
  try {
    await env.DB.prepare("SELECT 1").first();
    return Response.json({ status: "ready" });
  } catch {
    return Response.json({ detail: "Database is not reachable" }, { status: 503 });
  }
}

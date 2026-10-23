export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  INDEXING_QUEUE: Queue;
  VECTORIZE: VectorizeIndex;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }
    return env.ASSETS.fetch(request);
  },
};

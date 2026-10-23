# 0004. Quorum stack: TypeScript on Cloudflare Workers

- **Status:** accepted
- **Date:** 2026-10-23
- **Deciders:** CTO (stack rows), Diadem (license and demo host)

## Context

Quorum is a faithful port of v1 domAIn (see [DIDI-713](https://linear.app/didi-build/issue/DIDI-713) parity inventory) onto the Didi Build launchpad stack. [DIDI-764](https://linear.app/didi-build/issue/DIDI-764) proposed per-component targets; the CTO accepted the recommendation on 2026-10-23. This ADR records those outcomes for the `didi-build/quorum` repository.

## Decision

Port v1 product behavior to **TypeScript on Cloudflare Workers** with **D1**, **Queues**, **Vectorize** (1024 dimensions), **Voyage** embeddings, and the **Anthropic TypeScript SDK** (no LangChain or LangGraph). Use one Worker repo layout, MIT license, and demo host **`quorum.didi.build`** (DNS cutover out of scope for repo setup; v1 stays on `domain.didi.build` until retired). **No Durable Objects** in the rebuild (nodrift does not support DO bindings).

### Repo layout

| Path              | Role                                                         |
| ----------------- | ------------------------------------------------------------ |
| `src/`            | API Worker entry and future routes                           |
| `frontend/`       | Vite React 19 PWA, built to static assets on the same Worker |
| `migrations/`     | D1 SQL migrations                                            |
| `design/`         | Product and UI specs                                         |
| `docs/decisions/` | ADRs                                                         |

### Component decisions (v1 inventory numbers)

Each row is **Accepted** unless noted.

| #    | v1 component            | Decision                                                                                                                                        |
| ---- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Config                  | Port: typed config from Worker `env`, `wrangler.jsonc` vars, Wrangler secrets, `.dev.vars.example`                                              |
| 2    | Data model, permissions | Port to **D1** with SQL in `migrations/`; keep `can_access()` as one pure function                                                              |
| 2b   | Vectors                 | Port to **Cloudflare Vectorize**, **1024 dimensions**, metadata `knowledge_source_id`, filter by accessible source ids                          |
| 2c   | Keyword search          | Port to **D1 FTS5** with bm25 ranking                                                                                                           |
| 3    | Auth                    | Port: sessions in D1, HMAC and SHA-256 via WebCrypto                                                                                            |
| 4    | GitHub App              | Port: RS256 app JWT via WebCrypto, `fetch`; PKCS#8 key documented for GitHub PKCS#1 secrets                                                     |
| 5    | Linear OAuth            | Port: hand-rolled OAuth with `fetch`, AES-GCM token storage; users reconnect (no token migration)                                               |
| 6    | Indexing                | Port to **Queues** producer and consumer (one message per source)                                                                               |
| 6b   | Embeddings              | **Keep Voyage** `voyage-context-4` over HTTPS                                                                                                   |
| 7    | Retrieval               | Port: Vectorize plus FTS5; same RRF; coverage check and parallel searches follow documented v1 intent (see gaps below)                          |
| 8, 9 | Chat, council           | Port: **Anthropic TypeScript SDK**, council fan-out as `Promise.all` over three personas then chair; **no LangChain or LangGraph**              |
| 10   | Streaming status        | Port: **Worker WebSocket** (`WebSocketPair`), no Durable Objects; **SSE fallback** with the same frame shapes                                   |
| 11   | Write-back              | Port: `fetch`, same PR-only GitHub rules                                                                                                        |
| 12   | Frontend                | **Keep** React 19, Vite, PWA; serve as Worker static assets (`/app/`)                                                                           |
| 13   | Landing                 | Port: static asset on the same Worker                                                                                                           |
| 14   | Deploy, CI              | Port to launchpad `npm run check`, `nodrift check`, Vitest with `@cloudflare/vitest-pool-workers`; production deploy workflow is a later ticket |

**Explicit overrides:** none.

### Named product-tech choices

| Topic                 | Decision                                                 |
| --------------------- | -------------------------------------------------------- |
| Vector store          | **Vectorize** (not Postgres or Hyperdrive)               |
| Streaming transport   | **WebSocket** primary, **SSE** fallback                  |
| Council orchestration | **Plain TypeScript** parallel fan-out (not LangGraph.js) |
| Embeddings vendor     | **Voyage** (not Workers AI embeddings)                   |

Vectorize index dimension count is **1024**, matching v1 pgvector and `EMBEDDING_DIMENSIONS` in config. Recorded in `docs/privacy/data-map.yml` under `vectorize.embeddings` because nodrift Check 2 does not cover Vectorize bindings.

### v1 doc vs code gaps (rebuild follows documented intent)

| Area           | v1 docs say                                   | v1 code does                          | Quorum build                                                                 |
| -------------- | --------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| Coverage check | LLM coverage check (ADR 0002)                 | Lexical heuristic on query term share | Implement documented LLM or hybrid intent from ADR 0002 when retrieval ships |
| Retrieval I/O  | Parallel vector and keyword search (ADR 0002) | Sequential awaits                     | Parallel queries when retrieval ships                                        |

## Reasons

- **DIDI-764 CTO acceptance (2026-10-23):** the rebuild stays on Cloudflare Workers with D1, FTS5, Vectorize, and Queues instead of carrying Postgres, Python, or container hosting outside the edge stack.
- **Launchpad plus nodrift:** TypeScript and D1 migrations let nodrift Check 1 enforce the privacy data map; Vectorize is recorded manually in the map.
- **Product parity without graph libraries:** v1 council fan-out is fixed (ADR 0005), so plain `Promise.all` matches behavior with less surface area than LangGraph.js.
- **Portfolio and licensing:** MIT and `quorum.didi.build` were chosen for the public repo (Diadem, recorded by CTO).

## Consequences

- nodrift Check 1 will govern D1 tables once migrations land; Vectorize stays a manual `other_items` row.
- Large repo indexing and long council runs must be spike-tested early (DIDI-775, DIDI-781) against Worker CPU and wall-clock limits.
- GitHub App private keys require a one-time PKCS#1 to PKCS#8 conversion for WebCrypto.

## References

- v1 source (read only): https://github.com/DiademShoukralla/domAIn
- Inherited product ADRs summarized in `docs/decisions/0005` through `0009`

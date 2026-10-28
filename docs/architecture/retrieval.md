# Hybrid retrieval

Quorum serves `POST /retrieval/query` with v1 domAIn parity:

1. Resolve **ready** knowledge sources the actor may read via `can_access()`.
2. Embed the query with Voyage (`input_type: query`).
3. Run **Vectorize** vector search and **D1 FTS5** keyword search in **parallel**, each limited to top k.
4. Fuse ranked lists with **RRF** using `RRF_K` from config.
5. Apply the v1 **lexical coverage** heuristic; if coverage is below `COVERAGE_MIN_SCORE` and k is below **50**, double k (capped at 50), re-run parallel search and RRF, and set `expanded: true`.

Vectors live in Cloudflare Vectorize (metadata includes `chunk_rowid` and `knowledge_source_id`). Keyword search uses the `chunks_fts` FTS5 index on chunk content. Stack choices are recorded in [ADR 0004](../decisions/0004-quorum-stack-port.md) and inherited v1 behavior in [ADR 0006](../decisions/0006-inherited-v1-adr-0002.md).

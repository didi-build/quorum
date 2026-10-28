# Hybrid retrieval

Quorum serves `POST /retrieval/query` with v1 domAIn parity:

1. Resolve **ready** knowledge sources the actor may read via `can_access()` (filtered in SQL).
2. Embed the query with Voyage (`input_type: query`).
3. Run **Vectorize** vector search and **D1 FTS5** keyword search in **parallel**, each limited to top k.
4. Fuse ranked lists with **RRF** using `RRF_K` from config.
5. Apply the v1 **lexical coverage** heuristic; if coverage is below `COVERAGE_MIN_SCORE` and k is below **50**, double k (capped at 50), re-run parallel search and RRF, and set `expanded: true`.

Vectors live in Cloudflare Vectorize (metadata includes `chunk_rowid` and `knowledge_source_id`). Keyword search uses the `chunks_fts` FTS5 index on chunk content (`porter unicode61`). Stack choices are recorded in [ADR 0004](../decisions/0004-quorum-stack-port.md) and inherited v1 behavior in [ADR 0006](../decisions/0006-inherited-v1-adr-0002.md).

## Vectorize metadata index (production)

Vector queries filter on `knowledge_source_id`. That requires a **metadata index** on the Vectorize index before vectors are upserted, or those vectors are not filterable until re-upserted after the index exists.

One-time (maintainer, production account), tracked in [DIDI-945](https://linear.app/didi-build/issue/DIDI-945):

```bash
wrangler vectorize create-metadata-index quorum-embeddings \
  --property-name=knowledge_source_id \
  --type=string
```

After the index is created, **re-index** (or otherwise re-upsert) any knowledge sources that were indexed before the metadata index existed so their vectors become filterable. New indexing from the DIDI-775 pipeline picks up the index automatically once it is in place.

Do not run this command from CI or Cloud Agents; Diadem owns the manual production step via DIDI-945.

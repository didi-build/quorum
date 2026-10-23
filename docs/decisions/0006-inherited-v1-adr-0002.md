# 0006. Inherited product decision: tech stack and retrieval (v1 ADR 0002)

- **Status:** accepted (inherited, stack mechanics superseded by [0004](./0004-quorum-stack-port.md))
- **Date:** 2026-10-23

## Summary

v1 chose FastAPI, Postgres with pgvector and tsvector, Voyage contextual embeddings, LangChain `init_chat_model`, RRF fusion with a coverage check, hand-rolled OAuth, chunking near 512 tokens with 50 overlap, and write-back via GitHub pull requests only. Quorum preserves **product behavior** (hybrid retrieval, RRF, Voyage model family, PR-only write-back, no third-party OAuth platform) while replacing the runtime with TypeScript on Workers, D1, FTS5, Vectorize, and Queues per ADR 0004.

## History

Living document with changelog: [domAIn `docs/adr/0002-tech-stack.md`](https://github.com/DiademShoukralla/domAIn/blob/main/docs/adr/0002-tech-stack.md).

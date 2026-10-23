# 0007. Inherited product decision: schemas and knowledge sources (v1 ADR 0003)

- **Status:** accepted (inherited)
- **Date:** 2026-10-23

## Summary

- Shared schemas include `ReviewRequest`, `PersonaOpinion`, `CouncilDecision`, and write-back plans.
- **Verdict vocabulary:** `approve`, `request_changes`, `comment` only.
- **Knowledge source types:** `github_repo` and `linear` only; **no file upload**.
- **Source status:** `pending`, `indexing`, `ready`, `error` (four values, no others).
- `Connection` and `KnowledgeSource` entities scope work to connected accounts.

## History

[domAIn `docs/adr/0003-schemas-and-knowledge-sources.md`](https://github.com/DiademShoukralla/domAIn/blob/main/docs/adr/0003-schemas-and-knowledge-sources.md).

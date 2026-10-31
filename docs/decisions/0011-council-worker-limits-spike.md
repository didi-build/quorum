# 0011. Council run Worker limits spike (DIDI-781)

- **Status:** accepted
- **Date:** 2026-10-28

## Context

ADR 0004 requires spike-testing long council runs against Cloudflare Worker CPU and wall-clock limits before shipping the council fan-out (DIDI-781).

## Method

Local `@cloudflare/vitest-pool-workers` integration test `test/worker/council-cpu-spike.test.ts`:

- Three parallel persona paths use the real `retrieve()` hybrid search on D1 fixture data with mocked Voyage and Vectorize.
- Anthropic calls are mocked with **6s** sleep per persona (parallel) and **4s** sleep for the chair (sequential), simulating realistic provider latency without live models.

## Findings

| Metric                                         | Observed (local worker test)                                                         | Workers paid limit                                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wall time, 3 parallel retrievals only          | ~13-16 ms on D1 fixture (Voyage/Vectorize mocked)                                    | No hard wall limit for waiting on I/O                                                                                                                     |
| Wall time, full council with mocked LLM sleeps | ~10.0 s (6 s parallel personas + 4 s chair)                                          | Worst case ~240 s end-user wait (120 s for the parallel personas, then 120 s for the chair); no council-level deadline yet; SDK timeout is 120 s per call |
| CPU time during provider waits                 | Not charged (waits are off-CPU)                                                      | Default **30s CPU** per HTTP request; optional **300s** via `limits.cpu_ms`                                                                               |
| CPU time for triple retrieval on fixture       | Inferred well under 30s (I/O-bound; local vitest does not enforce Worker CPU limits) | Same default 30s CPU budget                                                                                                                               |

Cloudflare documents that **CPU time excludes** time spent waiting on `fetch`, external LLM APIs, and database I/O. Council runs are I/O bound across two sequential stages (three parallel persona LLM calls, then the chair), so wall clock can exceed 30s while CPU stays far below the default cap.

## Decision

Proceed with plain TypeScript `Promise.all` council fan-out on the default Worker CPU limit. No `cpu_ms` increase is required for the mocked spike or expected production council path.

## Mitigation if limits tighten

- Keep persona retrievals parallel (already minimal wall time).
- If CPU from retrieval parsing grows, reduce per-persona `top_k` for council-only retrieval or share one retrieval result across personas (product change, needs ADR).
- If end-user wall time exceeds chat transport timeouts, move council execution to a Queue consumer or Durable Object step (out of scope for DIDI-781).

## References

- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- ADR 0004 (`docs/decisions/0004-quorum-stack-port.md`)

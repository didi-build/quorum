# Architecture overview: Quorum

Quorum is a multi-seat AI council that reaches consensus recommendations over knowledge indexed from GitHub and Linear. Stack and porting choices are in [ADR 0004](../decisions/0004-quorum-stack-port.md).

## Purpose

Group decisions by AI seats that reach a consensus recommendation, with hybrid retrieval, unified chat (supervisor routing, no mode selector), council fan-out, and PR-only write-back to GitHub and Linear.

## Boundaries

- **In scope:** This repository owns the Cloudflare Worker API, D1 schema and migrations, indexing pipeline (queue producer and future consumer), embeddings and retrieval, chat and council orchestration, React PWA, static landing assets, privacy data map, and launchpad CI.
- **Out of scope:** Cloudflare account provisioning, DNS for `quorum.didi.build`, production deploy workflows, and v1 droplet hosting at `domain.didi.build`.

## Interfaces

### Inbound

- **HTTP:** REST and OAuth callbacks on the Worker (health today; auth, connections, sources, retrieval, chat, write-back in build tickets).
- **WebSocket:** Council status and chat frames on the same Worker origin (per ADR 0004).
- **Static UI:** Vite-built PWA under `/app/` via Wrangler assets binding.

### Outbound

| System        | Use                                                                   |
| ------------- | --------------------------------------------------------------------- |
| **D1**        | Relational data, sessions, FTS5 keyword leg                           |
| **Queues**    | Async indexing jobs (producer now; consumer with handler in DIDI-775) |
| **Vectorize** | 1024-dim chunk embeddings and metadata                                |
| **Anthropic** | Supervisor, retrieval answers, personas, chair, write-back planning   |
| **Voyage AI** | `voyage-context-4` contextual embeddings                              |
| **GitHub**    | User OAuth, App installation, repo index, PR write-back               |
| **Linear**    | OAuth, team issue index, issue write-back                             |

## Environments

| Environment | Purpose            | Notes                                                                                                                                                                          |
| ----------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| local       | Developer machines | Copy `.dev.vars.example` to `.dev.vars` (never commit). Optional `.env` from `.env.example` for launchpad-only vars. Run `npm run dev` (builds frontend, then `wrangler dev`). |
| staging     | Pre-production     | Not provisioned in repo setup; Wrangler env blocks and secrets when a host exists.                                                                                             |
| production  | Live               | Target host `quorum.didi.build` (ADR 0004); DNS and deploy are separate tickets.                                                                                               |
| preview     | PR mock UI         | `quorum-preview` on workers.dev (`mock-preview` build to `frontend/dist-preview`, alias `pr-<n>`; public, no auth; see ADR 0010).                                              |

Wrangler **secrets** and **vars** mirror names in `.dev.vars.example` for non-local deploys.

## Scheduled jobs

| Cron (UTC)  | Handler                | Purpose                                                                                                                              |
| ----------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `0 4 * * *` | `purgeExpiredSessions` | Delete `sessions` rows whose effective end (`expires_at` or earlier `revoked_at`) is more than 30 days old; bounded batches per run. |

Configured in `wrangler.jsonc` `triggers.crons`. Implementation: `src/jobs/session-purge.ts`, invoked from the Worker `scheduled` export in `src/index.ts`. Retention details: `docs/privacy/retention.md`.

## Data flow (target)

1. Allowlisted user signs in via GitHub OAuth; session stored in D1.
2. User connects GitHub App and Linear OAuth; tokens encrypted at rest in D1.
3. User attaches repos or teams as knowledge sources; indexing jobs enqueue to **Queues**; consumer fetches content, chunks, embeds via **Voyage**, writes chunks to **D1** and vectors to **Vectorize**.
4. Chat message: supervisor classifies intent; retrieval runs Vectorize plus FTS5, RRF fusion, coverage per documented v1 intent; council path fans out personas then chair synthesis.
5. Write-back: confirmed proposals open GitHub PRs and Linear issues via installation or OAuth tokens.

Today the repo implements the Worker shell (`GET /health`, `GET /ready`), typed config from Worker `env`, shared `{ "detail": string }` errors, and static frontend build; the flows above are the build target.

## Open questions

- Worker CPU and duration limits on large repo indexing and long council runs (spikes DIDI-775, DIDI-781).
- WebSocket vs SSE fallback under production load (ADR 0004 prefers WebSocket first).

Resolve new unknowns in `docs/decisions/` before implementing the affected feature.

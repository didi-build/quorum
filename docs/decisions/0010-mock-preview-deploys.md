# 0010. Per-PR mock-preview deploys on workers.dev

- **Status:** accepted
- **Date:** 2026-10-24

## Context

UI pull requests need a shareable URL that works on mobile without provisioning D1, auth secrets, or the production Worker. Fork pull requests must not receive deploy credentials.

## Decision

- Add a Vite build mode `mock-preview` (`npm run build:frontend:mock-preview`). Preview mocks load only when `import.meta.env.DEV` is true or `import.meta.env.MODE === "mock-preview"`, using inline gates and dynamic imports so production bundles tree-shake mocks out. The mock-preview build disables the PWA plugin so no service worker is emitted.
- Deploy static assets plus a tiny SPA shell Worker as `quorum-preview` via `wrangler.preview.jsonc` (no D1, R2, Vectorize, Queues, or KV). Each same-repo pull request uploads with `wrangler versions upload --preview-alias pr-<number>` for a stable workers.dev URL. PR CI never runs `wrangler deploy` on the production version of that Worker.
- **One-time bootstrap:** `versions upload` requires the `quorum-preview` script to exist already (with preview URLs enabled). Before the first PR preview, a maintainer runs `wrangler deploy --config wrangler.preview.jsonc` locally or from a trusted main-branch process, using full Cloudflare credentials. If the script is missing, `scripts/upload-preview-version.mjs` fails with a fixed error pointing here and to `docs/runbooks/deploy.md`.
- **Preview URL shape:** alias URLs look like `https://pr-<n>-quorum-preview.<account-subdomain>.workers.dev`. The upload script parses only that alias form (not the per-version URL) and posts `<alias-url>/app/` in the sticky PR comment. The preview Worker redirects `/` to `/app/`.
- Run `.github/workflows/preview.yml` on `pull_request` for same-repo branches only. It uses secret `QUORUM_CLOUDFLARE_API_TOKEN_PREVIEW` and repository variable `QUORUM_CLOUDFLARE_ACCOUNT_ID` (non-secret account id). When the secret is missing, the deploy step logs a `::notice::` and exits successfully.

## Reasons

- Mock-preview is a production-optimized bundle with mocks enabled, unlike `vite dev`, and stays separate from the real API Worker.
- A dedicated script and token limit blast radius if pull request code is malicious.
- Skipping deploy when credentials are absent lets the workflow land before Diadem adds the secret.

## Consequences

- Chat and other transports should use the same `DEV || MODE === "mock-preview"` gate when DIDI-787 lands.
- Maintainers must create a Cloudflare API token with Workers Scripts Edit on `quorum-preview` (or account-scoped Workers Scripts Edit if per-script scope is unavailable) and set `QUORUM_CLOUDFLARE_API_TOKEN_PREVIEW` plus `QUORUM_CLOUDFLARE_ACCOUNT_ID`.
- `.github/workflows/preview.yml` changes require CTO review and the `privileged-change-reviewed` label.

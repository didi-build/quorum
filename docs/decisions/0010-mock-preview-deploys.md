# 0010. Use per-PR mock-preview deploys on workers.dev

- **Status:** accepted
- **Date:** 2026-10-24
- **Deciders:** CTO (privileged workflow and token scope), Diadem (Cloudflare account and secrets)

## Context

UI pull requests need a shareable URL that works on mobile without provisioning D1, auth secrets, or the production Worker. Fork pull requests must not receive deploy credentials.

## Decision

- Add a Vite build mode `mock-preview` (`npm run build:frontend:mock-preview`) that writes to `frontend/dist-preview` (never `frontend/dist`). Preview mocks load only when `import.meta.env.DEV` is true or `import.meta.env.MODE === "mock-preview"`, using inline gates and dynamic imports so production bundles tree-shake mocks out. The mock-preview build disables the PWA plugin so no service worker is emitted. Production `vite build` refuses to run unless `mode` is `production` or `mock-preview` and `NODE_ENV` is `production`. A `configResolved` hook refuses mock-preview when the resolved `build.outDir` is `frontend/dist` or inside it (including `QUORUM_FRONTEND_PREVIEW_OUT_DIR=dist` or `--outDir dist`). Production `closeBundle` scans the resolved `build.outDir` from config (not a precomputed default).
- Deploy static assets plus a tiny SPA shell Worker as `quorum-preview` via `wrangler.preview.jsonc` (no D1, R2, Vectorize, Queues, or KV). Set `workers_dev` and `preview_urls` to true in that config. Each same-repo pull request uploads with `wrangler versions upload --preview-alias pr-<number>` for a stable workers.dev URL. PR CI never runs `wrangler deploy` on the production version of that Worker.
- **One-time bootstrap:** `versions upload` requires the `quorum-preview` script to exist already. Before the first PR preview, a maintainer runs `wrangler deploy --config wrangler.preview.jsonc` locally or from a trusted main-branch process. If the script is missing, `scripts/upload-preview-version.mjs` fails with a fixed error pointing here and to `docs/runbooks/deploy.md`.
- **Preview URL shape:** alias URLs look like `https://pr-<n>-quorum-preview.<account-subdomain>.workers.dev`. The upload script parses only that alias form and posts `<alias-url>/app/` in the sticky PR comment. The preview Worker redirects `/` to `/app/` and sets `X-Robots-Tag: noindex, nofollow` on responses.
- Run `.github/workflows/preview.yml` on `pull_request` for same-repo branches only, split into build (no secrets), deploy (preview token only), and comment (`pull-requests: write`) jobs. Uses secret `QUORUM_CLOUDFLARE_API_TOKEN_PREVIEW` and repository variable `QUORUM_CLOUDFLARE_ACCOUNT_ID`. When the secret is missing, the deploy step logs a `::notice::` and exits successfully.

## Alternatives considered

- **Cloudflare Pages per branch:** rejected because Quorum already serves the PWA from the Worker assets binding and we want version aliases on the existing Workers model without Pages project sprawl.
- **Full staging Worker with D1:** rejected for PR previews due to secret exposure, data isolation, and cost; mock-preview is frontend-only.
- **Reuse production `quorum` Worker with env vars:** rejected because PR code could not safely receive production bindings or secrets.

## Reasons

- Mock-preview is a production-optimized bundle with mocks enabled, unlike `vite dev`, and stays separate from the real API Worker and production dist output.
- A dedicated script, token, and `dist-preview` output limit blast radius if pull request code is malicious.
- Skipping deploy when credentials are absent lets the workflow land before secrets exist ([DIDI-817](https://linear.app/didi-build/issue/DIDI-817)).

## Consequences

- Preview deployments are **public** on workers.dev with mock auth only; there is no access control on preview URLs. Re-uploading the same preview alias replaces which version that alias serves.
- When a PR closes, the alias is not automatically deleted in this workflow; treat preview URLs as short-lived and non-secret. Do not put sensitive data in mock fixtures.
- Chat and other transports should add `MODE === "mock-preview"` to their gates when [DIDI-787](https://linear.app/didi-build/issue/DIDI-787) and connections work land.
- Maintainers must create a Cloudflare API token with Workers Scripts Edit on `quorum-preview` and set `QUORUM_CLOUDFLARE_API_TOKEN_PREVIEW` plus `QUORUM_CLOUDFLARE_ACCOUNT_ID`.
- `.github/workflows/preview.yml` changes require CTO review; a CTO sign-off comment pinned to the head SHA is the record of privileged workflow approval.

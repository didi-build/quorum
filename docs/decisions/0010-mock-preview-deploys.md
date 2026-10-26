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
- **Preview URL shape:** alias URLs look like `https://pr-<n>-quorum-preview.<account-subdomain>.workers.dev`. The upload script parses only that alias form and posts `<alias-url>/app/` in the sticky PR comment. Mock-preview `finish-frontend-dist` does **not** copy the marketing landing to `dist-preview/` (static assets are served before the Worker). Instead it writes Cloudflare static `_redirects` (`/ /app/ 302`) and `_headers` (`/*` with `X-Robots-Tag: noindex, nofollow`) at the preview dist root. The `/` to `/app/` redirect and the `X-Robots-Tag: noindex, nofollow` policy on paths served from the assets binding (including `/` after redirect) come from those `_redirects` and `_headers` files in the preview build output, not from `preview/worker.ts`. `preview/worker.ts` routes SPA shell fallbacks when static assets do not match and also sets `X-Robots-Tag: noindex, nofollow` on every `Response` it returns. Production `frontend/dist` still copies the landing to `index.html` at the dist root.
- **workers.dev robots header:** Local `wrangler dev` and the mock-preview static server honour `_headers` and return `X-Robots-Tag: noindex, nofollow`. On deployed `*.workers.dev` preview aliases, Cloudflare may respond with `x-robots-tag: noindex` only (no `nofollow`) for both asset-served paths and Worker-served responses. Treat that as platform behaviour on workers.dev; the repo still emits `noindex, nofollow` in `dist-preview/_headers` and `preview/worker.ts` still sets the same header on every `Response` it returns.
- Run `.github/workflows/preview.yml` on `pull_request` for same-repo branches only, split into **build** (no secrets), **deploy** (preview token only), **screenshots** (`contents: read` only; no Cloudflare token), and **comment** (`pull-requests: write`) jobs. Uses secret `QUORUM_CLOUDFLARE_API_TOKEN_PREVIEW` and repository variable `QUORUM_CLOUDFLARE_ACCOUNT_ID`. When the secret is missing, the deploy step logs a `::notice::` and exits successfully.
- **UI screenshots (DIDI-818):** After build (and deploy when it runs), the screenshots job downloads `frontend/dist-preview`, runs Playwright (Chromium only) via `scripts/capture-preview-screenshots.mjs`, and uploads artifact `quorum-mock-preview-screenshots` (count from `scripts/lib/preview-screenshot-plan.mjs`: landing, sign-in, chat, connections at 390px and 1280px, light and dark) with **7-day** retention. App routes prefer the deployed workers.dev origin from the deploy output; on failure the capture script serves `dist-preview` from a local static server that honours `_redirects`, `_headers`, and SPA shell fallback like `quorum-preview`. **Landing** PNGs always come from repo `landing/` (with a local `/health` stub so the landing page script can finish). `scripts/verify-preview-screenshot-count.mjs` checks the PNG count in preview workflow (success on stdout). The sticky PR comment links the artifact URL when screenshots succeed; it still posts the preview URL when deploy succeeded even if screenshots fail or are skipped. Mock-preview sign-in screenshots use `?quorum_preview_screen=sign-in`, handled only when `import.meta.env.MODE === "mock-preview"` in `frontend/src/lib/api/auth.ts` (`fetchAuthUser` returns signed-out for that query param). The main **CI** `check` job runs `npx playwright install --with-deps chromium` after `npm ci` so `test/capture-preview-screenshots.test.ts` executes end-to-end in CI; that test fails (does not skip) when `CI` is set and Chromium is missing.

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
- Chat and Connections transports include `MODE === "mock-preview"` in their mock gates (landed with [DIDI-819](https://linear.app/didi-build/issue/DIDI-819)).
- Maintainers must create a Cloudflare API token with Workers Scripts Edit on `quorum-preview` and set `QUORUM_CLOUDFLARE_API_TOKEN_PREVIEW` plus `QUORUM_CLOUDFLARE_ACCOUNT_ID`.
- `.github/workflows/preview.yml` changes require CTO review; a CTO sign-off comment pinned to the head SHA is the record of privileged workflow approval.

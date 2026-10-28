# Deploy runbook

**Purpose:** Repeatable steps to ship a version to an environment.

## Production Worker (`quorum`)

1. CI green on the commit you deploy.
2. **D1 `database_id` (committed config):** `wrangler.jsonc` keeps a placeholder `database_id` for `quorum-db`. Never commit the real Cloudflare id.
3. **Before `wrangler deploy` or `wrangler d1 migrations apply` on production:** generate a deploy config in the repo root (for example `wrangler.ci.jsonc`, gitignored) using the prepare and guard scripts in this repo:

   ```bash
   node scripts/check-deploy-guards.mjs --target committed --config wrangler.jsonc
   node scripts/prepare-wrangler-config.mjs --output wrangler.ci.jsonc
   node scripts/check-deploy-guards.mjs --target production-deploy --config wrangler.ci.jsonc
   ```

   Set environment variable **`QUORUM_D1_DATABASE_ID`** from the GitHub Actions secret of the same name in CI (never commit or log the value). Do not use a repository variable for the id (variables can appear in logs).

4. **Production deploy workflow:** A separate privileged ticket will add the GitHub Actions pipeline; until then, maintainers run the steps above from a trusted process.
5. Record where to watch logs and metrics.

### One-time: Vectorize metadata index for retrieval

Hybrid retrieval filters Vectorize queries on `knowledge_source_id`. Create the metadata index once per account (see [DIDI-945](https://linear.app/didi-build/issue/DIDI-945) for Diadem's manual production ticket):

```bash
wrangler vectorize create-metadata-index quorum-embeddings \
  --property-name=knowledge_source_id \
  --type=string
```

Vectors upserted **before** this index existed are not filterable until those sources are **re-indexed** (re-upsert). Plan re-indexing for any knowledge sources that were ready prior to the index. Details: [docs/architecture/retrieval.md](../architecture/retrieval.md).

## One-time: `quorum-preview` (PR mock previews)

PR preview deploys use `wrangler versions upload` against the `quorum-preview` script. That script must exist before the first preview upload.

**Who:** A maintainer (not PR CI).

**When:** Once per Cloudflare account (or after the script was deleted).

**Steps:**

1. Ensure `QUORUM_CLOUDFLARE_ACCOUNT_ID` matches the target account and preview URLs are enabled for Workers on that account.
2. Authenticate Wrangler (`wrangler login` or `CLOUDFLARE_API_TOKEN` with Workers Scripts Edit on `quorum-preview`).
3. From the repo root, with a current `frontend/dist-preview` (run `npm run build:frontend:mock-preview`; the npm script uses `scripts/build-frontend.mjs`, which sets `NODE_ENV` and `FRONTEND_DIST` in the Node child env so the build works on Windows PowerShell and on Linux):

   ```bash
   npm ci
   npm run build:frontend:mock-preview
   npx wrangler deploy --config wrangler.preview.jsonc
   ```

4. Confirm the script name is `quorum-preview` in the Cloudflare dashboard.

After bootstrap, `.github/workflows/preview.yml` uploads per-PR versions with `--preview-alias pr-<number>` only. It does not deploy the main Worker version.

The same workflow also uploads **`quorum-mock-preview-screenshots`** (Playwright PNGs: landing from repo `landing/`, sign-in, chat, and connections from `dist-preview`; 7-day artifact retention). Download the artifact from the link in the sticky PR comment when the screenshots job succeeds.

## Verification

- Production: health check / smoke test as you define for `quorum`.
- Preview: open the sticky PR comment link (`…/app/`) after secrets and the bootstrap deploy are in place.
- Preview UI: when screenshots succeed, download `quorum-mock-preview-screenshots` from the artifact URL in the sticky comment (or from the workflow run).

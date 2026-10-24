# Deploy runbook

**Purpose:** Repeatable steps to ship a version to an environment.

## Production Worker (`quorum`)

1. CI green on the commit you deploy.
2. _Document your production deploy command or pipeline here when wired._
3. Record where to watch logs and metrics.

## One-time: `quorum-preview` (PR mock previews)

PR preview deploys use `wrangler versions upload` against the `quorum-preview` script. That script must exist before the first preview upload.

**Who:** A maintainer (not PR CI).

**When:** Once per Cloudflare account (or after the script was deleted).

**Steps:**

1. Ensure `QUORUM_CLOUDFLARE_ACCOUNT_ID` matches the target account and preview URLs are enabled for Workers on that account.
2. Authenticate Wrangler (`wrangler login` or `CLOUDFLARE_API_TOKEN` with Workers Scripts Edit on `quorum-preview`).
3. From the repo root, with a current `frontend/dist` (any mock-preview build is fine for bootstrap):

   ```bash
   npm ci
   npm run build:frontend:mock-preview
   npx wrangler deploy --config wrangler.preview.jsonc
   ```

4. Confirm the script name is `quorum-preview` in the Cloudflare dashboard.

After bootstrap, `.github/workflows/preview.yml` uploads per-PR versions with `--preview-alias pr-<number>` only. It does not deploy the main Worker version.

## Verification

- Production: health check / smoke test as you define for `quorum`.
- Preview: open the sticky PR comment link (`…/app/`) after secrets and the bootstrap deploy are in place.

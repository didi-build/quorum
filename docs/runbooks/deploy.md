# Deploy runbook

**Purpose:** Repeatable steps to ship a version to an environment.

## Production Worker (`quorum`)

1. CI green on the commit you deploy.
2. **D1 migrations:** Apply pending D1 migrations to the target database **before** `wrangler deploy` in each environment (development, staging, production). Indexing and other Worker code expect the schema that matches the deployed commit.

   **Migration 0003 (`indexing_run_id`) deploy window ([DIDI-933](https://linear.app/didi-build/issue/DIDI-933), [DIDI-966](https://linear.app/didi-build/issue/DIDI-966)):** Migration 0003 adds `indexing_run_id` on `knowledge_sources`. Run ids on queue messages come from quorum#33 Worker code: new sources enqueue `{ source_id }` only (`enqueue-indexing.ts` on create), `POST /sources/{id}/refresh` enqueues `{ source_id, indexing_run_id }` (minted on the source before enqueue), and continuations add `indexing_run_id` via `withIndexingRunId`. **Continuations still in the queue from pre-#33 Worker code** can lack a run id; create first messages never carry one. The deployed Worker keeps two fallbacks so those messages can still finish: a run-id-less continuation uses the source's current run id (non-fresh branch in `indexing-run.ts`), and a run-id-less continuation or first message can adopt a run once while the source is `indexing` with a null `indexing_run_id`. After every environment that ran pre-#33 code has drained its indexing queue, [DIDI-976](https://linear.app/didi-build/issue/DIDI-976) removes both fallbacks; a message with no run id is then stale unless it is a fresh first message. Removing the fallbacks closes edge cases 2 and 3; edge case 1 ends once the pre-#33 queue has drained (create first messages keep today's behaviour).

   **If the Worker deploys before migration 0003:** `loadKnowledgeSource` selects `indexing_run_id` and fails on the missing column. The indexing consumer retries until `max_retries` (3 in `wrangler.jsonc`, final delivery on attempt 4 per `indexing-queue-constants.ts`), then acks the message. `markKnowledgeSourceIndexingError` uses the same load path, so it cannot mark `error` either. Affected sources can stay `pending` or `indexing` until someone runs `POST /sources/{id}/refresh` after the migration is applied.

   **Operator steps:**
   - Before the window, note which sources are `indexing`: Connections (status chip shows indexing) or authenticated `GET /sources` and filter `sources[].status === "indexing"`. Connections and `GET /sources` show only your own and shared sources. For the full production list, use the D1 read via step 4-5. Only the source owner can refresh a source (Connections refresh or `POST /sources/{id}/refresh`); for other owners' sources, Diadem decides under the step 4-5 approval path (no ad hoc production queries).
   - When possible, wait until none are `indexing`, then **apply migration 0003**, then **deploy** the matching Worker commit (migration before code).
   - If the deploy overlapped an in-flight index, wait until the indexing queue has drained, then `POST /sources/{id}/refresh` each affected source (owner only; others get 404). Refreshing before the queue drains can start a new run while old run-id-less continuations are still in flight (edge case 2).
   - If a source still shows stale or partial index data after the queue drains, `POST /sources/{id}/refresh` that source (owner only). Confirm it reaches `ready` ([DIDI-980](https://linear.app/didi-build/issue/DIDI-980)).
   - **DIDI-980:** Deploy the Worker that mints `indexing_run_id` on refresh before relying on refresh to complete when older indexing legs are still queued. Refreshes handled by an older Worker (no run id on the refresh enqueue) keep the lost-refresh bug until that Worker is replaced; no migration is needed beyond existing `indexing_run_*` columns.

   **Edge cases during the deploy window (accepted while the fallbacks remain; DIDI-980 late-redelivery guards apply to refresh first messages with `indexing_run_id` as well):**
   1. A source that was mid-run before the migration can have null or zero `indexing_run_files_committed`, so a late **first** message in that window can still run `clearIndex` on the fresh path in `pipeline.ts` (even though other late first messages are normally dropped when `progress > 0` while the source is `indexing`, or when the source is `ready` with a run id per `indexing-run.ts`). The same guards drop a redelivered refresh first message once progress is committed or after the run reaches `ready`.
   2. A pre-deploy continuation from an old run R1 (no run id) can attach to a newer run R2 if R2 started first and has already entered `indexing` (for example through refresh). Its progress write then counts for R2. If R2's first leg then needs a retry, that retry is dropped, and R2 can finish with a partial index until the next refresh. A run-id-less continuation while R2 is still `pending` with `indexing_run_id` set (typical refresh enqueue) is dropped instead, so R2's first message is not blocked by edge case 1 after a stray leg marks `ready`. A refresh run R2 with run id on the first message is still subject to the partial-index risk if an old run-id-less continuation from R1 attaches after R2 enters `indexing` but before R2 commits progress.
   3. A run-id-less continuation arriving after the source is `ready` or `error` attaches to the source's current run and keeps going (`indexing-run.ts` non-fresh branch when `indexing_run_id` is set). `setSourceStatusForRun` in `pipeline.ts` updates status only when `id` and `indexing_run_id` match, with no guard on the previous status, so an `error` source can flip to `ready` with a partial index and committed progress can move backwards while the UI still shows `ready` or `error` until the run completes.

3. **D1 `database_id` (committed config):** `wrangler.jsonc` keeps a placeholder `database_id` for `quorum-db`. Never commit the real Cloudflare id.
4. **Before `wrangler deploy` or `wrangler d1 migrations apply` on production:** generate a deploy config in the repo root (for example `wrangler.ci.jsonc`, gitignored) using the prepare and guard scripts in this repo:

   ```bash
   node scripts/check-deploy-guards.mjs --target committed --config wrangler.jsonc
   node scripts/prepare-wrangler-config.mjs --output wrangler.ci.jsonc
   node scripts/check-deploy-guards.mjs --target production-deploy --config wrangler.ci.jsonc
   ```

   Set environment variable **`QUORUM_D1_DATABASE_ID`** from the GitHub Actions secret of the same name in CI (never commit or log the value). Do not use a repository variable for the id (variables can appear in logs).

5. **Production deploy workflow:** A separate privileged ticket will add the GitHub Actions pipeline; until then, maintainers run the steps above from a trusted process.
6. Record where to watch logs and metrics.

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

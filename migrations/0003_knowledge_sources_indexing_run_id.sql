-- Indexing run id and per-run progress (DIDI-933).
-- Apply D1 migrations before wrangler deploy in each environment (see docs/runbooks/deploy.md).
ALTER TABLE knowledge_sources ADD COLUMN indexing_run_id TEXT;
ALTER TABLE knowledge_sources ADD COLUMN indexing_run_files_committed INTEGER;

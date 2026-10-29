-- Per-run id for indexing queue messages (DIDI-933). Apply in production only after CTO sign-off.
ALTER TABLE knowledge_sources ADD COLUMN indexing_run_id TEXT;

-- Support session purge eligibility filters on expires_at and revoked_at.
CREATE INDEX IF NOT EXISTS ix_sessions_expires_at ON sessions (expires_at);

CREATE INDEX IF NOT EXISTS ix_sessions_revoked_at ON sessions (revoked_at);

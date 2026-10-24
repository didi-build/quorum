-- Quorum D1 schema (v1 domAIn parity). Vectors live in Vectorize; keyword search uses FTS5.
-- Timestamp defaults use ISO 8601 UTC: strftime('%Y-%m-%dT%H:%M:%fZ', 'now').
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  github_id INTEGER NOT NULL UNIQUE,
  login TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (
    strftime ('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (
    strftime ('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX ix_sessions_user_id ON sessions (user_id);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  project_id TEXT,
  created_at TEXT NOT NULL DEFAULT (
    strftime ('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
);

CREATE INDEX ix_api_keys_user_id ON api_keys (user_id);

CREATE INDEX ix_api_keys_project_id ON api_keys (project_id);

CREATE TABLE connections (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'linear')),
  access_token_ciphertext TEXT,
  refresh_token_ciphertext TEXT,
  token_expires_at TEXT,
  installation_id TEXT,
  external_account_id TEXT NOT NULL,
  external_account_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (
    strftime ('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  updated_at TEXT NOT NULL DEFAULT (
    strftime ('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
);

CREATE UNIQUE INDEX ix_connections_user_provider ON connections (user_id, provider);

CREATE TABLE knowledge_sources (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  project_id TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('github_repo', 'linear')),
  external_ref TEXT NOT NULL,
  connection_id TEXT NOT NULL REFERENCES connections (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'indexing', 'ready', 'error')
  ) DEFAULT 'pending',
  status_message TEXT,
  last_indexed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (
    strftime ('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  updated_at TEXT NOT NULL DEFAULT (
    strftime ('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
);

CREATE INDEX ix_knowledge_sources_user_id ON knowledge_sources (user_id);

CREATE INDEX ix_knowledge_sources_project_id ON knowledge_sources (project_id);

CREATE INDEX ix_knowledge_sources_connection_id ON knowledge_sources (connection_id);

CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  knowledge_source_id TEXT NOT NULL REFERENCES knowledge_sources (id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  heading_hierarchy TEXT NOT NULL DEFAULT '[]' CHECK (json_valid (heading_hierarchy)),
  created_at TEXT NOT NULL DEFAULT (
    strftime ('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
);

CREATE UNIQUE INDEX ix_chunks_document ON chunks (
  knowledge_source_id,
  document_id,
  chunk_index
);

CREATE VIRTUAL TABLE chunks_fts USING fts5 (
  content,
  content = 'chunks',
  content_rowid = 'id',
  tokenize = 'porter unicode61'
);

CREATE TRIGGER chunks_ai
AFTER INSERT ON chunks
BEGIN
  INSERT INTO chunks_fts (rowid, content)
  VALUES
    (new.id, new.content);
END;

CREATE TRIGGER chunks_ad
AFTER DELETE ON chunks
BEGIN
  INSERT INTO chunks_fts (chunks_fts, rowid, content)
  VALUES
    ('delete', old.id, old.content);
END;

CREATE TRIGGER chunks_au
AFTER UPDATE ON chunks
BEGIN
  INSERT INTO chunks_fts (chunks_fts, rowid, content)
  VALUES
    ('delete', old.id, old.content);
  INSERT INTO chunks_fts (rowid, content)
  VALUES
    (new.id, new.content);
END;

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  classified_intent TEXT,
  response_kind TEXT,
  citations TEXT NOT NULL DEFAULT '[]' CHECK (json_valid (citations)),
  council_decision TEXT CHECK (
    council_decision IS NULL
    OR json_valid (council_decision)
  ),
  created_at TEXT NOT NULL DEFAULT (
    strftime ('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
);

CREATE INDEX ix_chat_messages_session_id ON chat_messages (session_id);

CREATE INDEX ix_chat_messages_user_id ON chat_messages (user_id);

CREATE INDEX ix_chat_messages_project_id ON chat_messages (project_id);

CREATE TABLE write_back_proposals (
  id TEXT PRIMARY KEY NOT NULL,
  chat_message_id TEXT NOT NULL UNIQUE REFERENCES chat_messages (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_id TEXT,
  plan TEXT NOT NULL CHECK (json_valid (plan)),
  feedback_history TEXT NOT NULL DEFAULT '[]' CHECK (json_valid (feedback_history)),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (
    status IN ('proposed', 'confirmed', 'executed')
  ),
  execution_results TEXT NOT NULL DEFAULT '[]' CHECK (json_valid (execution_results)),
  created_at TEXT NOT NULL DEFAULT (
    strftime ('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  updated_at TEXT NOT NULL DEFAULT (
    strftime ('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  executed_at TEXT
);

CREATE INDEX ix_write_back_proposals_user_id ON write_back_proposals (user_id);

CREATE INDEX ix_write_back_proposals_project_id ON write_back_proposals (project_id);

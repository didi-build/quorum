-- Quorum D1 schema (v1 domAIn parity). Vectors live in Vectorize; keyword search uses FTS5.
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  github_id INTEGER NOT NULL UNIQUE,
  login TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime ('now'))
);

CREATE INDEX ix_users_github_id ON users (github_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime ('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX ix_sessions_user_id ON sessions (user_id);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  user_id TEXT,
  project_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime ('now'))
);

CREATE INDEX ix_api_keys_user_id ON api_keys (user_id);

CREATE INDEX ix_api_keys_project_id ON api_keys (project_id);

CREATE TABLE connections (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'linear')),
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TEXT,
  installation_id TEXT,
  external_account_id TEXT NOT NULL,
  external_account_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime ('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime ('now'))
);

CREATE INDEX ix_connections_user_id ON connections (user_id);

CREATE UNIQUE INDEX ix_connections_user_provider ON connections (user_id, provider);

CREATE TABLE knowledge_sources (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
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
  created_at TEXT NOT NULL DEFAULT (datetime ('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime ('now'))
);

CREATE INDEX ix_knowledge_sources_user_id ON knowledge_sources (user_id);

CREATE INDEX ix_knowledge_sources_project_id ON knowledge_sources (project_id);

CREATE TABLE chunks (
  id TEXT PRIMARY KEY NOT NULL,
  knowledge_source_id TEXT NOT NULL REFERENCES knowledge_sources (id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  heading_hierarchy TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime ('now'))
);

CREATE INDEX ix_chunks_knowledge_source_id ON chunks (knowledge_source_id);

CREATE UNIQUE INDEX ix_chunks_document ON chunks (
  knowledge_source_id,
  document_id,
  chunk_index
);

CREATE VIRTUAL TABLE chunks_fts USING fts5 (
  content,
  content = 'chunks',
  content_rowid = 'rowid',
  tokenize = 'porter unicode61'
);

CREATE TRIGGER chunks_ai
AFTER INSERT ON chunks
BEGIN
  INSERT INTO chunks_fts (rowid, content)
  VALUES
    (new.rowid, new.content);
END;

CREATE TRIGGER chunks_ad
AFTER DELETE ON chunks
BEGIN
  INSERT INTO chunks_fts (chunks_fts, rowid, content)
  VALUES
    ('delete', old.rowid, old.content);
END;

CREATE TRIGGER chunks_au
AFTER UPDATE ON chunks
BEGIN
  INSERT INTO chunks_fts (chunks_fts, rowid, content)
  VALUES
    ('delete', old.rowid, old.content);
  INSERT INTO chunks_fts (rowid, content)
  VALUES
    (new.rowid, new.content);
END;

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  project_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  classified_intent TEXT,
  response_kind TEXT,
  citations TEXT NOT NULL DEFAULT '[]',
  council_decision TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime ('now'))
);

CREATE INDEX ix_chat_messages_session_id ON chat_messages (session_id);

CREATE INDEX ix_chat_messages_user_id ON chat_messages (user_id);

CREATE INDEX ix_chat_messages_project_id ON chat_messages (project_id);

CREATE TABLE write_back_proposals (
  id TEXT PRIMARY KEY NOT NULL,
  chat_message_id TEXT NOT NULL UNIQUE REFERENCES chat_messages (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  project_id TEXT,
  plan TEXT NOT NULL,
  feedback_history TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (
    status IN ('proposed', 'confirmed', 'executed')
  ),
  execution_results TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime ('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime ('now')),
  executed_at TEXT
);

CREATE INDEX ix_write_back_proposals_chat_message_id ON write_back_proposals (chat_message_id);

CREATE INDEX ix_write_back_proposals_user_id ON write_back_proposals (user_id);

CREATE INDEX ix_write_back_proposals_project_id ON write_back_proposals (project_id);

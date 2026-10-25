import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const USER_ID = "00000000-0000-4000-8000-000000000050";
const SESSION_ID = "00000000-0000-4000-8000-000000000051";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000052";
const SOURCE_ID = "00000000-0000-4000-8000-000000000053";
const CHAT_ID = "00000000-0000-4000-8000-000000000054";
const CHAT_SESSION_ID = "00000000-0000-4000-8000-000000000055";
const PROPOSAL_ID = "00000000-0000-4000-8000-000000000056";
const API_KEY_ID = "00000000-0000-4000-8000-000000000057";

describe("user delete cascade (integration, vitest-pool-workers)", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM write_back_proposals").run();
    await env.DB.prepare("DELETE FROM chat_messages").run();
    await env.DB.prepare("DELETE FROM chunks").run();
    await env.DB.prepare("DELETE FROM knowledge_sources").run();
    await env.DB.prepare("DELETE FROM connections").run();
    await env.DB.prepare("DELETE FROM sessions").run();
    await env.DB.prepare("DELETE FROM api_keys").run();
    await env.DB.prepare("DELETE FROM users").run();
  });

  it("removes owned rows without orphans when a user is deleted", async () => {
    await env.DB.prepare(
      `INSERT INTO users (id, github_id, login) VALUES (?, 50, 'cascade-user')`,
    )
      .bind(USER_ID)
      .run();

    await env.DB.prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at)
       VALUES (?, ?, 'hash', '2099-01-01T00:00:00.000Z')`,
    )
      .bind(SESSION_ID, USER_ID)
      .run();

    await env.DB.prepare(
      `INSERT INTO connections (
          id, user_id, provider, external_account_id, external_account_name
        ) VALUES (?, ?, 'github', 'acct', 'Account')`,
    )
      .bind(CONNECTION_ID, USER_ID)
      .run();

    await env.DB.prepare(
      `INSERT INTO knowledge_sources (
          id, user_id, source_type, external_ref, connection_id, name, status
        ) VALUES (?, ?, 'github_repo', 'org/repo', ?, 'Repo', 'ready')`,
    )
      .bind(SOURCE_ID, USER_ID, CONNECTION_ID)
      .run();

    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'doc.md', 0, 'chunk', '[]')`,
    )
      .bind(SOURCE_ID)
      .run();

    await env.DB.prepare(
      `INSERT INTO chat_messages (
          id, session_id, user_id, role, content, citations
        ) VALUES (?, ?, ?, 'user', 'hello', '[]')`,
    )
      .bind(CHAT_ID, CHAT_SESSION_ID, USER_ID)
      .run();

    await env.DB.prepare(
      `INSERT INTO write_back_proposals (
          id, chat_message_id, user_id, plan, feedback_history, execution_results
        ) VALUES (?, ?, ?, '{}', '[]', '[]')`,
    )
      .bind(PROPOSAL_ID, CHAT_ID, USER_ID)
      .run();

    await env.DB.prepare(
      `INSERT INTO api_keys (id, key_hash, user_id) VALUES (?, 'keyhash', ?)`,
    )
      .bind(API_KEY_ID, USER_ID)
      .run();

    await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(USER_ID).run();

    const counts = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS c FROM users WHERE id = ?`)
        .bind(USER_ID)
        .first<{ c: number }>(),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?`)
        .bind(USER_ID)
        .first<{ c: number }>(),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM connections WHERE user_id = ?`)
        .bind(USER_ID)
        .first<{ c: number }>(),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM knowledge_sources WHERE user_id = ?`)
        .bind(USER_ID)
        .first<{ c: number }>(),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM chunks WHERE knowledge_source_id = ?`)
        .bind(SOURCE_ID)
        .first<{ c: number }>(),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ?`)
        .bind(USER_ID)
        .first<{ c: number }>(),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM write_back_proposals WHERE user_id = ?`)
        .bind(USER_ID)
        .first<{ c: number }>(),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM api_keys WHERE user_id = ?`)
        .bind(USER_ID)
        .first<{ c: number }>(),
    ]);

    for (const row of counts) {
      expect(row?.c).toBe(0);
    }
  });
});

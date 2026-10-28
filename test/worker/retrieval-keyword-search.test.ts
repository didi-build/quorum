import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { searchChunksByKeyword } from "../../src/domain/retrieval/keyword-search.js";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const PROJECT_P = "10000000-0000-4000-8000-000000000001";
const PROJECT_Q = "10000000-0000-4000-8000-000000000002";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000020";
const SOURCE_P = "00000000-0000-4000-8000-000000000030";
const SOURCE_Q = "00000000-0000-4000-8000-000000000031";

const MATCH_TERMS = "alpha beta gamma isolation marker";

async function clearData(): Promise<void> {
  await env.DB.prepare("DELETE FROM chunks").run();
  await env.DB.prepare("DELETE FROM knowledge_sources").run();
  await env.DB.prepare("DELETE FROM connections").run();
  await env.DB.prepare("DELETE FROM users").run();
}

async function seedBase(): Promise<void> {
  await env.DB.prepare("INSERT INTO users (id, github_id, login) VALUES (?, 42, 'u')")
    .bind(USER_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '12345', 'acct', 'Account')`,
  )
    .bind(CONNECTION_ID, USER_ID)
    .run();
}

async function seedSourceChunk(
  sourceId: string,
  projectId: string,
  content: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO knowledge_sources (
        id, user_id, project_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, ?, 'github_repo', 'owner/repo', ?, 'Repo', 'ready')`,
  )
    .bind(sourceId, USER_ID, projectId, CONNECTION_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO chunks (
        knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, 'doc.md', 0, ?, '[]')`,
  )
    .bind(sourceId, content)
    .run();
}

describe("searchChunksByKeyword (worker integration)", () => {
  beforeEach(async () => {
    await clearData();
  });

  it("returns only in-list rows when an out-of-list chunk also matches the query", async () => {
    await seedBase();
    await seedSourceChunk(SOURCE_P, PROJECT_P, `${MATCH_TERMS} in project P only`);
    await seedSourceChunk(SOURCE_Q, PROJECT_Q, `${MATCH_TERMS} in project Q excluded`);

    const rows = await searchChunksByKeyword(env.DB, [SOURCE_P], MATCH_TERMS, 10);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.knowledge_source_id).toBe(SOURCE_P);
    expect(rows[0]?.content).toContain("project P only");
    expect(rows.every((row) => row.knowledge_source_id !== SOURCE_Q)).toBe(true);
  });

  it("returns scoped matches and does not broaden MATCH with OR 1=1 injection", async () => {
    await seedBase();
    await seedSourceChunk(SOURCE_P, PROJECT_P, `${MATCH_TERMS} in project P only`);
    await seedSourceChunk(SOURCE_Q, PROJECT_Q, `${MATCH_TERMS} in project Q excluded`);

    const injectionQuery = 'alpha") OR 1=1 -- beta gamma isolation marker';
    const rows = await searchChunksByKeyword(env.DB, [SOURCE_P], injectionQuery, 10);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.knowledge_source_id).toBe(SOURCE_P);
    expect(rows[0]?.content).toContain("project P only");
  });
});

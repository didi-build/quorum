import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { searchChunksByKeyword } from "../../src/domain/retrieval/keyword-search.js";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const PROJECT_P = "10000000-0000-4000-8000-000000000001";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000020";
const SOURCE_P = "00000000-0000-4000-8000-000000000030";

async function clearData(): Promise<void> {
  await env.DB.prepare("DELETE FROM chunks").run();
  await env.DB.prepare("DELETE FROM knowledge_sources").run();
  await env.DB.prepare("DELETE FROM connections").run();
  await env.DB.prepare("DELETE FROM users").run();
}

async function seedChunk(content: string): Promise<void> {
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
  await env.DB.prepare(
    `INSERT INTO knowledge_sources (
        id, user_id, project_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, ?, 'github_repo', 'owner/repo', ?, 'Repo', 'ready')`,
  )
    .bind(SOURCE_P, USER_ID, PROJECT_P, CONNECTION_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO chunks (
        knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, 'doc.md', 0, ?, '[]')`,
  )
    .bind(SOURCE_P, content)
    .run();
}

describe("searchChunksByKeyword (worker integration)", () => {
  beforeEach(async () => {
    await clearData();
  });

  it("returns scoped matches and does not broaden MATCH with OR 1=1 injection", async () => {
    await seedChunk("alpha beta gamma needle in project P only");

    const injectionQuery = 'alpha") OR 1=1 -- beta gamma';
    const rows = await searchChunksByKeyword(env.DB, [SOURCE_P], injectionQuery, 5);

    expect(rows.length).toBe(1);
    expect(rows[0]?.content).toContain("project P only");
    expect(rows[0]?.content).not.toContain("OR 1=1");
  });
});

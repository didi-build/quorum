import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { markKnowledgeSourceQueuedForReindex } from "../../src/domain/db/knowledge-sources.js";

const OWNER_ID = "00000000-0000-4000-8000-000000000010";
const WRONG_OWNER_ID = "00000000-0000-4000-8000-000000000011";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000020";
const OWNED_SOURCE_ID = "00000000-0000-4000-8000-000000000030";
const OWNERLESS_SOURCE_ID = "00000000-0000-4000-8000-000000000031";

async function clearData(): Promise<void> {
  await env.DB.prepare("DELETE FROM chunks").run();
  await env.DB.prepare("DELETE FROM knowledge_sources").run();
  await env.DB.prepare("DELETE FROM connections").run();
  await env.DB.prepare("DELETE FROM users").run();
}

async function seedOwnedReadySource(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 1, 'owner')`,
  )
    .bind(OWNER_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO connections (
        id, user_id, provider, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', 'acct', 'Account')`,
  )
    .bind(CONNECTION_ID, OWNER_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO knowledge_sources (
        id, user_id, source_type, external_ref, connection_id, name, status, status_message
      ) VALUES (?, ?, 'github_repo', 'org/repo', ?, 'Repo', 'ready', NULL)`,
  )
    .bind(OWNED_SOURCE_ID, OWNER_ID, CONNECTION_ID)
    .run();
}

async function seedOwnerlessReadySource(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 1, 'owner')`,
  )
    .bind(OWNER_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO connections (
        id, user_id, provider, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', 'acct', 'Account')`,
  )
    .bind(CONNECTION_ID, OWNER_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO knowledge_sources (
        id, user_id, project_id, source_type, external_ref, connection_id, name, status, status_message
      ) VALUES (?, NULL, NULL, 'github_repo', 'org/shared', ?, 'Shared', 'ready', NULL)`,
  )
    .bind(OWNERLESS_SOURCE_ID, CONNECTION_ID)
    .run();
}

describe("markKnowledgeSourceQueuedForReindex (integration, vitest-pool-workers)", () => {
  beforeEach(async () => {
    await clearData();
  });

  it("returns null and leaves the row unchanged for a wrong owner user_id", async () => {
    await seedOwnedReadySource();

    const updated = await markKnowledgeSourceQueuedForReindex(
      env.DB,
      OWNED_SOURCE_ID,
      WRONG_OWNER_ID,
    );
    expect(updated).toBeNull();

    const row = await env.DB.prepare(
      `SELECT status, status_message FROM knowledge_sources WHERE id = ?`,
    )
      .bind(OWNED_SOURCE_ID)
      .first<{ status: string; status_message: string | null }>();
    expect(row?.status).toBe("ready");
    expect(row?.status_message).toBeNull();
  });

  it("returns null and leaves the row unchanged for an ownerless source row", async () => {
    await seedOwnerlessReadySource();

    const updated = await markKnowledgeSourceQueuedForReindex(
      env.DB,
      OWNERLESS_SOURCE_ID,
      OWNER_ID,
    );
    expect(updated).toBeNull();

    const row = await env.DB.prepare(
      `SELECT status, status_message FROM knowledge_sources WHERE id = ?`,
    )
      .bind(OWNERLESS_SOURCE_ID)
      .first<{ status: string; status_message: string | null }>();
    expect(row?.status).toBe("ready");
    expect(row?.status_message).toBeNull();
  });
});

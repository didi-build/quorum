import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { claimIndexingRunOnSource } from "../../src/domain/ingestion/indexing-run.js";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000020";
const SOURCE_ID = "00000000-0000-4000-8000-000000000030";

async function clearData(): Promise<void> {
  await env.DB.prepare("DELETE FROM chunks").run();
  await env.DB.prepare("DELETE FROM knowledge_sources").run();
  await env.DB.prepare("DELETE FROM connections").run();
  await env.DB.prepare("DELETE FROM users").run();
}

async function seedGithubSource(status = "pending"): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 1, 'qa-user')`,
  )
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
        id, user_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, 'github_repo', 'owner/repo', ?, 'Repo', ?)`,
  )
    .bind(SOURCE_ID, USER_ID, CONNECTION_ID, status)
    .run();
}

describe("claimIndexingRunOnSource (integration, vitest-pool-workers)", () => {
  beforeEach(async () => {
    await clearData();
  });

  it("QA-2: resets progress when a new run replaces an old one", async () => {
    const oldRun = "00000000-0000-4000-8000-000000000050";
    const newRun = "00000000-0000-4000-8000-000000000051";
    await seedGithubSource("ready");
    await env.DB.prepare(
      `UPDATE knowledge_sources
       SET indexing_run_id = ?, indexing_run_files_committed = 99
       WHERE id = ?`,
    )
      .bind(oldRun, SOURCE_ID)
      .run();

    const outcome = await claimIndexingRunOnSource(env.DB, SOURCE_ID, newRun, oldRun);
    expect(outcome).toBe("claimed");

    const row = await env.DB.prepare(
      `SELECT indexing_run_id, indexing_run_files_committed
       FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{
        indexing_run_id: string;
        indexing_run_files_committed: number | null;
      }>();
    expect(row?.indexing_run_id).toBe(newRun);
    expect(row?.indexing_run_files_committed).toBe(0);
  });

  it("QA-2b: resets progress on a null-run claim when progress was committed", async () => {
    const firstRun = "00000000-0000-4000-8000-000000000057";
    await seedGithubSource("pending");
    await env.DB.prepare(
      `UPDATE knowledge_sources SET indexing_run_files_committed = 55 WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .run();

    expect(await claimIndexingRunOnSource(env.DB, SOURCE_ID, firstRun, null)).toBe(
      "claimed",
    );

    const row = await env.DB.prepare(
      `SELECT indexing_run_id, indexing_run_files_committed
       FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{
        indexing_run_id: string;
        indexing_run_files_committed: number | null;
      }>();
    expect(row?.indexing_run_id).toBe(firstRun);
    expect(row?.indexing_run_files_committed).toBe(0);
  });

  it("QA-3: a losing replace claim does not overwrite the winning run", async () => {
    const oldRun = "00000000-0000-4000-8000-000000000052";
    const winner = "00000000-0000-4000-8000-000000000053";
    const loser = "00000000-0000-4000-8000-000000000054";
    await seedGithubSource("ready");
    await env.DB.prepare(
      `UPDATE knowledge_sources
       SET indexing_run_id = ?, indexing_run_files_committed = 40
       WHERE id = ?`,
    )
      .bind(oldRun, SOURCE_ID)
      .run();

    expect(await claimIndexingRunOnSource(env.DB, SOURCE_ID, winner, oldRun)).toBe(
      "claimed",
    );
    expect(await claimIndexingRunOnSource(env.DB, SOURCE_ID, loser, oldRun)).toBe(
      "lost_race",
    );

    const row = await env.DB.prepare(
      `SELECT indexing_run_id, indexing_run_files_committed
       FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{
        indexing_run_id: string;
        indexing_run_files_committed: number | null;
      }>();
    expect(row?.indexing_run_id).toBe(winner);
    expect(row?.indexing_run_files_committed).toBe(0);
  });

  it("QA-3: a losing null-run claim does not overwrite the first assignee", async () => {
    const firstRun = "00000000-0000-4000-8000-000000000055";
    const secondRun = "00000000-0000-4000-8000-000000000056";
    await seedGithubSource("pending");

    expect(await claimIndexingRunOnSource(env.DB, SOURCE_ID, firstRun, null)).toBe(
      "claimed",
    );
    expect(await claimIndexingRunOnSource(env.DB, SOURCE_ID, secondRun, null)).toBe(
      "lost_race",
    );

    const row = await env.DB.prepare(
      `SELECT indexing_run_id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ indexing_run_id: string }>();
    expect(row?.indexing_run_id).toBe(firstRun);
  });
});

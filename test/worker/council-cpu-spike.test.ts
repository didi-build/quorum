import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "../../src/config/load-config.js";
import { runCouncilOrchestrator } from "../../src/domain/council/orchestrator.js";
import { PERSONA_IDS } from "../../src/domain/council/personas.js";
import { retrieve } from "../../src/domain/retrieval/service.js";
import { actorContext } from "../../src/domain/schemas/actor.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

/** Simulated Anthropic latency per persona (parallel) and chair (sequential). */
const MOCK_PERSONA_LATENCY_MS = 6_000;
const MOCK_CHAIR_LATENCY_MS = 4_000;

/** Paid Workers default CPU budget per HTTP request (ADR 0004 spike). */
const WORKERS_DEFAULT_CPU_MS = 30_000;

const USER_ID = "00000000-0000-4000-8000-000000000010";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000020";
const SOURCE_ID = "00000000-0000-4000-8000-000000000030";

const testEnv = () =>
  workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      AUTH_ALLOWED_GITHUB_IDS: "42",
      BOOTSTRAP_API_KEY: "test-bootstrap-api-key",
    }),
  });

async function clearData(): Promise<void> {
  await env.DB.prepare("DELETE FROM chunks").run();
  await env.DB.prepare("DELETE FROM knowledge_sources").run();
  await env.DB.prepare("DELETE FROM connections").run();
  await env.DB.prepare("DELETE FROM users").run();
}

async function seedReadySource(): Promise<number> {
  await env.DB.prepare(`INSERT INTO users (id, github_id, login) VALUES (?, 42, 'u')`)
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
      ) VALUES (?, ?, 'github_repo', 'owner/repo', ?, 'Repo', 'ready')`,
  )
    .bind(SOURCE_ID, USER_ID, CONNECTION_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO chunks (
        knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, 'README.md', 0, ?, '[]')`,
  )
    .bind(
      SOURCE_ID,
      "Council spike fixture about permissions can_access and hybrid retrieval RRF fusion.",
    )
    .run();
  const row = await env.DB.prepare(
    "SELECT id FROM chunks WHERE knowledge_source_id = ?",
  )
    .bind(SOURCE_ID)
    .first<{ id: number }>();
  return row!.id;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockCouncilClient(): {
  client: Anthropic;
  callRecords: Array<{ isChair: boolean; startMs: number; endMs: number }>;
} {
  const callRecords: Array<{ isChair: boolean; startMs: number; endMs: number }> = [];

  const create = vi.fn(async (request: { system?: string }) => {
    const isChair =
      typeof request.system === "string" &&
      request.system.includes("chair of a decision council");
    const startMs = performance.now();
    await sleep(isChair ? MOCK_CHAIR_LATENCY_MS : MOCK_PERSONA_LATENCY_MS);
    const endMs = performance.now();
    callRecords.push({ isChair, startMs, endMs });

    if (isChair) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              overall_verdict: "comment",
              synthesis: "Spike synthesis.",
            }),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            verdict: "comment",
            reasoning: "Spike persona reasoning.",
          }),
        },
      ],
    };
  });

  return {
    client: { messages: { create } } as unknown as Anthropic,
    callRecords,
  };
}

describe("council CPU and wall-time spike (DIDI-781, mocked models)", () => {
  beforeEach(async () => {
    await clearData();
  });

  it("measures council wall time only against Worker limits", async () => {
    const cfg = loadConfig(testEnv());
    const actor = actorContext(USER_ID);
    const sessionId = "00000000-0000-4000-8000-0000000000aa";
    const chunkRowId = await seedReadySource();

    const voyageFetch = vi.fn(async () =>
      Response.json({
        data: [
          {
            index: 0,
            data: [
              {
                index: 0,
                embedding: Array.from({ length: cfg.embeddingDimensions }, () => 0.02),
              },
            ],
          },
        ],
        model: cfg.voyageModel,
      }),
    );

    const vectorizeQuery = vi.fn(async () => ({
      matches: [
        {
          id: "vec-1",
          score: 0.9,
          metadata: {
            knowledge_source_id: SOURCE_ID,
            chunk_rowid: chunkRowId,
            document_id: "README.md",
            chunk_index: 0,
          },
        },
      ],
    }));
    const mockVectorize = { query: vectorizeQuery } as unknown as VectorizeIndex;

    const retrievalWallStart = performance.now();
    await Promise.all(
      PERSONA_IDS.map(() =>
        retrieve(
          {
            db: env.DB,
            vectorize: mockVectorize,
            config: cfg,
            query: "Should we change the council orchestration approach?",
            actor,
            effectiveProjectId: null,
          },
          { voyageFetch },
        ),
      ),
    );
    const tripleRetrievalWallMs = performance.now() - retrievalWallStart;

    const { client, callRecords } = mockCouncilClient();
    const councilWallStart = performance.now();
    const decision = await runCouncilOrchestrator({
      request: {
        query: "Should we change the council orchestration approach?",
        project_id: null,
      },
      actor,
      sessionId,
      db: env.DB,
      vectorize: mockVectorize,
      config: cfg,
      effectiveProjectId: null,
      client,
      searchDeps: { voyageFetch },
    });
    const councilWallMs = performance.now() - councilWallStart;

    expect(decision.persona_opinions).toHaveLength(3);

    const personaCalls = callRecords.filter((record) => !record.isChair);
    const chairCalls = callRecords.filter((record) => record.isChair);
    expect(personaCalls).toHaveLength(3);
    expect(chairCalls).toHaveLength(1);
    const personaStartSpreadMs =
      Math.max(...personaCalls.map((record) => record.startMs)) -
      Math.min(...personaCalls.map((record) => record.startMs));
    expect(personaStartSpreadMs).toBeLessThan(1_000);
    const lastPersonaEndMs = Math.max(...personaCalls.map((record) => record.endMs));
    expect(chairCalls[0]!.startMs).toBeGreaterThanOrEqual(lastPersonaEndMs - 5);

    // Spike metrics for DIDI-781 ADR note
    console.info(
      JSON.stringify({
        spike: "DIDI-781",
        tripleRetrievalWallMs: Math.round(tripleRetrievalWallMs),
        councilWallMs: Math.round(councilWallMs),
        personaStartSpreadMs: Math.round(personaStartSpreadMs),
        mockPersonaLatencyMs: MOCK_PERSONA_LATENCY_MS,
        mockChairLatencyMs: MOCK_CHAIR_LATENCY_MS,
        workersDefaultCpuLimitMs: WORKERS_DEFAULT_CPU_MS,
        note: "Wall time includes mocked LLM sleeps; CPU time excludes I/O waits per Cloudflare docs.",
      }),
    );

    expect(tripleRetrievalWallMs).toBeLessThan(WORKERS_DEFAULT_CPU_MS);
    expect(councilWallMs).toBeGreaterThan(
      MOCK_PERSONA_LATENCY_MS + MOCK_CHAIR_LATENCY_MS - 500,
    );
    expect(councilWallMs).toBeLessThan(11_500);
  }, 30_000);
});

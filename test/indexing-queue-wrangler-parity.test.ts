import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INDEXING_QUEUE_MAX_RETRIES } from "../src/jobs/indexing-queue-constants.js";

function readWranglerMaxRetries(): number {
  const raw = readFileSync(join(process.cwd(), "wrangler.jsonc"), "utf8");
  const match = raw.match(/"max_retries"\s*:\s*(\d+)/);
  if (!match) {
    throw new Error("wrangler.jsonc missing queues.consumers max_retries");
  }
  return Number.parseInt(match[1], 10);
}

describe("indexing queue retry limit", () => {
  it("matches wrangler.jsonc max_retries", () => {
    expect(INDEXING_QUEUE_MAX_RETRIES).toBe(readWranglerMaxRetries());
  });
});

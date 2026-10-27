import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it, vi } from "vitest";
import { listConnectionsByUserId } from "../../src/domain/db/connections.js";

describe("listConnectionsByUserId (unit)", () => {
  it("filters connections by user_id in SQL", async () => {
    const prepare = vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    });
    const db = { prepare } as unknown as D1Database;
    await listConnectionsByUserId(db, "user-a");
    expect(prepare).toHaveBeenCalledWith("SELECT * FROM connections WHERE user_id = ?");
    expect(prepare.mock.results[0].value.bind).toHaveBeenCalledWith("user-a");
  });
});

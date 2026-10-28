import { describe, expect, it } from "vitest";
import { HISTORY_MESSAGES_USER_SCOPE_SQL } from "../src/domain/chat/service.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

describe("chat history user scope (unit)", () => {
  it("requires user_id in history SQL", () => {
    expect(HISTORY_MESSAGES_USER_SCOPE_SQL).toBe("m.user_id = ?");
    const servicePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/domain/chat/service.ts",
    );
    const source = readFileSync(servicePath, "utf8");
    expect(source).toContain(HISTORY_MESSAGES_USER_SCOPE_SQL);
  });
});

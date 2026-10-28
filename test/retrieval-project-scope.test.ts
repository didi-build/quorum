import { describe, expect, it } from "vitest";
import { isRetrievalProjectUuid } from "../src/domain/retrieval/query-limits.js";
import { resolveRetrievalProjectScope } from "../src/domain/retrieval/project-scope.js";
import { actorContext } from "../src/domain/schemas/actor.js";

const USER = "00000000-0000-4000-8000-000000000010";
const PROJECT_P = "10000000-0000-4000-8000-000000000001";
const PROJECT_Q = "10000000-0000-4000-8000-000000000002";

describe("isRetrievalProjectUuid", () => {
  it("accepts lowercase and uppercase UUID v4 strings", () => {
    expect(isRetrievalProjectUuid("10000000-0000-4000-8000-000000000001")).toBe(true);
    expect(
      isRetrievalProjectUuid("10000000-0000-4000-8000-000000000001".toUpperCase()),
    ).toBe(true);
  });

  it("rejects non-UUID strings", () => {
    expect(isRetrievalProjectUuid("not-a-uuid")).toBe(false);
    expect(isRetrievalProjectUuid("10000000-0000-4000-8000")).toBe(false);
    expect(isRetrievalProjectUuid("")).toBe(false);
  });
});

describe("resolveRetrievalProjectScope", () => {
  it("returns 404 when a P-scoped actor sends project_id Q", () => {
    const result = resolveRetrievalProjectScope(
      actorContext(USER, PROJECT_P),
      PROJECT_Q,
    );
    expect(result).toEqual({ ok: false, status: 404, detail: "Not Found" });
  });

  it("allows a P-scoped actor when body project_id matches", () => {
    const result = resolveRetrievalProjectScope(
      actorContext(USER, PROJECT_P),
      PROJECT_P,
    );
    expect(result).toEqual({ ok: true, effectiveProjectId: PROJECT_P });
  });

  it("uses actor project when body project_id is omitted", () => {
    const result = resolveRetrievalProjectScope(
      actorContext(USER, PROJECT_P),
      undefined,
    );
    expect(result).toEqual({ ok: true, effectiveProjectId: PROJECT_P });
  });

  it("returns 400 for a non-UUID project_id", () => {
    const result = resolveRetrievalProjectScope(actorContext(USER, null), "not-a-uuid");
    expect(result).toEqual({
      ok: false,
      status: 400,
      detail: "project_id must be a UUID",
    });
  });

  it("returns 404 when an unscoped actor sends a body project_id", () => {
    const result = resolveRetrievalProjectScope(actorContext(USER, null), PROJECT_Q);
    expect(result).toEqual({ ok: false, status: 404, detail: "Not Found" });
  });
});

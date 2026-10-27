import { describe, expect, it } from "vitest";
import {
  GITHUB_ACCESS_LOST_DETAIL,
  LINEAR_ACCESS_LOST_DETAIL,
  mapGithubResourceHttpStatus,
  mapGithubTokenExchangeHttpStatus,
  mapLinearGraphqlErrors,
  markAlreadyAdded,
  mergeGithubRepositoryPages,
  PROVIDER_ERROR_DETAIL,
} from "../src/domain/connections/available-sources.js";
import type { AvailableSourceItem } from "../src/domain/schemas/available-sources.js";

describe("available-sources (unit)", () => {
  it("markAlreadyAdded sets source_id", () => {
    const sourceId = crypto.randomUUID();
    const items: AvailableSourceItem[] = [
      {
        source_type: "github_repo",
        external_ref: "owner/added",
        name: "owner/added",
        private: null,
        updated_at: null,
        key: null,
        already_added: false,
        source_id: null,
      },
      {
        source_type: "github_repo",
        external_ref: "owner/new",
        name: "owner/new",
        private: null,
        updated_at: null,
        key: null,
        already_added: false,
        source_id: null,
      },
    ];
    const existing = new Map([["github_repo:owner/added", sourceId]]);

    const marked = markAlreadyAdded(items, existing);

    expect(marked[0].already_added).toBe(true);
    expect(marked[0].source_id).toBe(sourceId);
    expect(marked[1].already_added).toBe(false);
    expect(marked[1].source_id).toBeNull();
  });

  it("mergeGithubRepositoryPages across multiple pages", () => {
    const pages = [
      [
        {
          full_name: "org/repo-one",
          private: true,
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      [
        {
          full_name: "org/repo-two",
          private: false,
          updated_at: "2026-02-01T12:30:00Z",
        },
      ],
    ];

    const items = mergeGithubRepositoryPages(pages);

    expect(items).toHaveLength(2);
    expect(items[0].external_ref).toBe("org/repo-one");
    expect(items[0].private).toBe(true);
    expect(items[0].updated_at).toBe("2026-01-01T00:00:00Z");
    expect(items[1].external_ref).toBe("org/repo-two");
    expect(items[1].name).toBe("org/repo-two");
  });

  it("mapGithubTokenExchangeHttpStatus maps 404 to 403", () => {
    const error = mapGithubTokenExchangeHttpStatus(404);
    expect(error.statusCode).toBe(403);
    expect(error.detail).toBe(GITHUB_ACCESS_LOST_DETAIL);
  });

  it("mapGithubResourceHttpStatus maps 404 to 502", () => {
    const error = mapGithubResourceHttpStatus(404);
    expect(error.statusCode).toBe(502);
    expect(error.detail).toBe(PROVIDER_ERROR_DETAIL);
  });

  it("mapLinearGraphqlErrors maps auth codes to 403", () => {
    const error = mapLinearGraphqlErrors([
      { message: "not allowed", extensions: { code: "FORBIDDEN" } },
    ]);
    expect(error.statusCode).toBe(403);
    expect(error.detail).toBe(LINEAR_ACCESS_LOST_DETAIL);
  });

  it("mapLinearGraphqlErrors maps other codes to 502", () => {
    const error = mapLinearGraphqlErrors([
      { message: "bad input", extensions: { code: "INPUT_ERROR" } },
    ]);
    expect(error.statusCode).toBe(502);
    expect(error.detail).toBe(PROVIDER_ERROR_DETAIL);
  });
});

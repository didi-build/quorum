import { describe, expect, it, vi } from "vitest";
import { fetchLinearTeamDocuments } from "../src/domain/ingestion/adapters/linear.js";

describe("fetchLinearTeamDocuments", () => {
  it("formats issue text and pages through GraphQL cursors", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        variables?: { after?: string | null };
      };
      calls.push(body.variables?.after ?? "start");

      if (body.variables?.after === "cursor-1") {
        return new Response(
          JSON.stringify({
            data: {
              team: {
                issues: {
                  nodes: [
                    {
                      id: "issue-2",
                      identifier: "DIDI-2",
                      title: "Second",
                      description: "Body two",
                      state: { name: "Done" },
                      priority: 2,
                      url: "https://linear.app/issue/2",
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          data: {
            team: {
              issues: {
                nodes: [
                  {
                    id: "issue-1",
                    identifier: "DIDI-1",
                    title: "First",
                    description: "Body one",
                    state: { name: "Todo" },
                    priority: 1,
                    url: "https://linear.app/issue/1",
                  },
                ],
                pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
              },
            },
          },
        }),
        { status: 200 },
      );
    });

    const documents = await fetchLinearTeamDocuments("token", "team-uuid", fetchImpl);

    expect(calls).toEqual(["start", "cursor-1"]);
    expect(documents).toHaveLength(2);
    expect(documents[0].content).toBe(
      "# DIDI-1: First\n\nState: Todo\nPriority: 1\nURL: https://linear.app/issue/1\n\nBody one",
    );
    expect(documents[1].document_id).toBe("issue-2");
  });
});

import type { LinearFetch } from "../../oauth/linear.js";
import { IndexingHttpError } from "../errors.js";
import type { FetchedDocument } from "./types.js";

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

const TEAM_ISSUES_QUERY = `
query TeamIssues($teamId: String!, $after: String) {
  team(id: $teamId) {
    issues(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        identifier
        title
        description
        state { name }
        priority
        url
      }
    }
  }
}
`;

export async function fetchLinearTeamDocuments(
  accessToken: string,
  teamId: string,
  fetchImpl: LinearFetch = fetch,
): Promise<FetchedDocument[]> {
  const documents: FetchedDocument[] = [];
  let after: string | null = null;

  while (true) {
    const response = await fetchImpl(LINEAR_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: TEAM_ISSUES_QUERY,
        variables: { teamId, after },
      }),
    });

    if (!response.ok) {
      throw new IndexingHttpError(response.status);
    }

    const payload = (await response.json()) as {
      data?: {
        team?: {
          issues?: {
            nodes?: Array<Record<string, unknown>>;
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          };
        } | null;
      };
    };

    const team = payload.data?.team;
    if (!team) {
      break;
    }

    const issues = team.issues?.nodes ?? [];
    for (const issue of issues) {
      const description =
        typeof issue.description === "string" ? issue.description : "";
      const identifier = String(issue.identifier ?? "");
      const title = String(issue.title ?? "");
      const state = (issue.state as { name?: string } | undefined)?.name ?? "";
      const priority = issue.priority;
      const url = issue.url;
      const content = `# ${identifier}: ${title}\n\nState: ${state}\nPriority: ${priority}\nURL: ${url}\n\n${description}`;
      documents.push({
        document_id: String(issue.id),
        content,
      });
    }

    const pageInfo = team.issues?.pageInfo;
    if (!pageInfo?.hasNextPage) {
      break;
    }
    after = pageInfo.endCursor ?? null;
  }

  return documents;
}

import type {
  Connection,
  AvailableSourceItem,
  CreateSourceInput,
} from "../../../types/connections";
import type { KnowledgeSource, SourceStatus } from "../../../types/sources";
import { SourcesApiError } from "./errors";
import type { SourcesApi } from "./types";

const GITHUB_CONNECTION_ID = "conn-github";
const LINEAR_CONNECTION_ID = "conn-linear";

const initialConnections: Connection[] = [
  {
    id: GITHUB_CONNECTION_ID,
    provider: "github",
    connected: true,
    account_label: "didi-build",
  },
  {
    id: LINEAR_CONNECTION_ID,
    provider: "linear",
    connected: true,
    account_label: "Didi Build",
  },
];

const initialSources: KnowledgeSource[] = [
  {
    id: "src-1",
    user_id: "u1",
    project_id: null,
    source_type: "github_repo",
    external_ref: "didi-build/quorum",
    connection_id: GITHUB_CONNECTION_ID,
    name: "didi-build/quorum",
    status: "ready",
    status_message: null,
    last_indexed_at: "2026-10-20T12:00:00Z",
    created_at: "2026-10-18T12:00:00Z",
    updated_at: "2026-10-20T12:00:00Z",
  },
  {
    id: "src-2",
    user_id: "u1",
    project_id: null,
    source_type: "github_repo",
    external_ref: "didi-build/launchpad",
    connection_id: GITHUB_CONNECTION_ID,
    name: "didi-build/launchpad",
    status: "indexing",
    status_message: null,
    last_indexed_at: null,
    created_at: "2026-10-22T12:00:00Z",
    updated_at: "2026-10-22T12:00:00Z",
  },
  {
    id: "src-3",
    user_id: "u1",
    project_id: null,
    source_type: "linear",
    external_ref: "team-didi-build",
    connection_id: LINEAR_CONNECTION_ID,
    name: "Didi Build",
    status: "pending",
    status_message: null,
    last_indexed_at: null,
    created_at: "2026-10-23T12:00:00Z",
    updated_at: "2026-10-23T12:00:00Z",
  },
  {
    id: "src-4",
    user_id: "u1",
    project_id: null,
    source_type: "github_repo",
    external_ref: "didi-build/we-met",
    connection_id: GITHUB_CONNECTION_ID,
    name: "didi-build/we-met",
    status: "error",
    status_message: "GitHub returned 404 for this repository.",
    last_indexed_at: null,
    created_at: "2026-10-19T12:00:00Z",
    updated_at: "2026-10-21T12:00:00Z",
  },
];

const githubRepos: AvailableSourceItem[] = [
  {
    name: "didi-build/quorum",
    external_ref: "didi-build/quorum",
    private: true,
    key: "gh-quorum",
    already_added: true,
  },
  {
    name: "didi-build/launchpad",
    external_ref: "didi-build/launchpad",
    private: true,
    key: "gh-launchpad",
    already_added: true,
  },
  {
    name: "didi-build/legacy-api",
    external_ref: "didi-build/legacy-api",
    private: true,
    key: "gh-legacy",
    already_added: false,
  },
  {
    name: "didi-build/nodrift",
    external_ref: "didi-build/nodrift",
    private: false,
    key: "gh-nodrift",
    already_added: false,
  },
];

const linearTeams: AvailableSourceItem[] = [
  {
    name: "Didi Build",
    external_ref: "team-didi-build",
    private: false,
    key: "lin-didi",
    already_added: true,
  },
  {
    name: "Launchpad",
    external_ref: "team-launchpad",
    private: false,
    key: "lin-launchpad",
    already_added: false,
  },
];

export interface MockSourcesOptions {
  connections?: Connection[];
  sources?: KnowledgeSource[];
  availableError?: { connectionId: string; status: number; provider?: string };
}

export function createMockSourcesApi(options: MockSourcesOptions = {}): SourcesApi {
  const connections = [...(options.connections ?? initialConnections)];
  let sources = [...(options.sources ?? initialSources)];
  const availableError = options.availableError;

  const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

  return {
    async listConnections() {
      await delay();
      return connections.map((c) => ({ ...c }));
    },

    async listSources() {
      await delay();
      return sources.map((s) => ({ ...s }));
    },

    async refreshSource(id) {
      await delay(50);
      const index = sources.findIndex((s) => s.id === id);
      if (index < 0) {
        throw new SourcesApiError(404, "Source not found");
      }
      const updated: KnowledgeSource = {
        ...sources[index],
        status: "indexing",
        status_message: null,
        updated_at: new Date().toISOString(),
      };
      sources[index] = updated;
      return { ...updated };
    },

    async deleteSource(id) {
      await delay(50);
      sources = sources.filter((s) => s.id !== id);
    },

    async listAvailableSources(connectionId, provider) {
      await delay(50);
      if (availableError?.connectionId === connectionId) {
        throw new SourcesApiError(
          availableError.status,
          "mock error",
          availableError.provider ?? provider,
        );
      }
      const connection = connections.find((c) => c.id === connectionId);
      if (!connection?.connected) {
        throw new SourcesApiError(403, "not connected", connection?.provider);
      }
      if (connection.provider === "github") {
        return githubRepos.map((item) => ({
          ...item,
          already_added: sources.some(
            (s) =>
              s.source_type === "github_repo" && s.external_ref === item.external_ref,
          ),
        }));
      }
      return linearTeams.map((item) => ({
        ...item,
        already_added: sources.some(
          (s) => s.source_type === "linear" && s.external_ref === item.external_ref,
        ),
      }));
    },

    async createSources(items: CreateSourceInput[]) {
      await delay(80);
      const created = items.map((item, index) => {
        const id = `src-new-${Date.now()}-${index}`;
        const row: KnowledgeSource = {
          id,
          user_id: "u1",
          project_id: null,
          source_type: item.source_type,
          external_ref: item.external_ref,
          connection_id: item.connection_id,
          name: item.name,
          status: "pending",
          status_message: null,
          last_indexed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        sources.push(row);
        return row;
      });
      return created.map((s) => ({ ...s }));
    },
  };
}

export function mockConnectionsNone(): Connection[] {
  return [
    {
      id: GITHUB_CONNECTION_ID,
      provider: "github",
      connected: false,
      account_label: null,
    },
    {
      id: LINEAR_CONNECTION_ID,
      provider: "linear",
      connected: false,
      account_label: null,
    },
  ];
}

export function mockSourcesEmpty(): KnowledgeSource[] {
  return [];
}

export function advanceMockSourceStatus(
  sources: KnowledgeSource[],
  id: string,
  status: SourceStatus,
): KnowledgeSource[] {
  return sources.map((s) => (s.id === id ? { ...s, status } : s));
}

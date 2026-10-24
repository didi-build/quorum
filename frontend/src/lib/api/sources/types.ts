import type {
  Connection,
  AvailableSourceItem,
  CreateSourceInput,
} from "../../../types/connections";
import type { KnowledgeSource } from "../../../types/sources";

export interface SourcesApi {
  listConnections(): Promise<Connection[]>;
  listSources(): Promise<KnowledgeSource[]>;
  refreshSource(id: string): Promise<KnowledgeSource>;
  deleteSource(id: string): Promise<void>;
  listAvailableSources(
    connectionId: string,
    provider?: Connection["provider"],
  ): Promise<AvailableSourceItem[]>;
  createSources(items: CreateSourceInput[]): Promise<KnowledgeSource[]>;
}

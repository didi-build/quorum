import type { ConnectionProvider } from "../schemas/connections.js";
import type { SourceType } from "../schemas/sources.js";

/** Returns an API error detail when the type does not match the connection provider. */
export function sourceTypeMismatchDetail(
  sourceType: SourceType,
  provider: ConnectionProvider,
): string | null {
  if (sourceType === "github_repo" && provider !== "github") {
    return "github_repo sources require a GitHub connection";
  }
  if (sourceType === "linear" && provider !== "linear") {
    return "linear sources require a Linear connection";
  }
  return null;
}

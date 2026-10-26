import type { QuorumConfig } from "../../config/types.js";

export function isGithubIdAllowed(config: QuorumConfig, githubId: number): boolean {
  return config.allowedGithubIds.has(githubId);
}

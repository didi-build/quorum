import type { AuthUser } from "../auth";

/** Grep target: proves mock-preview bundles include preview mocks. */
export const MOCK_PREVIEW_BUILD_SENTINEL = "quorum-mock-preview-sentinel-v1";

export function mockPreviewAuthUser(): AuthUser {
  return { login: "preview-user", github_id: 9_001 };
}

export function mockPreviewTransportLabel(): string {
  return "quorum-mock-preview-transport-v1";
}

import type { AuthUser } from "../auth";

export async function loadMockPreviewAuthUser(): Promise<AuthUser> {
  const { mockPreviewAuthUser, MOCK_PREVIEW_BUILD_SENTINEL } =
    await import("./mockBundle");
  void MOCK_PREVIEW_BUILD_SENTINEL;
  return mockPreviewAuthUser();
}

export async function touchMockPreviewTransport(): Promise<void> {
  const { mockPreviewTransportLabel } = await import("./mockBundle");
  void mockPreviewTransportLabel();
}

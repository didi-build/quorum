/** True when Vite serves the app in dev or in the mock-preview production build. */
export function isMockPreviewRuntime(): boolean {
  if (import.meta.env.PROD && import.meta.env.MODE !== "mock-preview") {
    return false;
  }
  return import.meta.env.DEV || import.meta.env.MODE === "mock-preview";
}

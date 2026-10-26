export interface SourcesEnv {
  DEV: boolean;
  PROD: boolean;
  MODE?: string;
  VITE_SOURCES_MOCK?: string;
}

/** Whether the dev and mock-preview mock backend should load (never in production). */
export function resolveSourcesMockMode(env: SourcesEnv): "mock" | "http" {
  if (env.VITE_SOURCES_MOCK === "false") {
    return "http";
  }
  if (env.DEV || env.MODE === "mock-preview") {
    return "mock";
  }
  if (env.PROD) {
    return "http";
  }
  return "http";
}
